import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Product
from app.catalog.serializers import product_response
from app.common.limits import MAX_WISHLIST_ITEMS
from app.wishlist.models import WishlistItem
from app.wishlist.schemas import (
    GuestWishlistResponse,
    WishlistItemResponse,
    WishlistResponse,
)


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
            # Savepointed for the same reason the cart creates one: (user_id, product_id)
            # is UNIQUE and two taps on the heart are two requests, both of which can find
            # nothing saved yet. Adding a product twice is the customer's own idempotent
            # action, so the loser reports success rather than a 500.
            try:
                async with self._session.begin_nested():
                    self._session.add(WishlistItem(user_id=user_id, product_id=product_id))
            except IntegrityError:
                if await self._find_item(user_id, product_id) is None:
                    raise

        return await self._build_response(user_id)

    async def preview(self, product_ids: Sequence[uuid.UUID]) -> GuestWishlistResponse:
        """A guest's saved products, as the catalogue has them now.

        Withdrawn products drop out, as they do from a stored wishlist; the order is the
        one the guest's browser sent.
        """
        products = await self._live_products(product_ids)
        by_id = {product.id: product for product in products}
        return GuestWishlistResponse(
            products=[
                product_response(by_id[product_id])
                for product_id in dict.fromkeys(product_ids)
                if product_id in by_id
            ]
        )

    async def merge(self, user_id: uuid.UUID, product_ids: Sequence[uuid.UUID]) -> WishlistResponse:
        """Add what a guest saved before signing in to their own wishlist.

        Already-saved products are left alone, so a repeat of the same merge changes
        nothing. Past the cap the rest is dropped instead of refusing the whole merge:
        an account already near the cap is better served by the products that fit than by
        none. The guest's newest picks are the ones that get the room.

        `created_at` is set here rather than left to the column default: that default is
        `now()`, the transaction's start, so every merged row would share one timestamp
        and the newest-first list would show them in no particular order. A microsecond
        apart, newest on top, keeps the order the guest saved them in — and above what
        the account already had.
        """
        live = {product.id for product in await self._live_products(product_ids)}
        saved = set(
            (
                await self._session.execute(
                    select(WishlistItem.product_id).where(WishlistItem.user_id == user_id)
                )
            ).scalars()
        )
        missing = [
            product_id
            for product_id in dict.fromkeys(product_ids)
            if product_id in live and product_id not in saved
        ]
        incoming = missing[: max(MAX_WISHLIST_ITEMS - len(saved), 0)]
        now = datetime.now(UTC)

        for position, product_id in enumerate(incoming):
            try:
                # Savepointed like `add_item`: a heart pressed in another tab can insert
                # the same row between the read above and this insert.
                async with self._session.begin_nested():
                    self._session.add(
                        WishlistItem(
                            user_id=user_id,
                            product_id=product_id,
                            created_at=now - timedelta(microseconds=position),
                        )
                    )
            except IntegrityError:
                continue

        return await self._build_response(user_id)

    async def _live_products(self, product_ids: Sequence[uuid.UUID]) -> Sequence[Product]:
        if not product_ids:
            return []
        result = await self._session.execute(
            select(Product)
            .where(Product.id.in_(product_ids), Product.deleted_at.is_(None))
            .options(selectinload(Product.images), selectinload(Product.variants))
        )
        return result.scalars().all()

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
            # Variants too: the card shows "от N ₽" once a product is sold in several,
            # and `product_response` reads them.
            .options(selectinload(Product.images), selectinload(Product.variants))
        )

        return WishlistResponse(
            items=[
                WishlistItemResponse(product=product_response(product), added_at=item.created_at)
                for item, product in result.all()
            ]
        )
