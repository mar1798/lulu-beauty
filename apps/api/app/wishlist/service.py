import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Product
from app.catalog.serializers import product_response
from app.common.limits import MAX_WISHLIST_ITEMS
from app.wishlist.models import WishlistItem
from app.wishlist.schemas import WishlistItemResponse, WishlistResponse


class ProductNotFoundError(Exception):
    pass


class WishlistItemNotFoundError(Exception):
    pass


class WishlistFullError(Exception):
    pass


class WishlistService:
    """Saved products, one flat list per user.

    Unlike the cart, nothing here depends on an active cycle: a wishlist is what the
    customer falls back on precisely when there is no open cycle to add to.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_wishlist(self, user_id: uuid.UUID) -> WishlistResponse:
        return await self._build_response(user_id)

    async def add_item(self, user_id: uuid.UUID, product_id: uuid.UUID) -> WishlistResponse:
        product = await self._session.get(Product, product_id)
        if product is None or product.deleted_at is not None:
            raise ProductNotFoundError

        existing = await self._find_item(user_id, product_id)
        if existing is None:
            # Counted before inserting, and only when something is actually being added:
            # a repeated press on a full list is idempotent, not a wall.
            await self._require_room(user_id)
            self._session.add(WishlistItem(user_id=user_id, product_id=product_id))
            await self._session.flush()

        return await self._build_response(user_id)

    async def remove_item(self, user_id: uuid.UUID, product_id: uuid.UUID) -> WishlistResponse:
        item = await self._find_item(user_id, product_id)
        if item is None:
            raise WishlistItemNotFoundError

        await self._session.delete(item)
        await self._session.flush()
        return await self._build_response(user_id)

    async def _require_room(self, user_id: uuid.UUID) -> None:
        result = await self._session.execute(
            select(func.count()).select_from(WishlistItem).where(WishlistItem.user_id == user_id)
        )
        if result.scalar_one() >= MAX_WISHLIST_ITEMS:
            raise WishlistFullError

    async def _find_item(self, user_id: uuid.UUID, product_id: uuid.UUID) -> WishlistItem | None:
        result = await self._session.execute(
            select(WishlistItem).where(
                WishlistItem.user_id == user_id, WishlistItem.product_id == product_id
            )
        )
        return result.scalar_one_or_none()

    async def _build_response(self, user_id: uuid.UUID) -> WishlistResponse:
        # Discontinued products drop out, exactly as they do in the cart: a card the
        # customer can see is one they can open, and a soft-deleted product 404s.
        # The rows stay — a re-import by slug revives the product and the card with it.
        result = await self._session.execute(
            select(WishlistItem, Product)
            .join(Product, Product.id == WishlistItem.product_id)
            .where(WishlistItem.user_id == user_id, Product.deleted_at.is_(None))
            .order_by(WishlistItem.created_at.desc())
            .options(selectinload(Product.images))
        )

        return WishlistResponse(
            items=[
                WishlistItemResponse(product=product_response(product), added_at=item.created_at)
                for item, product in result.all()
            ]
        )
