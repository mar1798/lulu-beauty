import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Category, Product, ProductImage


class SlugAlreadyExistsError(Exception):
    pass


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

    async def create(self, name: str, slug: str, sort_order: int) -> Category:
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        category = Category(name=name, slug=slug, sort_order=sort_order)
        self._session.add(category)
        await self._session.flush()
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

        await self._session.flush()
        return category

    async def delete(self, category_id: uuid.UUID) -> None:
        category = await self._session.get(Category, category_id)
        if category is None:
            raise CategoryNotFoundError
        await self._session.delete(category)

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
    ) -> Select[tuple[Product]]:
        query = select(Product)
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))
        if category_slug is not None:
            query = query.join(Category).where(Category.slug == category_slug)
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
            .order_by(Product.name)
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
    ) -> tuple[list[Product], int]:
        query = self._filtered_query(category_slug, in_stock, search, include_deleted=False)
        return await self._paginate(query, page, page_size)

    async def list_admin(
        self,
        category_slug: str | None,
        in_stock: bool | None,
        page: int,
        page_size: int,
        search: str | None = None,
        include_deleted: bool = False,
    ) -> tuple[list[Product], int]:
        """Admin listing — unlike list_public it can surface soft-deleted products."""
        query = self._filtered_query(category_slug, in_stock, search, include_deleted)
        return await self._paginate(query, page, page_size)

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
        brand: str | None,
        price_cents: int,
        category_id: uuid.UUID | None,
        in_stock: bool,
    ) -> Product:
        if await self._slug_taken(slug):
            raise SlugAlreadyExistsError
        product = Product(
            name=name,
            slug=slug,
            description=description,
            brand=brand,
            price_cents=price_cents,
            category_id=category_id,
            in_stock=in_stock,
        )
        self._session.add(product)
        await self._session.flush()
        await self._session.refresh(product, attribute_names=["images"])
        return product

    async def update(self, product_id: uuid.UUID, updates: dict[str, Any]) -> Product:
        product = await self.get_by_id(product_id)

        new_slug = updates.get("slug")
        if new_slug is not None and new_slug != product.slug and await self._slug_taken(new_slug):
            raise SlugAlreadyExistsError

        for field, value in updates.items():
            setattr(product, field, value)

        await self._session.flush()
        return product

    async def soft_delete(self, product_id: uuid.UUID) -> None:
        product = await self.get_by_id(product_id)
        product.deleted_at = datetime.now(UTC)

    async def restore(self, product_id: uuid.UUID) -> Product:
        """Undo a soft-delete. Mirrors what a catalog re-import already does by slug."""
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id)
            .options(selectinload(Product.images))
        )
        product = result.scalar_one_or_none()
        if product is None:
            raise ProductNotFoundError

        product.deleted_at = None
        await self._session.flush()
        return product

    async def add_image(
        self, product_id: uuid.UUID, url: str, alt: str | None, is_primary: bool
    ) -> ProductImage:
        await self.get_by_id(product_id)  # 404s if missing/soft-deleted

        if is_primary:
            await self._session.execute(
                update(ProductImage)
                .where(ProductImage.product_id == product_id)
                .values(is_primary=False)
            )

        max_sort_order = await self._session.scalar(
            select(func.max(ProductImage.sort_order)).where(ProductImage.product_id == product_id)
        )
        image = ProductImage(
            product_id=product_id,
            url=url,
            alt=alt,
            is_primary=is_primary,
            sort_order=(max_sort_order + 1) if max_sort_order is not None else 0,
        )
        self._session.add(image)
        await self._session.flush()
        return image

    async def delete_image(self, product_id: uuid.UUID, image_id: uuid.UUID) -> None:
        result = await self._session.execute(
            select(ProductImage).where(
                ProductImage.id == image_id, ProductImage.product_id == product_id
            )
        )
        image = result.scalar_one_or_none()
        if image is None:
            raise ProductImageNotFoundError
        await self._session.delete(image)

    async def _slug_taken(self, slug: str) -> bool:
        result = await self._session.execute(select(Product.id).where(Product.slug == slug))
        return result.scalar_one_or_none() is not None
