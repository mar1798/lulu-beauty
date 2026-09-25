import uuid
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Category, Product, ProductImage, ProductVariant
from app.catalog.results import CatalogSuggestions, VariantSpec
from app.catalog.rich_text import Description, description_from_html
from app.catalog.search import normalize_search
from app.common.limits import MAX_PRODUCT_VARIANTS
from app.orders.models import OrderItem


class SlugAlreadyExistsError(Exception):
    pass


# Postgres' SQLSTATE for a unique-constraint violation.
UNIQUE_VIOLATION = "23505"


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
    """The same volume twice in one product's list of volumes."""


class TooManyVariantsError(Exception):
    """Past `MAX_PRODUCT_VARIANTS` volumes on one product."""


class ProductHasVariantsError(Exception):
    """A single price, volume or stock flag was sent to a product that is sold in several.

    `price_cents`, `volume_ml` and `in_stock` on the product are shorthand for "the only
    variant" and stay writable as long as there is only one — which is what keeps the
    xlsx import and every older client working. Once the owner adds a second volume,
    those fields are derived and the only way to move them is the variants list itself;
    silently applying one price to every volume would undo the split.
    """


class CategoryService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[Category]:
        result = await self._session.execute(
            select(Category).order_by(Category.sort_order, Category.name)
        )
        return list(result.scalars().all())

    async def create(self, name: str, slug: str, sort_order: int | None = None) -> Category:
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        if sort_order is None:
            sort_order = await self._next_sort_order()
        category = Category(name=name, slug=slug, sort_order=sort_order)
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
        """
        result = await self._session.execute(
            select(Category.id).where(Category.name_norm.ilike(like_pattern(search), escape="\\"))
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
    ) -> Select[tuple[Product]]:
        query = select(Product)
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))
        if category_slug is not None:
            query = query.join(Category).where(Category.slug == category_slug)
        if brand is not None:
            # Case-insensitive, like everything else brand-related: writes go
            # through canonical_brand(), but rows imported before that (or by a
            # sloppy xlsx) can still hold "round lab" next to "Round Lab", and a
            # filter that split them would show half the brand's products.
            query = query.where(func.lower(Product.brand) == brand.lower())
        if in_stock is not None:
            query = query.where(Product.in_stock.is_(in_stock))
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
        self, query: Select[tuple[Product]], page: int, page_size: int
    ) -> tuple[list[Product], int]:
        total = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0

        result = await self._session.execute(
            query.options(selectinload(Product.images), selectinload(Product.variants))
            # Product names are not unique (two volumes of the same toner, a re-imported
            # duplicate), so name alone leaves the order of the equal rows to the planner
            # — and a paginated listing then repeats one product and skips another.
            .order_by(Product.name, Product.id)
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
    ) -> tuple[list[Product], int]:
        query = self._filtered_query(
            category_slug,
            in_stock,
            search,
            include_deleted=False,
            brand=brand,
            search_category_ids=await self._search_category_ids(search) if search else (),
        )
        return await self._paginate(query, page, page_size)

    async def list_admin(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        page: int,
        page_size: int,
        search: str | None = None,
        include_deleted: bool = False,
        brand: str | None = None,
    ) -> tuple[list[Product], int]:
        """Admin listing — unlike list_public it can surface soft-deleted products."""
        query = self._filtered_query(
            category_slug,
            in_stock,
            search,
            include_deleted,
            brand,
            search_category_ids=await self._search_category_ids(search) if search else (),
        )
        return await self._paginate(query, page, page_size)

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
        one — an empty catalog behind a suggestion is worse than no suggestion.
        """
        pattern = like_pattern(search)
        # Resolved once and used twice: the offered categories are these, and the same
        # ids are what makes the product query's category arm indexable.
        category_ids = await self._search_category_ids(search)

        category_result = await self._session.execute(
            select(Category)
            .where(
                Category.id.in_(category_ids),
                Category.products.any(Product.deleted_at.is_(None)),
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
        )
        self._apply_specs(product, specs)
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
        """Edit a product, and — when `variants` is given — the volumes it is sold in.

        `variants` is a full replacement of the list, not a patch of it: the owner's form
        shows every volume at once, and a list that only ever grows would leave no way to
        take one off. Reconciliation is by volume, so the rows (and the carts and pending
        orders pointing at them) survive a price edit — see `_apply_specs`.
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

        single_fields = {
            field: value for field, value in updates.items() if field in self._SINGLE_VARIANT_FIELDS
        }
        if variants is None and single_fields and len(product.live_variants) > 1:
            raise ProductHasVariantsError

        for field, value in updates.items():
            setattr(product, field, value)

        if variants is not None:
            self._apply_specs(product, self._require_specs(variants))
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
        """The owner's list of volumes, checked before anything is written.

        Both failures are the form's to show, not the database's to discover: an empty
        list has no price to put on a card, and the same volume twice would hit the
        partial unique index as a 500 at flush.
        """
        specs = list(specs)
        if not specs:
            raise EmptyVariantsError
        if len(specs) > MAX_PRODUCT_VARIANTS:
            raise TooManyVariantsError
        volumes = [spec.volume_ml for spec in specs]
        if len(set(volumes)) != len(volumes):
            raise DuplicateVariantVolumeError
        return specs

    def _apply_specs(self, product: Product, specs: Sequence[VariantSpec]) -> None:
        """Reconcile a product's variants against the list the owner submitted.

        Matched by volume, and that is the whole design: a variant's id is what a cart
        line and a pending order hold, so a saved price edit must land on the existing
        row. Replacing the list wholesale — delete all, insert all — would empty every
        cart in the shop each time the owner corrected a number.

        A volume that disappears from the list is soft-deleted rather than removed: it is
        still quoted by orders waiting for confirmation, and bringing it back later
        revives the same row (which is also why the unique index is partial).
        """
        existing = {variant.volume_ml: variant for variant in product.live_variants}

        for sort_order, spec in enumerate(specs):
            variant = existing.pop(spec.volume_ml, None)
            if variant is None:
                # A volume the owner had withdrawn earlier comes back as itself, so the
                # cart lines and orders that still point at it start working again.
                variant = self._revive_variant(product, spec.volume_ml)
            if variant is None:
                variant = ProductVariant(volume_ml=spec.volume_ml)
                product.variants.append(variant)
            variant.price_cents = spec.price_cents
            variant.in_stock = spec.in_stock
            variant.sort_order = sort_order

        now = datetime.now(UTC)
        for variant in existing.values():
            variant.deleted_at = now

        self.refresh_display_fields(product)

    @staticmethod
    def _revive_variant(product: Product, volume_ml: int | None) -> ProductVariant | None:
        """A withdrawn variant of this volume, un-withdrawn — or None if there is none."""
        for variant in product.variants:
            if variant.deleted_at is not None and variant.volume_ml == volume_ml:
                variant.deleted_at = None
                return variant
        return None

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
        product.volume_ml = live[0].volume_ml if len(live) == 1 else None
        product.in_stock = any(variant.in_stock for variant in live)

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
        self, product_id: uuid.UUID, url: str, alt: str | None
    ) -> tuple[ProductImage, list[str]]:
        """Sets the product's photo, dropping whatever it had before.

        A product carries exactly one photo, so an upload is a replacement rather
        than an append. Doing it here (instead of asking the caller to delete
        first) keeps the product from being briefly photo-less between the two
        requests, and cleans up rows left by earlier multi-image data.

        Returns the new image and the urls of the ones it replaced — minus any that an
        order still points at. The files behind the rest are the caller's to remove, and
        only once this transaction has committed: deleting them here would strand a live
        row on a missing file the moment anything further down the request rolled back.
        """
        await self.get_by_id(product_id)  # 404s if missing/soft-deleted

        existing = await self._session.execute(
            select(ProductImage).where(ProductImage.product_id == product_id)
        )
        replaced_urls = []
        for image in existing.scalars():
            replaced_urls.append(image.url)
            await self._session.delete(image)
        await self._session.flush()
        replaced_urls = await self._unreferenced(replaced_urls)

        image = ProductImage(
            product_id=product_id,
            url=url,
            alt=alt,
            is_primary=True,
            sort_order=0,
        )
        self._session.add(image)
        await self._session.flush()
        return image, replaced_urls

    async def delete_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> str | None:
        """Drops the row and hands back the url to delete after the commit — or None when
        the file has to stay, because an order still shows it (see `_unreferenced`)."""
        result = await self._session.execute(
            select(ProductImage).where(
                ProductImage.id == image_id, ProductImage.product_id == product_id
            )
        )
        image = result.scalar_one_or_none()
        if image is None:
            raise ProductImageNotFoundError

        url = image.url
        await self._session.delete(image)
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
