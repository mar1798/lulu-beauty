import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.limits import MAX_WISHLIST_ITEMS
from app.wishlist.models import WishlistItem
from app.wishlist.service import (
    ProductNotFoundError,
    WishlistFullError,
    WishlistItemNotFoundError,
    WishlistService,
)
from tests.integration.factories import make_product, make_product_image, make_user


async def test_add_item_returns_the_whole_product(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session, name="Крем", price_cents=1500)
    await make_product_image(db_session, product, url="http://x/primary.jpg", is_primary=True)

    response = await WishlistService(db_session).add_item(user.id, product.id)

    assert len(response.items) == 1
    assert response.items[0].product.id == product.id
    assert response.items[0].product.name == "Крем"
    assert response.items[0].product.price_cents == 1500
    assert [image.url for image in response.items[0].product.images] == ["http://x/primary.jpg"]


async def test_add_item_needs_no_active_cycle(db_session: AsyncSession) -> None:
    """The whole point of the wishlist: it works exactly when the cart cannot."""
    user = await make_user(db_session)
    product = await make_product(db_session)

    response = await WishlistService(db_session).add_item(user.id, product.id)

    assert len(response.items) == 1


async def test_add_item_twice_is_idempotent(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)
    service = WishlistService(db_session)

    await service.add_item(user.id, product.id)
    response = await service.add_item(user.id, product.id)

    assert len(response.items) == 1
    rows = (await db_session.execute(select(WishlistItem))).scalars().all()
    assert len(rows) == 1


async def test_add_unknown_product_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)

    with pytest.raises(ProductNotFoundError):
        await WishlistService(db_session).add_item(user.id, uuid.uuid4())


async def test_add_deleted_product_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session, deleted_at=datetime.now(UTC))

    with pytest.raises(ProductNotFoundError):
        await WishlistService(db_session).add_item(user.id, product.id)


async def test_deleted_product_drops_out_but_keeps_its_row(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)
    service = WishlistService(db_session)
    await service.add_item(user.id, product.id)

    product.deleted_at = datetime.now(UTC)
    await db_session.flush()
    response = await service.get_wishlist(user.id)

    assert response.items == []
    rows = (await db_session.execute(select(WishlistItem))).scalars().all()
    assert len(rows) == 1


async def test_wishlist_is_newest_first(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    first = await make_product(db_session, name="Первый")
    second = await make_product(db_session, name="Второй")
    service = WishlistService(db_session)

    await service.add_item(user.id, first.id)
    # created_at defaults to now() server-side, and both inserts can land inside the
    # same statement timestamp — set it explicitly so the ordering under test is real.
    item = (
        await db_session.execute(select(WishlistItem).where(WishlistItem.product_id == first.id))
    ).scalar_one()
    item.created_at = datetime(2020, 1, 1, tzinfo=UTC)
    await db_session.flush()
    response = await service.add_item(user.id, second.id)

    assert [line.product.id for line in response.items] == [second.id, first.id]


async def test_wishlists_are_per_user(db_session: AsyncSession) -> None:
    owner = await make_user(db_session)
    stranger = await make_user(db_session)
    product = await make_product(db_session)
    service = WishlistService(db_session)
    await service.add_item(owner.id, product.id)

    assert (await service.get_wishlist(stranger.id)).items == []


async def test_remove_item_deletes_only_that_line(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    kept = await make_product(db_session)
    dropped = await make_product(db_session)
    service = WishlistService(db_session)
    await service.add_item(user.id, kept.id)
    await service.add_item(user.id, dropped.id)

    response = await service.remove_item(user.id, dropped.id)

    assert [line.product.id for line in response.items] == [kept.id]


async def test_remove_missing_item_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)

    with pytest.raises(WishlistItemNotFoundError):
        await WishlistService(db_session).remove_item(user.id, product.id)


async def test_remove_someone_elses_item_raises(db_session: AsyncSession) -> None:
    owner = await make_user(db_session)
    stranger = await make_user(db_session)
    product = await make_product(db_session)
    service = WishlistService(db_session)
    await service.add_item(owner.id, product.id)

    with pytest.raises(WishlistItemNotFoundError):
        await service.remove_item(stranger.id, product.id)


async def test_full_wishlist_refuses_new_products_but_not_repeats(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    service = WishlistService(db_session)
    products = [await make_product(db_session) for _ in range(MAX_WISHLIST_ITEMS)]
    for product in products:
        await service.add_item(user.id, product.id)
    extra = await make_product(db_session)

    with pytest.raises(WishlistFullError):
        await service.add_item(user.id, extra.id)

    # Already saved — nothing is being added, so the ceiling has nothing to refuse.
    assert len((await service.add_item(user.id, products[0].id)).items) == MAX_WISHLIST_ITEMS
