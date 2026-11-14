"""The guest's cart and wishlist: read from the catalogue, merged after sign-in."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.schemas import GuestCartLine
from app.cart.service import CartService, GuestCartCycleChangedError, NoActiveCycleError
from app.common.limits import MAX_ITEM_QUANTITY, MAX_WISHLIST_ITEMS
from app.wishlist.service import WishlistService
from tests.integration.factories import make_cycle, make_product, make_user, variant_id


def _line(variant: uuid.UUID, quantity: int) -> GuestCartLine:
    return GuestCartLine(variant_id=variant, quantity=quantity)


async def test_preview_prices_lines_from_the_catalogue(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1500)

    response = await CartService(db_session).preview([_line(variant_id(product), 2)])

    assert response.cycle_id == cycle.id
    assert [(item.product_id, item.quantity) for item in response.items] == [(product.id, 2)]
    assert response.total_cents == 3000


async def test_preview_needs_no_cycle_and_says_there_is_none(db_session: AsyncSession) -> None:
    product = await make_product(db_session)

    response = await CartService(db_session).preview([_line(variant_id(product), 1)])

    assert response.cycle_id is None
    assert len(response.items) == 1


async def test_preview_drops_lines_that_cannot_be_ordered(db_session: AsyncSession) -> None:
    await make_cycle(db_session)
    live = await make_product(db_session, slug="live")
    sold_out = await make_product(db_session, slug="sold-out", in_stock=False)
    withdrawn = await make_product(db_session, slug="gone", deleted_at=datetime.now(UTC))

    response = await CartService(db_session).preview(
        [
            _line(variant_id(live), 1),
            _line(variant_id(sold_out), 1),
            _line(variant_id(withdrawn), 1),
            _line(uuid.uuid4(), 1),
        ]
    )

    assert [item.product_id for item in response.items] == [live.id]


async def test_merge_keeps_the_larger_quantity_so_a_repeat_is_harmless(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    kept = await make_product(db_session, slug="kept", name="A")
    raised = await make_product(db_session, slug="raised", name="B")
    added = await make_product(db_session, slug="added", name="C")
    service = CartService(db_session)
    await service.add_item(user.id, variant_id(kept), 5)
    await service.add_item(user.id, variant_id(raised), 1)
    guest = [
        _line(variant_id(kept), 2),
        _line(variant_id(raised), 3),
        _line(variant_id(added), 4),
    ]

    await service.merge(user.id, guest)
    response = await service.merge(user.id, guest)

    assert [item.quantity for item in response.items] == [5, 3, 4]


async def test_merge_skips_lines_no_longer_orderable(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    live = await make_product(db_session, slug="live")
    sold_out = await make_product(db_session, slug="sold-out", in_stock=False)

    response = await CartService(db_session).merge(
        user.id, [_line(variant_id(live), 1), _line(variant_id(sold_out), 1)]
    )

    assert [item.product_id for item in response.items] == [live.id]


async def test_merge_without_active_cycle_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)

    with pytest.raises(NoActiveCycleError):
        await CartService(db_session).merge(user.id, [_line(variant_id(product), 1)])


async def test_merge_clamps_to_the_quantity_ceiling(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)

    response = await CartService(db_session).merge(
        user.id, [_line(variant_id(product), MAX_ITEM_QUANTITY)]
    )

    assert response.items[0].quantity == MAX_ITEM_QUANTITY


async def test_wishlist_preview_keeps_the_order_sent_and_drops_withdrawn(
    db_session: AsyncSession,
) -> None:
    first = await make_product(db_session, slug="first")
    second = await make_product(db_session, slug="second")
    gone = await make_product(db_session, slug="gone", deleted_at=datetime.now(UTC))

    response = await WishlistService(db_session).preview([second.id, gone.id, first.id])

    assert [product.id for product in response.products] == [second.id, first.id]


async def test_wishlist_merge_adds_only_what_is_missing(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    saved = await make_product(db_session, slug="saved")
    new = await make_product(db_session, slug="new")
    gone = await make_product(db_session, slug="gone", deleted_at=datetime.now(UTC))
    service = WishlistService(db_session)
    await service.add_item(user.id, saved.id)

    await service.merge(user.id, [new.id, saved.id, gone.id])
    response = await service.merge(user.id, [new.id, saved.id, gone.id])

    assert sorted(str(item.product.id) for item in response.items) == sorted(
        [str(saved.id), str(new.id)]
    )


async def test_wishlist_merge_stops_at_the_cap(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    service = WishlistService(db_session)
    for index in range(MAX_WISHLIST_ITEMS - 1):
        product = await make_product(db_session, slug=f"p-{index}")
        await service.add_item(user.id, product.id)
    newest = await make_product(db_session, slug="newest")
    oldest = await make_product(db_session, slug="oldest")

    response = await service.merge(user.id, [newest.id, oldest.id])

    ids = {item.product.id for item in response.items}
    assert len(ids) == MAX_WISHLIST_ITEMS
    # The guest's newest pick takes the last free place.
    assert newest.id in ids
    assert oldest.id not in ids


async def test_merge_refuses_a_cart_gathered_in_another_cycle(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)

    with pytest.raises(GuestCartCycleChangedError):
        await CartService(db_session).merge(
            user.id, [_line(variant_id(product), 1)], cycle_id=uuid.uuid4()
        )


async def test_merge_accepts_a_cart_from_the_open_cycle(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)

    response = await CartService(db_session).merge(
        user.id, [_line(variant_id(product), 2)], cycle_id=cycle.id
    )

    assert [item.quantity for item in response.items] == [2]


async def test_wishlist_merge_keeps_the_guests_order_on_top(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    service = WishlistService(db_session)
    already = await make_product(db_session, slug="already")
    await service.add_item(user.id, already.id)
    picks = [await make_product(db_session, slug=f"pick-{index}") for index in range(5)]

    # Newest first, as the browser keeps them.
    response = await service.merge(user.id, [product.id for product in picks])

    assert [item.product.id for item in response.items] == [
        *(product.id for product in picks),
        already.id,
    ]
