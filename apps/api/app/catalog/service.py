import uuid
from collections.abc import AsyncIterator, Iterable, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.catalog.images import image_shade_keys
from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.catalog.results import CatalogSuggestions, ImageArrangement, VariantSpec
from app.catalog.rich_text import Description, description_from_html
from app.catalog.search import normalize_search
from app.catalog.shades import ShadeLabel, normalize_shade, shade_key
from app.catalog.sorting import DEFAULT_ORDER, ProductOrder
from app.common.limits import (
    MAX_FEATURED_PRODUCTS,
    MAX_PRODUCT_IMAGES,
    MAX_PRODUCT_VARIANTS,
)
from app.orders.models import OrderItem


class SlugAlreadyExistsError(Exception):
    pass


# Postgres' SQLSTATE for a unique-constraint violation.
UNIQUE_VIOLATION = "23505"


def _variant_key(variant: ProductVariant) -> tuple[int | None, str | None]:
    """What identifies a variant within its product — the unique index's own key."""
    return variant.volume_ml, shade_key(variant.shade)


def _spec_key(spec: VariantSpec) -> tuple[int | None, str | None]:
    return spec.volume_ml, shade_key(spec.shade)


def _tags_fit(
    variants: Sequence[ProductVariant], volumes_ml: Sequence[int], shades: Sequence[str]
) -> bool:
    """Whether photo tags name only what the product is sold in — empty lists are "any".

    Every volume and every shade has to be a live one, and together they have to meet in
    at least one variant: "50 ml, 05 Rose" on a product whose 50 ml does not come in
    that shade is a photo of nothing. A combination that is partly empty — 30 and 50 ml
    with "01 Nude", sold in 30 ml only — is accepted: the photo shows what does exist.
    """
    live_volumes = {variant.volume_ml for variant in variants}
    live_shades = {shade_key(variant.shade) for variant in variants}
    keys = {shade_key(shade) for shade in shades}
    if not set(volumes_ml) <= live_volumes or not keys <= live_shades:
        return False
    return any(
        (not volumes_ml or variant.volume_ml in volumes_ml)
        and (not keys or shade_key(variant.shade) in keys)
        for variant in variants
    )


def clean_tags(
    volumes_ml: Iterable[int], shades: Iterable[str | None]
) -> tuple[list[int], list[str]]:
    """Photo tags as they are stored: each volume and shade once, shades normalised.

    Volumes ascending, shades in the order given, the first spelling of a shade winning
    over a later one in another case — "05 Rose" and "05 rose" are one shade.
    """
    unique_shades: dict[str, str] = {}
    for raw in shades:
        shade = normalize_shade(raw)
        key = shade_key(shade)
        if shade is not None and key is not None:
            unique_shades.setdefault(key, shade)
    return sorted(set(volumes_ml)), list(unique_shades.values())


def _same_tags(
    image: ProductImage, volumes_ml: Sequence[int], shades: Sequence[str], hidden: bool
) -> bool:
    return (
        image.hidden == hidden
        and set(image.volumes_ml or []) == set(volumes_ml)
        and image_shade_keys(image) == {key for key in map(shade_key, shades) if key is not None}
    )


@asynccontextmanager
async def _slug_conflict_as_error(session: AsyncSession) -> AsyncIterator[None]:
    """Turns a lost race for a slug into the same 409 the pre-check produces.

    Both `products.slug` and `categories.slug` are UNIQUE, and checking before writing
    only narrows the window — it cannot close it. Two writers past the check (the catalog
    import running while the owner saves a product by hand, most plausibly) meant the
    loser got a 500 on what is an ordinary, well-understood conflict.

    The savepoint is the point: without it the failed statement aborts the whole
    request's transaction, so the router could not go on to report anything at all.
    """
    try:
        async with session.begin_nested():
            yield
    except IntegrityError as error:
        # Only a unique violation is a slug conflict. Every IntegrityError used to be
        # reported as one, so a product saved against a category deleted in another tab —
        # a foreign-key violation — came back as «Товар с таким адресом (slug) уже есть.
        # Измените slug», advice that cannot fix it. 23505 is the SQLSTATE for
        # unique_violation; asyncpg carries it on the wrapped exception.
        if getattr(error.orig, "sqlstate", None) != UNIQUE_VIOLATION:
            raise
        raise SlugAlreadyExistsError from error


class CategoryNotFoundError(Exception):
    pass


class CategoryParentNotFoundError(Exception):
    """The section a category was put into does not exist (deleted in another tab)."""


class CategoryNestingError(Exception):
    """A second level of nesting was asked for, or a category was put inside itself.

    Categories nest one level deep: a section and its subcategories. That is all a
    cosmetics catalogue needs, and a filter list indented twice stops being readable.
    """


class ProductNotFoundError(Exception):
    pass


class ProductImageNotFoundError(Exception):
    pass


class EmptyVariantsError(Exception):
    """A product was asked to have no volumes at all.

    Refused rather than accommodated: every price the shop shows is a variant's price,
    so a product without one is a catalog entry nobody can order and the storefront has
    no number to print.
    """


class DuplicateVariantVolumeError(Exception):
    """The same variant — the same volume and shade — twice in one product's list."""


class TooManyVariantsError(Exception):
    """Past `MAX_PRODUCT_VARIANTS` variants on one product."""


class ShadeMissingError(Exception):
    """Some of a product's variants name a shade and some do not.

    A product comes in shades or it does not. A nameless variant next to "01 Nude" and
    "05 Rose" would be a button with nothing on it, and in practice it is a missed cell.
    """


class ShadePricesDifferError(Exception):
    """Two shades of the same volume were given different prices.

    The price follows the volume: a lipstick costs the same in every shade, and the
    storefront says so by printing one price over the shade buttons. Refused rather than
    resolved, because which of the two numbers was meant is the owner's call.
    """


class TooManyImagesError(Exception):
    """Past `MAX_PRODUCT_IMAGES` photos on one product."""


class ImageArrangementError(Exception):
    """A gallery was saved that is not this product's gallery — a photo missing, extra
    or twice. Another tab added or removed one since the form loaded."""


class ImageTagUnknownError(Exception):
    """A photo was tagged with a volume or a shade the product is not sold in, or with
    volumes and shades that meet in no variant."""


class ProductHasVariantsError(Exception):
    """A single price, volume or stock flag was sent to a product that is sold in several.

    `price_cents`, `volume_ml` and `in_stock` on the product are shorthand for "the only
    variant" and stay writable as long as there is only one — which is what keeps the
    xlsx import and every older client working. Once the owner adds a second volume,
    those fields are derived and the only way to move them is the variants list itself;
    silently applying one price to every volume would undo the split.
    """


class FeaturedLimitError(Exception):
    """A product was pinned to the home page while `MAX_FEATURED_PRODUCTS` already are.

    Refused rather than resolved by unpinning the oldest: which card leaves the home page
    is the owner's call, and a save that silently took another product off it would be
    noticed, if at all, on the storefront.
    """


class CategoryService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[Category]:
        result = await self._session.execute(
            select(Category).order_by(Category.sort_order, Category.name)
        )
        return list(result.scalars().all())

    async def create(
        self,
        name: str,
        slug: str,
        sort_order: int | None = None,
        parent_id: uuid.UUID | None = None,
    ) -> Category:
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        await self._check_parent(None, parent_id)
        if sort_order is None:
            sort_order = await self._next_sort_order()
        category = Category(name=name, slug=slug, sort_order=sort_order, parent_id=parent_id)
        async with _slug_conflict_as_error(self._session):
            self._session.add(category)
        return category

    async def update(self, category_id: uuid.UUID, updates: dict[str, Any]) -> Category:
        category = await self._session.get(Category, category_id)
        if category is None:
            raise CategoryNotFoundError

        new_slug = updates.get("slug")
        if new_slug is not None and new_slug != category.slug and await self._slug_taken(new_slug):
            raise SlugAlreadyExistsError

        if "parent_id" in updates:
            await self._check_parent(category, updates["parent_id"])

        for field, value in updates.items():
            setattr(category, field, value)

        async with _slug_conflict_as_error(self._session):
            await self._session.flush()
        return category

    async def delete(self, category_id: uuid.UUID) -> None:
        category = await self._session.get(Category, category_id)
        if category is None:
            raise CategoryNotFoundError
        await self._session.delete(category)

    async def _check_parent(self, category: Category | None, parent_id: uuid.UUID | None) -> None:
        """Refuses a parent that would make the tree deeper than one level.

        `category` is None on create, where there are no subcategories to worry about.

        Both rows are locked, and re-read under the lock, for the rest of the transaction.
        Without that, two tabs could each pass the check against the other's unwritten
        change (X into Y, Z into X) and commit a second level, which no list shows. Every
        change of parent locks the parent it names, so a concurrent one waits on the
        shared row and then sees the committed state. The rows are locked in id order in
        one statement, so two moves in opposite directions cannot deadlock.
        """
        if parent_id is None:
            return
        if category is not None and parent_id == category.id:
            raise CategoryNestingError
        ids = [parent_id] if category is None else [parent_id, category.id]
        locked = await self._session.scalars(
            select(Category)
            .where(Category.id.in_(ids))
            .order_by(Category.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        parent = next((row for row in locked if row.id == parent_id), None)
        if parent is None:
            raise CategoryParentNotFoundError
        if parent.parent_id is not None:
            raise CategoryNestingError
        if category is not None:
            has_children = await self._session.scalar(
                select(Category.id).where(Category.parent_id == category.id).limit(1)
            )
            if has_children is not None:
                raise CategoryNestingError

    async def _next_sort_order(self) -> int:
        """One past the last category — the same rule the xlsx import follows.

        Zero would have been simpler and wrong: every category created without a number
        would share it, and their order between themselves would then be whatever the
        database felt like on the day.
        """
        highest = await self._session.scalar(select(func.max(Category.sort_order)))
        return 0 if highest is None else highest + 1

    async def _slug_taken(self, slug: str) -> bool:
        result = await self._session.execute(select(Category.id).where(Category.slug == slug))
        return result.scalar_one_or_none() is not None


# How many spellings of one brand the suggestion query allows for. Brands collapse by
# case after the fetch, so the SQL limit has to be wider than the group it fills, and this
# is the width: three ways of writing the same name is already a catalogue that needs
# tidying, not a dropdown that needs a bigger limit.
BRAND_CASING_HEADROOM = 3


def like_pattern(search: str) -> str:
    """An infix ILIKE pattern for the *_norm columns, wildcards taken literally.

    Normalised first, escaped second, and the order is not a detail: escaping inserts
    backslashes, and `normalize_search` drops backslashes, so doing it the other way
    round would quietly unescape whatever it had just escaped.

    Escaped rather than stripped: someone searching for "50%" means a product whose
    name contains "50%", and an unescaped `%` would have matched the whole catalog.
    `%` and `_` survive normalisation for that reason (`catalog/search.py`).
    """
    normalized = normalize_search(search)
    escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class ProductService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _search_category_ids(self, search: str) -> list[uuid.UUID]:
        """Ids of the categories whose name matches, resolved before the product query.

        A separate round trip rather than an EXISTS inside the `OR`, and the difference
        is the whole point: a subquery in a disjunction makes it unindexable, so the
        planner drops both trigram indexes and reads every product row — the name arm
        included, which was indexed before search grew past the name. Plain ids turn the
        third arm into `category_id IN (…)`, which a bitmap OR combines with them
        (`ix_products_category_id`). Categories are tens of rows; the scan this removes
        is the whole catalogue.

        A matching section brings its subcategories along, for the same reason the
        `category=` filter does: "уход за лицом" means the cleansers inside it too.
        """
        matching = select(Category.id).where(
            Category.name_norm.ilike(like_pattern(search), escape="\\")
        )
        result = await self._session.execute(
            select(Category.id).where(
                or_(Category.id.in_(matching), Category.parent_id.in_(matching))
            )
        )
        return list(result.scalars().all())

    def _filtered_query(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        search: str | None,
        include_deleted: bool,
        brand: str | None = None,
        search_category_ids: Sequence[uuid.UUID] = (),
        featured: bool | None = None,
    ) -> Select[tuple[Product]]:
        query = select(Product)
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))
        if category_slug is not None:
            # The category itself and, for a section, every subcategory in it. A subquery
            # rather than a join, so the search arm below never meets a second `categories`
            # in the FROM; unlike that arm it is ANDed, so the planner keeps its indexes.
            named = select(Category.id).where(Category.slug == category_slug)
            query = query.where(
                Product.category_id.in_(
                    select(Category.id).where(
                        or_(Category.id.in_(named), Category.parent_id.in_(named))
                    )
                )
            )
        if brand is not None:
            # Case-insensitive, like everything else brand-related: writes go
            # through canonical_brand(), but rows imported before that (or by a
            # sloppy xlsx) can still hold "round lab" next to "Round Lab", and a
            # filter that split them would show half the brand's products.
            query = query.where(func.lower(Product.brand) == brand.lower())
        if in_stock is not None:
            query = query.where(Product.in_stock.is_(in_stock))
        if featured is not None:
            query = query.where(Product.is_featured.is_(featured))
        if search:
            pattern = like_pattern(search)
            # Name, brand and category together, because the header search is one field
            # for all three: someone typing "Round Lab" or "тонеры" means the products,
            # not a literal name match, and a name-only `q` answered them with nothing.
            # The category arm is a plain id list (`_search_category_ids`) rather than a
            # join or an EXISTS: a join would collide with the one `category_slug` above
            # may already have made, and an EXISTS would cost both trigram indexes.
            arms = [
                Product.name_norm.ilike(pattern, escape="\\"),
                Product.brand_norm.ilike(pattern, escape="\\"),
            ]
            if search_category_ids:
                arms.append(Product.category_id.in_(search_category_ids))
            query = query.where(or_(*arms))
        return query

    async def _paginate(
        self, query: Select[tuple[Product]], page: int, page_size: int, order: ProductOrder
    ) -> tuple[list[Product], int]:
        total = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0

        result = await self._session.execute(
            query.options(selectinload(Product.images), selectinload(Product.variants))
            # Always a total order — see `ProductOrder.clauses` for why the tie-breakers
            # are not optional under pagination.
            .order_by(*order.clauses())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_public(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        page: int,
        page_size: int,
        search: str | None = None,
        brand: str | None = None,
        order: ProductOrder = DEFAULT_ORDER,
        featured: bool | None = None,
    ) -> tuple[list[Product], int]:
        query = self._filtered_query(
            category_slug,
            in_stock,
            search,
            include_deleted=False,
            brand=brand,
            search_category_ids=await self._search_category_ids(search) if search else (),
            featured=featured,
        )
        return await self._paginate(query, page, page_size, order)

    async def list_admin(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        page: int,
        page_size: int,
        search: str | None = None,
        include_deleted: bool = False,
        brand: str | None = None,
        order: ProductOrder = DEFAULT_ORDER,
        featured: bool | None = None,
    ) -> tuple[list[Product], int]:
        """Admin listing — unlike list_public it can surface soft-deleted products."""
        query = self._filtered_query(
            category_slug,
            in_stock,
            search,
            include_deleted,
            brand,
            search_category_ids=await self._search_category_ids(search) if search else (),
            featured=featured,
        )
        return await self._paginate(query, page, page_size, order)

    async def list_brands(self, include_deleted: bool = False) -> list[str]:
        """Distinct brands actually present in the catalog.

        Feeds both the filter dropdown and the autocomplete on the product form.

        Brands are a free-text column rather than their own table (they arrive
        with the xlsx import), so the option list has to be derived from the
        products themselves. Blank strings are dropped alongside NULLs — the
        import writes None for an empty cell, but hand-edited rows may not.

        Case only ever differs by accident, so variants collapse into one entry
        (the first spelling in alphabetical order wins). Without that the filter
        and the autocomplete would offer "Round Lab" and "round lab" as two
        separate brands, which is exactly the confusion this list is meant to
        prevent.
        """
        query = select(Product.brand).where(Product.brand.is_not(None), Product.brand != "")
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))

        result = await self._session.execute(query.distinct().order_by(Product.brand))

        brands: list[str] = []
        seen: set[str] = set()
        for brand in result.scalars().all():
            if brand is None or brand.lower() in seen:
                continue
            seen.add(brand.lower())
            brands.append(brand)
        return brands

    async def suggest(
        self, search: str, product_limit: int = 5, group_limit: int = 5
    ) -> CatalogSuggestions:
        """What to offer while someone is still typing in the header.

        Deliberately not one ranked list: the three groups answer three different
        intents, and mixing them would bury the two cheap, decisive hits (a category,
        a brand) under whichever products happened to sort first alphabetically.

        Only live products count, and a category is offered only when it still has
        one, directly or in a subcategory — an empty catalog behind a suggestion is
        worse than no suggestion. Only categories whose own name matches are offered:
        the subcategories `_search_category_ids` adds widen the products, not the list.
        """
        pattern = like_pattern(search)
        # Resolved once and used twice: the offered categories are these, and the same
        # ids are what makes the product query's category arm indexable.
        category_ids = await self._search_category_ids(search)
        subcategory = aliased(Category)

        category_result = await self._session.execute(
            select(Category)
            .where(
                Category.id.in_(category_ids),
                Category.name_norm.ilike(pattern, escape="\\"),
                or_(
                    Category.products.any(Product.deleted_at.is_(None)),
                    Category.id.in_(
                        select(subcategory.parent_id).where(
                            subcategory.products.any(Product.deleted_at.is_(None))
                        )
                    ),
                ),
            )
            .order_by(Category.sort_order, Category.name)
            .limit(group_limit)
        )

        # Capped in SQL as well as below, with room for the spellings the loop collapses:
        # unlike `/brands`, this runs on a public endpoint once per debounced keystroke,
        # and a one-letter query otherwise drags back every brand in the catalogue to
        # throw all but five of them away. The headroom is what keeps the cap honest —
        # five rows still come out five even when every brand is written two ways.
        brand_result = await self._session.execute(
            select(Product.brand)
            .where(
                Product.brand.is_not(None),
                Product.brand != "",
                Product.brand_norm.ilike(pattern, escape="\\"),
                Product.deleted_at.is_(None),
            )
            .distinct()
            .order_by(Product.brand)
            .limit(group_limit * BRAND_CASING_HEADROOM)
        )

        # Same case-collapsing as `list_brands`, and for the same reason: "round lab"
        # and "Round Lab" are one brand, and offering both as separate rows in a
        # five-line dropdown wastes two of them.
        brands: list[str] = []
        seen: set[str] = set()
        for brand in brand_result.scalars().all():
            if brand is None or brand.lower() in seen:
                continue
            seen.add(brand.lower())
            brands.append(brand)
            if len(brands) == group_limit:
                break

        # A name match first, the rest after: the five rows are the whole dropdown, and
        # a product actually called what the person typed must not be pushed out of them
        # by whatever brand or category match happens to sort earlier alphabetically.
        product_result = await self._session.execute(
            self._filtered_query(
                None,
                None,
                search,
                include_deleted=False,
                search_category_ids=category_ids,
            )
            # Variants too: the row says "от N ₽" for a product sold in several, and
            # `volume_ml` alone cannot tell that apart from a product with no volume.
            .options(selectinload(Product.images), selectinload(Product.variants))
            .order_by(
                Product.name_norm.ilike(pattern, escape="\\").desc(), Product.name, Product.id
            )
            .limit(product_limit)
        )

        return CatalogSuggestions(
            categories=list(category_result.scalars().all()),
            brands=brands,
            products=list(product_result.scalars().all()),
        )

    async def canonical_brand(self, brand: str) -> str:
        """The spelling the catalog already uses for this brand, if it knows one.

        "round lab" typed into the product form must not become a second brand
        next to "Round Lab": brands have no table of their own, so the stored
        string *is* the identity, and two casings of it split the catalog filter
        in two. Soft-deleted products count as known spellings — a brand whose
        products were all deleted still shouldn't come back re-cased.

        An unknown brand is kept exactly as typed: this normalizes case, it does
        not police it. Emptiness is not this method's problem — the request
        schema rejects a blank brand before it gets here.
        """
        brand = brand.strip()

        result = await self._session.execute(
            select(Product.brand)
            .where(func.lower(Product.brand) == brand.lower())
            # Ordered only so that legacy rows holding several casings of the same
            # brand resolve to the same one every time, instead of to whichever
            # row the planner happened to reach first.
            .order_by(Product.brand)
            .limit(1)
        )
        return result.scalar_one_or_none() or brand

    async def get_by_slug(self, slug: str, include_deleted: bool = False) -> Product | None:
        """The product at this address, optionally including a withdrawn one.

        `include_deleted` exists for the public product page: a slug that was never in
        the catalogue and a slug whose product the owner withdrew need different answers
        (404 against 410), and telling them apart takes looking past the soft-delete
        filter. Every other caller wants the filtered view, which is why it is off by
        default — the withdrawn product must not leak into a listing or a cart.
        """
        conditions = [Product.slug == slug]
        if not include_deleted:
            conditions.append(Product.deleted_at.is_(None))

        result = await self._session.execute(
            select(Product)
            .where(*conditions)
            .options(selectinload(Product.images), selectinload(Product.variants))
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, product_id: uuid.UUID) -> Product:
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .options(selectinload(Product.images), selectinload(Product.variants))
        )
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundError
        return product

    async def create(
        self,
        name: str,
        slug: str,
        description: str | None,
        brand: str,
        price_cents: int,
        category_id: uuid.UUID | None,
        in_stock: bool,
        volume_ml: int | None = None,
        variants: Sequence[VariantSpec] | None = None,
        description_html: str | None = None,
        is_featured: bool = False,
        shade_label: ShadeLabel = ShadeLabel.TONE,
    ) -> Product:
        """A new product, with at least one variant — always.

        `variants` omitted means the product is sold in one form, and `price_cents` /
        `volume_ml` / `in_stock` describe it: that is the shape the xlsx import and the
        simple half of the admin form send, and the variant is built from them here so
        that nothing downstream has to know which of the two ways a product arrived.

        `description_html` is what the admin editor sends; when given, it replaces
        `description`, which becomes its plain-text form.
        """
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        await self._require_category(category_id)
        if is_featured:
            await self._require_featured_slot()
        specs = self._require_specs(
            variants
            if variants is not None
            else [VariantSpec(volume_ml=volume_ml, price_cents=price_cents, in_stock=in_stock)]
        )
        rich = (
            description_from_html(description_html)
            if description_html is not None
            else Description(html=None, text=description)
        )
        product = Product(
            name=name,
            slug=slug,
            description=rich.text,
            description_html=rich.html,
            brand=await self.canonical_brand(brand),
            price_cents=price_cents,
            volume_ml=volume_ml,
            category_id=category_id,
            in_stock=in_stock,
            is_featured=is_featured,
            shade_label=shade_label,
        )
        await self._apply_specs(product, specs)
        async with _slug_conflict_as_error(self._session):
            self._session.add(product)
        await self._session.refresh(product, attribute_names=["images", "variants"])
        return product

    # What `price_cents`, `volume_ml` and `in_stock` on a PATCH are shorthand for: the
    # product's only variant. Named here because two places have to agree on the list —
    # the guard that refuses them for a multi-variant product, and the code that writes
    # them through to the variant afterwards.
    _SINGLE_VARIANT_FIELDS = ("price_cents", "volume_ml", "in_stock")

    async def update(
        self,
        product_id: uuid.UUID,
        updates: dict[str, Any],
        variants: Sequence[VariantSpec] | None = None,
    ) -> Product:
        """Edit a product, and — when `variants` is given — the variants it is sold in.

        `variants` is a full replacement of the list, not a patch of it: the owner's form
        shows every variant at once, and a list that only ever grows would leave no way to
        take one off. Reconciliation is by id and then by (volume, shade), so the rows (and
        the carts and pending orders pointing at them) survive a price edit or a renamed
        shade — see `_apply_specs`.
        """
        product = await self.get_by_id(product_id)

        new_slug = updates.get("slug")
        if new_slug is not None and new_slug != product.slug and await self._slug_taken(new_slug):
            raise SlugAlreadyExistsError

        if "brand" in updates:
            updates["brand"] = await self.canonical_brand(updates["brand"])

        # The two descriptions move together. The editor's HTML rewrites the plain text; a
        # plain text arriving alone — the catalogue import — drops the HTML, which would
        # otherwise keep showing on the product page the description the import replaced.
        if "description_html" in updates:
            rich = description_from_html(updates["description_html"])
            updates["description_html"] = rich.html
            updates["description"] = rich.text
        elif "description" in updates:
            updates["description_html"] = None

        if "category_id" in updates:
            await self._require_category(updates["category_id"])

        # Only a product that is not pinned yet takes a slot: re-saving one of the three
        # with the switch still on must not be refused for being the third.
        if updates.get("is_featured") and not product.is_featured:
            await self._require_featured_slot()

        single_fields = {
            field: value for field, value in updates.items() if field in self._SINGLE_VARIANT_FIELDS
        }
        if variants is None and single_fields and len(product.live_variants) > 1:
            raise ProductHasVariantsError

        for field, value in updates.items():
            setattr(product, field, value)

        if variants is not None:
            specs = self._require_specs(variants)
            # Inside the slug guard: reconciling can flush (see `_apply_specs`), and that
            # flush carries the product's own edits — a new slug among them.
            async with _slug_conflict_as_error(self._session):
                await self._apply_specs(product, specs)
        elif single_fields:
            # The only variant follows the product's own fields, which is what makes the
            # shorthand true rather than merely accepted: an import that moves a price
            # has to move the price a customer is actually offered.
            only = product.live_variants[0]
            for field, value in single_fields.items():
                setattr(only, field, value)

        self.refresh_display_fields(product)

        async with _slug_conflict_as_error(self._session):
            await self._session.flush()
        return product

    async def variant_prices(self, product_id: uuid.UUID) -> dict[uuid.UUID, int]:
        """What each of this product's variants costs right now, keyed by variant id.

        Read by the admin PATCH *before* it writes, because "which prices moved" is only
        answerable against the old ones — and afterwards the rows hold the new ones.
        Withdrawn variants are included: a volume brought back at a different price has
        moved as surely as one that never left, and the orders quoting it must follow.
        """
        result = await self._session.execute(
            select(ProductVariant.id, ProductVariant.price_cents).where(
                ProductVariant.product_id == product_id
            )
        )
        return {variant_id: price_cents for variant_id, price_cents in result.all()}

    async def variant_shades(self, product_id: uuid.UUID) -> dict[uuid.UUID, str | None]:
        """Each of this product's variants' shade right now, keyed by variant id.

        Read by the admin PATCH *before* it writes, as `variant_prices` is: a shade
        renamed in place is only recognisable against the name it had.
        """
        result = await self._session.execute(
            select(ProductVariant.id, ProductVariant.shade).where(
                ProductVariant.product_id == product_id
            )
        )
        return {variant_id: shade for variant_id, shade in result.all()}

    async def live_variant_ids(self, product_id: uuid.UUID) -> set[uuid.UUID]:
        """Which of this product's volumes are on the shelf right now.

        Read by the admin PATCH *before* it writes, for the same reason `variant_prices`
        is: a volume the owner drops from the list is only recognisable against the list
        that was there a moment earlier — afterwards the row simply looks withdrawn, with
        nothing to say whether this edit is what withdrew it.
        """
        result = await self._session.execute(
            select(ProductVariant.id).where(
                ProductVariant.product_id == product_id,
                ProductVariant.deleted_at.is_(None),
            )
        )
        return set(result.scalars().all())

    @staticmethod
    def _require_specs(specs: Sequence[VariantSpec]) -> list[VariantSpec]:
        """The owner's list of variants, checked before anything is written.

        Every failure is the form's to show, not the database's to discover: an empty
        list has no price to put on a card, the same variant twice would hit the partial
        unique index as a 500 at flush, and the two shade rules below are what keeps a
        shaded product's page readable.
        """
        specs = list(specs)
        if not specs:
            raise EmptyVariantsError
        if len(specs) > MAX_PRODUCT_VARIANTS:
            raise TooManyVariantsError
        keys = [_spec_key(spec) for spec in specs]
        if len(set(keys)) != len(keys):
            raise DuplicateVariantVolumeError
        # All or none — see `ShadeMissingError`.
        shaded = {spec.shade is not None for spec in specs}
        if len(shaded) > 1:
            raise ShadeMissingError
        # One price per volume — see `ShadePricesDifferError`.
        prices: dict[int | None, int] = {}
        for spec in specs:
            if prices.setdefault(spec.volume_ml, spec.price_cents) != spec.price_cents:
                raise ShadePricesDifferError
        return specs

    async def _apply_specs(self, product: Product, specs: Sequence[VariantSpec]) -> None:
        """Reconcile a product's variants against the list the owner submitted.

        Matched by id when the line carries one, and by (volume, shade) otherwise — and
        that is the whole design: a variant's id is what a cart line and a pending order
        hold, so a saved price edit must land on the existing row. Replacing the list
        wholesale — delete all, insert all — would empty every cart in the shop each time
        the owner corrected a number. The id is what lets a shade be renamed in place.

        The id holds only while the volume does. A shade's name is a label — "Rosee" and
        "Rose" are the same tube — but 30 ml and 50 ml are two things at two prices, and
        moving a row from one to the other would quietly swap what every cart and pending
        order holds. So a line whose volume changed is a new variant, and the row it came
        from is withdrawn, with the notice a withdrawal carries.

        A variant that disappears from the list is soft-deleted rather than removed: it
        is still quoted by orders waiting for confirmation, and bringing it back later
        revives the same row (which is also why the unique index is partial).
        """
        live = product.live_variants
        by_id = {variant.id: variant for variant in live}
        by_key = {_variant_key(variant): variant for variant in live}
        before = {variant.id: _variant_key(variant) for variant in live}
        claimed: set[uuid.UUID] = set()

        # Ids first, for every line, before any line is matched by key: a line renamed
        # to a name another line used to have must not be taken by that other line.
        chosen: list[ProductVariant | None] = []
        for spec in specs:
            variant = by_id.get(spec.id) if spec.id is not None else None
            if variant is not None and (
                variant.id in claimed or variant.volume_ml != spec.volume_ml
            ):
                variant = None
            if variant is not None:
                claimed.add(variant.id)
            chosen.append(variant)

        for index, spec in enumerate(specs):
            if chosen[index] is not None:
                continue
            variant = by_key.get(_spec_key(spec))
            if variant is not None and variant.id not in claimed:
                claimed.add(variant.id)
                chosen[index] = variant

        now = datetime.now(UTC)
        # Every row that leaves the list, and every row whose key is about to change, is
        # first taken out of the unique index (which covers live rows only) and flushed.
        # Postgres checks the index row by row, so without this a swap of two shade names,
        # or a rename onto the name of a shade being withdrawn, collides with itself
        # halfway through the UPDATEs. The renamed rows come back below, with their final
        # keys, and those are unique among themselves — `_require_specs` saw to that.
        moving = {
            variant.id
            for spec, variant in zip(specs, chosen, strict=True)
            if variant is not None and _variant_key(variant) != _spec_key(spec)
        }
        stepping_out = [
            variant for variant in live if variant.id not in claimed or variant.id in moving
        ]
        for variant in stepping_out:
            variant.deleted_at = now
        if stepping_out:
            await self._session.flush()

        for sort_order, (spec, found) in enumerate(zip(specs, chosen, strict=True)):
            variant = found
            if variant is None:
                # A variant the owner had withdrawn earlier comes back as itself, so the
                # cart lines and orders that still point at it start working again.
                variant = self._revive_variant(product, spec, claimed)
            if variant is None:
                variant = ProductVariant()
                product.variants.append(variant)
            variant.deleted_at = None
            variant.volume_ml = spec.volume_ml
            variant.shade = spec.shade
            variant.price_cents = spec.price_cents
            variant.in_stock = spec.in_stock
            variant.sort_order = sort_order

        self._retag_images(product, before)
        self.refresh_display_fields(product)

    @staticmethod
    def _revive_variant(
        product: Product, spec: VariantSpec, claimed: set[uuid.UUID]
    ) -> ProductVariant | None:
        """A withdrawn variant with this key — or None if there is none.

        Not one of `claimed`: those are live rows stepping out of the index for a moment
        on their way to another key, and taking one would hand a single row to two lines.
        """
        key = _spec_key(spec)
        for variant in product.variants:
            if (
                variant.deleted_at is not None
                and variant.id not in claimed
                and _variant_key(variant) == key
            ):
                claimed.add(variant.id)
                return variant
        return None

    @staticmethod
    def _retag_images(
        product: Product, before: dict[uuid.UUID, tuple[int | None, str | None]]
    ) -> None:
        """Keep every photo tag pointing at something the product is still sold in.

        A photo is tagged by name ("05 Rose"), not by row, so renaming the shade in the
        variants table would otherwise orphan its photo — still tagged with the old name,
        matching nothing, and so shown nowhere. A rename that is unambiguous moves the
        tag: the old name is gone from every live variant, and every variant that had it
        now has the same new one. (A volume never changes in place — see `_apply_specs`.)

        A tag that still names nothing after that — its shade or volume was withdrawn —
        is dropped from the photo's lists rather than kept, and lists whose survivors no
        longer meet in any variant keep their shades, which is what the photo is of. A
        stale tag would hide the photo on the storefront, and the gallery could not be
        rearranged around it (`arrange_images` refuses unknown tags).

        A photo whose every shade was withdrawn — or, untagged by shade, every volume — is
        hidden rather than left with empty lists: empty is "any", and a shot of "05 Rose"
        would turn up on every other shade's page, and on the card if it was the primary
        one. Hidden, it stays in the admin gallery for the owner to retag or delete.
        """
        live = product.live_variants
        live_volumes = {variant.volume_ml for variant in live}
        live_shades = {shade_key(variant.shade) for variant in live}
        shade_moves: dict[str, set[str | None]] = {}
        for variant in live:
            old = before.get(variant.id)
            if old is None:
                continue
            _old_volume, old_shade = old
            if old_shade is not None and old_shade != shade_key(variant.shade):
                shade_moves.setdefault(old_shade, set()).add(variant.shade)

        def moved(shade: str) -> str:
            if shade_key(shade) in live_shades:
                return shade
            targets = shade_moves.get(shade_key(shade) or "", set())
            if len({shade_key(target) for target in targets}) == 1:
                return next(iter(targets)) or shade
            return shade

        for image in product.images:
            if image.hidden:
                continue
            volumes, shades = clean_tags(
                image.volumes_ml or [], [moved(shade) for shade in image.shades or []]
            )
            # What the photo is of: its shades, or its volumes when it names no shade.
            subject_gone = (
                not any(shade_key(shade) in live_shades for shade in shades)
                if shades
                else bool(volumes) and not any(volume in live_volumes for volume in volumes)
            )
            if subject_gone:
                image.volumes_ml = []
                image.shades = []
                image.hidden = True
                continue
            if not _tags_fit(live, volumes, shades):
                volumes = [volume for volume in volumes if volume in live_volumes]
                shades = [shade for shade in shades if shade_key(shade) in live_shades]
                if not _tags_fit(live, volumes, shades):
                    volumes = []
            # Assigned only when something changed, so an untouched photo stays clean.
            if volumes != (image.volumes_ml or []):
                image.volumes_ml = volumes
            if shades != (image.shades or []):
                image.shades = shades

    @staticmethod
    def refresh_display_fields(product: Product) -> None:
        """Rewrite the three product columns derived from its variants.

        Kept on the product row because every bulk read of the catalogue uses them and
        none of those reads wants a join: the price sort and filter, the search, the
        stock filter, the xlsx export, the sitemap, the JSON-LD and the card.

        - `price_cents` is the cheapest live variant — the "от N ₽" on a card;
        - `volume_ml` is the volume only while there is exactly one, and NULL after that:
          no single number describes a product sold in two, and the card shows the
          volumes themselves instead;
        - `in_stock` is "any of them is", because that is what the filter means — a serum
          whose 30 ml ran out is still a serum the shop can sell.
        """
        live = product.live_variants
        if not live:
            return
        product.price_cents = min(variant.price_cents for variant in live)
        # Counted by volume, not by row: a lipstick in ten shades of one size is still
        # one volume, and the card and the page title should go on saying so.
        volumes = {variant.volume_ml for variant in live}
        product.volume_ml = next(iter(volumes)) if len(volumes) == 1 else None
        product.in_stock = any(variant.in_stock for variant in live)

    async def _require_featured_slot(self) -> None:
        """Refuse a new pin while the home page already holds as many as it shows.

        Counted over live products only — `soft_delete` unpins, but a row pinned before
        that rule, or by hand in the database, must not hold a slot from nowhere.
        """
        pinned = await self._session.scalar(
            select(func.count())
            .select_from(Product)
            .where(Product.is_featured.is_(True), Product.deleted_at.is_(None))
        )
        if (pinned or 0) >= MAX_FEATURED_PRODUCTS:
            raise FeaturedLimitError

    async def _require_category(self, category_id: uuid.UUID | None) -> None:
        """Checked here rather than left to the foreign key.

        A dropdown loaded before the owner deleted a category in another tab still offers
        it, and the database's answer to that is an IntegrityError indistinguishable at
        the flush from a slug conflict. This one names what actually went wrong.
        """
        if category_id is None:
            return
        if await self._session.get(Category, category_id) is None:
            raise CategoryNotFoundError

    async def soft_delete(self, product_id: uuid.UUID) -> None:
        product = await self.get_by_id(product_id)
        product.deleted_at = datetime.now(UTC)
        # A withdrawn product leaves the home page with the catalogue, and gives its slot
        # back: kept pinned, it would hold one of the three while showing nowhere, and the
        # owner would be refused a new pick with no visible reason. A restore does not
        # pin it again — that is a choice to make afresh.
        product.is_featured = False

    async def restore(self, product_id: uuid.UUID) -> Product:
        """Undo a soft-delete. Mirrors what a catalog re-import already does by slug."""
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.images), selectinload(Product.variants))
        )
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundError

        product.deleted_at = None
        await self._session.flush()
        return product

    async def add_image(
        self,
        product_id: uuid.UUID,
        url: str,
        alt: str | None,
        volumes_ml: Sequence[int] = (),
        shades: Sequence[str] = (),
        hidden: bool = False,
    ) -> ProductImage:
        """Adds a photo at the end of the product's gallery.

        The first photo a product gets is its primary one; later ones queue behind it
        until the owner reorders them (`arrange_images`). The tags say which variants the
        photo shows and must name a volume and a shade the product is sold in; a hidden
        photo shows none and keeps no tags (`ProductImage.hidden`).
        """
        product = await self._get_for_gallery(product_id)
        if len(product.images) >= MAX_PRODUCT_IMAGES:
            raise TooManyImagesError
        volumes, shade_names = ([], []) if hidden else clean_tags(volumes_ml, shades)
        self.require_known_tags(product, volumes, shade_names)

        image = ProductImage(
            product_id=product_id,
            url=url,
            alt=alt,
            is_primary=not product.images,
            sort_order=max((image.sort_order for image in product.images), default=-1) + 1,
            volumes_ml=volumes,
            shades=shade_names,
            hidden=hidden,
        )
        # Through the collection rather than `session.add`: the product is in the identity
        # map, and a row added beside it would leave `product.images` stale for everything
        # later in the request that reads the gallery — the cart's photo among them.
        product.images.append(image)
        await self._session.flush()
        return image

    async def _get_for_gallery(self, product_id: uuid.UUID) -> Product:
        """The live product with its gallery read afresh, not from the identity map.

        A gallery edit is checked against the photos the product has — how many, which
        ids — and a collection loaded earlier in the session may predate a photo added
        or removed since. `populate_existing` makes the load overwrite it.
        """
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .options(selectinload(Product.images), selectinload(Product.variants))
            .execution_options(populate_existing=True)
        )
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundError
        return product

    async def arrange_images(
        self, product_id: uuid.UUID, arrangement: Sequence[ImageArrangement]
    ) -> list[ProductImage]:
        """Put the gallery in the owner's order and retag its photos, all at once — and
        rewrite the alt text of each photo that sends one.

        The list has to be the product's gallery exactly — every photo once, none from
        elsewhere. Anything else means the form is looking at a gallery another tab has
        since changed, and saving its order would quietly drop the newcomer's position or
        resurrect a deleted photo's.

        The first photo becomes the primary one: the card, the search dropdown and an
        order line without a variant photo of its own all show it.
        """
        product = await self._get_for_gallery(product_id)
        images = {image.id: image for image in product.images}
        ids = [entry.id for entry in arrangement]
        if len(set(ids)) != len(ids) or set(ids) != set(images):
            raise ImageArrangementError

        # Only the tags this save changes: a photo the owner merely moved keeps whatever
        # it had, and refusing the whole gallery over an old tag nobody touched would
        # leave no way to reorder it short of deleting that photo.
        # A hidden photo keeps no tags: they would come back the moment it is shown
        # again, and nobody would remember choosing them.
        tags = {
            entry.id: ([], []) if entry.hidden else clean_tags(entry.volumes_ml, entry.shades)
            for entry in arrangement
        }
        for entry in arrangement:
            volumes, shades = tags[entry.id]
            if not _same_tags(images[entry.id], volumes, shades, entry.hidden):
                self.require_known_tags(product, volumes, shades)

        for sort_order, entry in enumerate(arrangement):
            image = images[entry.id]
            image.sort_order = sort_order
            image.is_primary = sort_order == 0
            volumes, shades = tags[entry.id]
            # A photo whose tags did not change keeps its own spelling of them.
            if not _same_tags(image, volumes, shades, entry.hidden):
                image.volumes_ml = volumes
                image.shades = shades
                image.hidden = entry.hidden
            if entry.alt_given:
                image.alt = entry.alt

        await self._session.flush()
        return sorted(images.values(), key=lambda image: image.sort_order)

    @staticmethod
    def require_known_tags(
        product: Product, volumes_ml: Sequence[int], shades: Sequence[str]
    ) -> None:
        """Photo tags have to name only what the product is sold in.

        A tag that matches no variant hides the photo everywhere, which is never what the
        owner meant — most likely the form was loaded before a volume was taken off.
        """
        if not _tags_fit(product.live_variants, volumes_ml, shades):
            raise ImageTagUnknownError

    async def delete_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> str | None:
        """Drops the row and hands back the url to delete after the commit — or None when
        the file has to stay, because an order still shows it (see `_unreferenced`).

        Deleting the primary photo promotes the next one, so the card is never left
        without a picture while the gallery still has one.
        """
        # Not `_get_for_gallery`: a photo of a withdrawn product can still be deleted.
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.images))
            .execution_options(populate_existing=True)
        )
        product = result.scalar_one_or_none()
        images = sorted(product.images if product else [], key=lambda image: image.sort_order)
        image = next((candidate for candidate in images if candidate.id == image_id), None)
        if product is None or image is None:
            raise ProductImageNotFoundError

        url = image.url
        product.images.remove(image)
        await self._session.delete(image)
        rest = [candidate for candidate in images if candidate.id != image_id]
        if rest and not any(candidate.is_primary for candidate in rest):
            rest[0].is_primary = True
        # An empty list means the file is still an order's picture — see `_unreferenced`.
        return url if await self._unreferenced([url]) else None

    async def _unreferenced(self, urls: list[str]) -> list[str]:
        """Of these urls, the ones no order line still shows.

        `order_items` denormalises the picture along with the name and the price, so the
        product's image row is not the file's only reference — replacing a photo used to
        unlink a file that a customer's order and the owner's history both still pointed
        at. (The comment that used to sit here said an orphan could not be told from a
        live file; it can, and this is the query that does it.)
        """
        if not urls:
            return []
        result = await self._session.execute(
            select(OrderItem.product_image_url).where(OrderItem.product_image_url.in_(urls))
        )
        still_used = set(result.scalars().all())
        return [url for url in urls if url not in still_used]

    async def _slug_taken(self, slug: str) -> bool:
        result = await self._session.execute(select(Product.id).where(Product.slug == slug))
        return result.scalar_one_or_none() is not None
