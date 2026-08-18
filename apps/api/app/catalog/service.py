import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Category, Product, ProductImage


class SlugAlreadyExistsError(Exception):
    pass


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
        raise SlugAlreadyExistsError from error


class CategoryNotFoundError(Exception):
    pass


class ProductNotFoundError(Exception):
    pass


class ProductImageNotFoundError(Exception):
    pass


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


class ProductService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _filtered_query(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        search: str | None,
        include_deleted: bool,
        brand: str | None = None,
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
            # Escape LIKE wildcards so a user searching for "50%" doesn't match everything.
            pattern = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.where(Product.name.ilike(f"%{pattern}%", escape="\\"))
        return query

    async def _paginate(
        self, query: Select[tuple[Product]], page: int, page_size: int
    ) -> tuple[list[Product], int]:
        total = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0

        result = await self._session.execute(
            query.options(selectinload(Product.images))
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
            category_slug, in_stock, search, include_deleted=False, brand=brand
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
        query = self._filtered_query(category_slug, in_stock, search, include_deleted, brand)
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

    async def get_by_slug(self, slug: str) -> Product | None:
        result = await self._session.execute(
            select(Product)
            .where(Product.slug == slug, Product.deleted_at.is_(None))
            .options(selectinload(Product.images))
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, product_id: uuid.UUID) -> Product:
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
            .options(selectinload(Product.images))
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
    ) -> Product:
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        product = Product(
            name=name,
            slug=slug,
            description=description,
            brand=await self.canonical_brand(brand),
            price_cents=price_cents,
            volume_ml=volume_ml,
            category_id=category_id,
            in_stock=in_stock,
        )
        async with _slug_conflict_as_error(self._session):
            self._session.add(product)
        await self._session.refresh(product, attribute_names=["images"])
        return product

    async def update(self, product_id: uuid.UUID, updates: dict[str, Any]) -> Product:
        product = await self.get_by_id(product_id)

        new_slug = updates.get("slug")
        if new_slug is not None and new_slug != product.slug and await self._slug_taken(new_slug):
            raise SlugAlreadyExistsError

        if "brand" in updates:
            updates["brand"] = await self.canonical_brand(updates["brand"])

        for field, value in updates.items():
            setattr(product, field, value)

        async with _slug_conflict_as_error(self._session):
            await self._session.flush()
        return product

    async def soft_delete(self, product_id: uuid.UUID) -> None:
        product = await self.get_by_id(product_id)
        product.deleted_at = datetime.now(UTC)

    async def restore(self, product_id: uuid.UUID) -> Product:
        """Undo a soft-delete. Mirrors what a catalog re-import already does by slug."""
        result = await self._session.execute(
            select(Product).where(Product.id == product_id).options(selectinload(Product.images))
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

        Returns the new image and the urls of the ones it replaced. The files behind
        those are the caller's to remove, and only once this transaction has committed:
        deleting them here would strand a live row on a missing file the moment anything
        further down the request rolled back.
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

    async def delete_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> str:
        """Drops the row and hands back the url, so the caller can remove the file after
        the commit — same reasoning as `add_image`."""
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
        return url

    async def _slug_taken(self, slug: str) -> bool:
        result = await self._session.execute(select(Product.id).where(Product.slug == slug))
        return result.scalar_one_or_none() is not None
