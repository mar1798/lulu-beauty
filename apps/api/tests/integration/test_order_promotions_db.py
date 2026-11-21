"""Promotions on real orders: checkout, edits, repricing, cancellation, the bill's freeze."""

import asyncio
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.cart.service import CartService
from app.catalog.models import Product
from app.db import async_session
from app.export.service import ExportService
from app.orders.discounts import order_totals
from app.orders.models import DiscountKind, Order, OrderStatus
from app.orders.service import OrdersService
from app.promotions.models import OrderGift, OrderPromotion, Promotion
from app.promotions.order_schemas import order_gift_responses, order_promotion_responses
from app.promotions.orders import OrderPromotionsService
from app.promotions.rules import (
    AnyCondition,
    AnyReward,
    ConditionType,
    ContainsCondition,
    ContainsMode,
    DiscountReward,
    GiftKind,
    GiftReward,
    QuantityCondition,
    RewardType,
    SubtotalCondition,
    Target,
    dump_conditions,
    dump_rewards,
)
from app.users.service import UsersService
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

NOW = datetime.now(UTC)


def _percent(value: int, target: Target | None = None) -> DiscountReward:
    return DiscountReward(
        type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value, target=target
    )


def _amount(value: int, target: Target | None = None) -> DiscountReward:
    return DiscountReward(
        type=RewardType.DISCOUNT, kind=DiscountKind.AMOUNT, value=value, target=target
    )


def _custom_gift(title: str = "Mystery box") -> GiftReward:
    return GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, title=title)


def _subtotal(min_cents: int) -> SubtotalCondition:
    return SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=min_cents)


async def _promotion(
    session: AsyncSession,
    *,
    rewards: Sequence[AnyReward],
    conditions: Sequence[AnyCondition] = (),
    title: str = "Акция",
    starts_at: datetime = NOW - timedelta(days=1),
    ends_at: datetime = NOW + timedelta(days=1),
    is_enabled: bool = True,
    sort_order: int = 0,
) -> Promotion:
    promotion = Promotion(
        slug=f"promo-{uuid.uuid4().hex[:10]}",
        title=title,
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=is_enabled,
        sort_order=sort_order,
        conditions=dump_conditions(list(conditions)),
        rewards=dump_rewards(list(rewards)),
    )
    session.add(promotion)
    await session.flush()
    return promotion


async def _checkout(
    session: AsyncSession, user_id: uuid.UUID, *lines: tuple[Product, int]
) -> Order:
    for product, quantity in lines:
        await CartService(session).add_item(user_id, variant_id(product), quantity)
    return await OrdersService(session).checkout(user_id, note=None)


def _live(order: Order) -> list[OrderPromotion]:
    return [p for p in order.promotions if p.released_at is None]


async def _live_participations(session: AsyncSession) -> list[OrderPromotion]:
    return list(
        (
            await session.scalars(
                select(OrderPromotion).where(OrderPromotion.released_at.is_(None))
            )
        ).all()
    )


# ─── Checkout ────────────────────────────────────────────────────────────────────────


async def test_checkout_attaches_a_promotion_and_counts_its_discount(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(db_session, rewards=[_percent(10)])

    order = await _checkout(db_session, user.id, (product, 2))

    assert [p.promotion_id for p in _live(order)] == [promotion.id]
    assert _live(order)[0].title == "Акция"
    assert order.total_cents == 18_000
    totals = order_totals(order)
    assert totals.promo_order_discount_cents == 2_000
    assert totals.subtotal_cents == 20_000
    # The same layer the response shows next to the promotion.
    responses = order_promotion_responses(order, totals)
    assert [r.discount_cents for r in responses] == [2_000]


async def test_a_promotion_whose_conditions_fail_is_not_attached(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1_000)
    await _promotion(db_session, rewards=[_percent(10)], conditions=[_subtotal(5_000)])

    order = await _checkout(db_session, user.id, (product, 1))

    assert _live(order) == []
    assert order.total_cents == 1_000


async def test_promotions_that_are_not_live_now_are_not_attached(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1_000)
    await _promotion(db_session, rewards=[_percent(10)], is_enabled=False)
    await _promotion(
        db_session,
        rewards=[_percent(10)],
        starts_at=NOW + timedelta(hours=1),
        ends_at=NOW + timedelta(days=1),
    )
    await _promotion(
        db_session,
        rewards=[_percent(10)],
        starts_at=NOW - timedelta(days=2),
        ends_at=NOW - timedelta(days=1),
    )
    archived = await _promotion(db_session, rewards=[_percent(10)])
    archived.deleted_at = NOW
    await db_session.flush()

    order = await _checkout(db_session, user.id, (product, 1))

    assert _live(order) == []
    assert order.total_cents == 1_000


async def test_every_qualifying_promotion_applies_in_sort_order(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(50)], title="B", sort_order=2)
    await _promotion(db_session, rewards=[_amount(4_000)], title="A", sort_order=1)

    order = await _checkout(db_session, user.id, (product, 1))

    # 4 000 off first, then half of the rest.
    assert order.total_cents == 3_000
    assert len(_live(order)) == 2


async def test_a_line_targeted_discount_lands_on_its_lines_only(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    serum = await make_product(db_session, name="Serum", price_cents=10_000, brand="Acme")
    toner = await make_product(db_session, name="Toner", price_cents=6_000, brand="Other")
    await _promotion(db_session, rewards=[_percent(50, Target(brands=["acme"]))])

    order = await _checkout(db_session, user.id, (serum, 1), (toner, 1))

    assert order.total_cents == 11_000
    assert order_totals(order).promo_items_discount_cents == 5_000


async def test_gifts_are_written_beside_the_order_not_into_it(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1_000)
    present = await make_product(db_session, name="Tester", price_cents=500, volume_ml=10)
    await _promotion(
        db_session,
        rewards=[
            _custom_gift(),
            GiftReward(
                type=RewardType.GIFT,
                gift=GiftKind.PRODUCT,
                title="x",
                variant_id=variant_id(present),
                quantity=2,
            ),
        ],
    )

    order = await _checkout(db_session, user.id, (product, 1))

    assert order.total_cents == 1_000
    assert len(order.items) == 1
    by_kind = {gift.kind: gift for gift in order.gifts}
    assert by_kind[GiftKind.CUSTOM].title == "Mystery box"
    assert by_kind[GiftKind.PRODUCT].title == "Tester, 10 мл"
    assert by_kind[GiftKind.PRODUCT].quantity == 2
    assert by_kind[GiftKind.PRODUCT].variant_id == variant_id(present)
    assert {g.title for g in order_gift_responses(order)} == {"Mystery box", "Tester, 10 мл"}


async def test_a_catalogue_gift_that_is_out_of_stock_is_left_out(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1_000)
    present = await make_product(db_session, name="Tester", price_cents=500, in_stock=False)
    await _promotion(
        db_session,
        rewards=[
            _percent(10),
            GiftReward(
                type=RewardType.GIFT,
                gift=GiftKind.PRODUCT,
                title="x",
                variant_id=variant_id(present),
            ),
        ],
    )

    order = await _checkout(db_session, user.id, (product, 1))

    assert order.gifts == []
    # The rest of the promotion still applies.
    assert order.total_cents == 900


async def test_the_cart_preview_agrees_with_the_checkout(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000, brand="Acme")
    await _promotion(db_session, rewards=[_percent(10, Target(brands=["Acme"])), _amount(500)])
    await _promotion(db_session, rewards=[_custom_gift()], conditions=[_subtotal(10_000)])
    await _promotion(db_session, rewards=[_custom_gift("Big box")], conditions=[_subtotal(90_000)])

    await CartService(db_session).add_item(user.id, variant_id(product), 2)
    cart = await CartService(db_session).get_cart(user.id)

    block = cart.promotions
    assert cart.total_cents == 20_000
    assert [entry.title for entry in block.applied] == ["Акция", "Акция"]
    assert block.items_discount_cents == 2_000
    assert block.order_discount_cents == 500
    assert block.payable_cents == 17_500
    assert [gift.title for gift in block.gifts] == ["Mystery box"]
    # Missing money alone: 70 000 more for the one that asks for 90 000.
    assert [hint.missing_cents for hint in block.hints] == [70_000]

    order = await OrdersService(db_session).checkout(user.id, note=None)
    assert order.total_cents == block.payable_cents


async def test_a_guest_sees_the_preview_too(db_session: AsyncSession) -> None:
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10), _custom_gift()])

    from app.cart.schemas import GuestCartLine

    cart = await CartService(db_session).preview(
        [GuestCartLine(variant_id=variant_id(product), quantity=1)]
    )

    assert cart.promotions.discount_cents == 1_000
    assert cart.promotions.payable_cents == 9_000
    assert len(cart.promotions.gifts) == 1
    assert cart.items[0].quantity == 1


async def test_the_preview_hides_a_promotion_the_customer_already_holds(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    await _checkout(db_session, user.id, (product, 1))

    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    cart = await CartService(db_session).get_cart(user.id)

    assert cart.promotions.applied == []
    assert cart.promotions.payable_cents == 10_000


# ─── «Один раз на покупателя» ────────────────────────────────────────────────────────


async def test_a_customer_takes_part_once_across_orders(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])

    first = await _checkout(db_session, user.id, (product, 1))
    second = await _checkout(db_session, user.id, (product, 1))

    assert len(_live(first)) == 1
    assert _live(second) == []
    assert second.total_cents == 10_000


async def test_cancelling_frees_the_customer_to_take_part_again(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10), _custom_gift()])
    service = OrdersService(db_session)
    first = await _checkout(db_session, user.id, (product, 1))

    await service.cancel(user.id, first.id)

    assert first.status is OrderStatus.CANCELLED_BY_CUSTOMER
    assert _live(first) == []
    assert first.promotions[0].released_at is not None
    assert first.gifts == []
    # A cancelled order is what it would have cost, nothing promised.
    assert first.total_cents == 10_000
    second = await _checkout(db_session, user.id, (product, 1))
    assert len(_live(second)) == 1
    assert second.total_cents == 9_000


async def test_restoring_asks_again_and_loses_the_promotion_to_the_other_order(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    service = OrdersService(db_session)
    first = await _checkout(db_session, user.id, (product, 1))
    await service.cancel(user.id, first.id)
    second = await _checkout(db_session, user.id, (product, 1))
    assert len(_live(second)) == 1

    restored = await service.restore(user.id, first.id)

    assert restored.status is OrderStatus.PENDING
    assert _live(restored) == []
    assert restored.total_cents == 10_000


async def test_restoring_brings_the_promotion_back_when_nobody_else_holds_it(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10), _custom_gift()])
    service = OrdersService(db_session)
    order = await _checkout(db_session, user.id, (product, 1))
    await service.cancel(user.id, order.id)

    restored = await service.restore(user.id, order.id)

    assert len(_live(restored)) == 1
    assert len(restored.gifts) == 1
    assert restored.total_cents == 9_000


async def test_the_owner_cancelling_and_undoing_it_follows_the_same_path(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    service = OrdersService(db_session)
    order = await _checkout(db_session, user.id, (product, 1))

    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert _live(order) == []
    assert order.total_cents == 10_000

    await service.update_status(order.id, OrderStatus.PENDING)
    assert len(_live(order)) == 1
    assert order.total_cents == 9_000


async def test_two_orders_made_at_once_share_one_participation(db_session: AsyncSession) -> None:
    """The customer's checkout and an order the owner places for them, in the same moment.

    Both read the promotion as free. A new order's insert already queues behind the owner's
    lock on the customer's row (the foreign key), and joining locks that row too — one live
    row, not a unique-index error. `test_two_edits_at_once_...` is the case only the lock saves.
    """
    user = await make_user(db_session)
    admin = await make_user(db_session, role=Role.SUPER_ADMIN)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    await db_session.commit()

    admin_attached = asyncio.Event()
    checkout_started = asyncio.Event()

    async def by_the_owner() -> None:
        async with async_session() as session:
            await OrdersService(session).create_for_customer(
                admin.id, uuid.uuid4(), user.id, None, [(variant_id(product), 1)], None
            )
            admin_attached.set()
            # Holds the customer's row while the checkout reaches for it.
            await checkout_started.wait()
            await asyncio.sleep(0.3)
            await session.commit()

    async def by_the_customer() -> None:
        await admin_attached.wait()
        async with async_session() as session:
            checkout_started.set()
            await OrdersService(session).checkout(user.id, note=None)
            await session.commit()

    await asyncio.gather(by_the_owner(), by_the_customer())

    async with async_session() as session:
        assert len(list((await session.scalars(select(Order))).all())) == 2
        assert len(await _live_participations(session)) == 1


async def test_two_edits_at_once_share_one_participation(db_session: AsyncSession) -> None:
    """Two of one customer's orders edited in the same moment, after a promotion began.

    Neither holds it and neither insert would touch the other's rows, so only the customer's
    row — locked before the second one reads who has already joined — keeps both from
    taking it (without the lock the second dies on the unique index).
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    first = await _checkout(db_session, user.id, (product, 1))
    second = await _checkout(db_session, user.id, (product, 1))
    await _promotion(db_session, rewards=[_percent(10)])
    await db_session.commit()

    first_attached = asyncio.Event()
    second_started = asyncio.Event()

    async def edit_first() -> None:
        async with async_session() as session:
            await OrdersService(session).set_item_quantity(user.id, first.id, first.items[0].id, 2)
            first_attached.set()
            await second_started.wait()
            await asyncio.sleep(0.3)
            await session.commit()

    async def edit_second() -> None:
        await first_attached.wait()
        async with async_session() as session:
            second_started.set()
            await OrdersService(session).set_item_quantity(
                user.id, second.id, second.items[0].id, 2
            )
            await session.commit()

    await asyncio.gather(edit_first(), edit_second())

    async with async_session() as session:
        assert len(await _live_participations(session)) == 1
        totals = sorted((await session.scalars(select(Order.total_cents))).all())
        assert totals == [18_000, 20_000]


async def test_the_index_is_the_last_word_on_a_second_live_participation(
    db_session: AsyncSession,
) -> None:
    import pytest
    from sqlalchemy.exc import IntegrityError

    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(db_session, rewards=[_percent(10)])
    first = await _checkout(db_session, user.id, (product, 1))
    other = Order(user_id=user.id, cycle_id=first.cycle_id, total_cents=0)
    db_session.add(other)
    await db_session.flush()

    db_session.add(
        OrderPromotion(
            order_id=other.id,
            user_id=user.id,
            promotion_id=promotion.id,
            title="x",
            rewards=[],
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


# ─── Edits while PENDING ─────────────────────────────────────────────────────────────


async def test_a_promotion_held_stays_after_it_ended_while_its_conditions_hold(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))
    promotion.ends_at = NOW - timedelta(minutes=1)
    # And the owner has since changed what it gives: the order keeps what it was promised.
    promotion.rewards = dump_rewards([_percent(50)])
    await db_session.flush()
    item = order.items[0]

    await OrdersService(db_session).set_item_quantity(user.id, order.id, item.id, 2)

    assert len(_live(order)) == 1
    assert order.total_cents == 18_000


async def test_a_new_promotion_attaches_on_an_edit_only_while_it_is_live(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order = await _checkout(db_session, user.id, (product, 1))
    assert _live(order) == []
    await _promotion(
        db_session,
        rewards=[_percent(10)],
        starts_at=NOW - timedelta(days=3),
        ends_at=NOW - timedelta(days=2),
    )
    live = await _promotion(db_session, rewards=[_percent(20)])

    await OrdersService(db_session).set_item_quantity(user.id, order.id, order.items[0].id, 2)

    assert [p.promotion_id for p in _live(order)] == [live.id]
    assert order.total_cents == 16_000


async def test_an_edit_that_breaks_the_conditions_releases_the_promotion(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(
        db_session,
        rewards=[_percent(10), _custom_gift()],
        conditions=[QuantityCondition(type=ConditionType.QUANTITY, min_quantity=2)],
    )
    order = await _checkout(db_session, user.id, (product, 2))
    assert order.total_cents == 18_000 and len(order.gifts) == 1

    await OrdersService(db_session).set_item_quantity(user.id, order.id, order.items[0].id, 1)

    assert _live(order) == []
    assert order.promotions[0].released_at is not None
    assert order.gifts == []
    assert order.total_cents == 10_000
    # And the customer is free to take it again.
    await OrdersService(db_session).set_item_quantity(user.id, order.id, order.items[0].id, 2)
    assert len(_live(order)) == 1
    assert order.total_cents == 18_000


async def test_the_owners_edit_of_a_pending_order_asks_again(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)], conditions=[_subtotal(15_000)])
    order = await _checkout(db_session, user.id, (product, 1))
    assert _live(order) == []

    order, _ = await OrdersService(db_session).edit_by_admin(
        order.id, order.revision, {order.items[0].id: 2}, []
    )

    assert len(_live(order)) == 1
    assert order.total_cents == 18_000


async def test_a_price_change_that_crosses_a_threshold_moves_the_promotion(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)], conditions=[_subtotal(15_000)])
    order = await _checkout(db_session, user.id, (product, 1))
    service = OrdersService(db_session)

    await service.reprice_variant(variant_id(product), 20_000)
    assert len(_live(order)) == 1
    assert order.total_cents == 18_000

    changes = await service.reprice_variant(variant_id(product), 12_000)
    assert _live(order) == []
    assert order.total_cents == 12_000
    assert changes[0].total_cents == 12_000


async def test_a_dropped_product_releases_what_it_carried(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    first = await make_product(db_session, name="Serum", price_cents=10_000)
    second = await make_product(db_session, name="Toner", price_cents=2_000)
    await _promotion(
        db_session,
        rewards=[_percent(10)],
        conditions=[
            ContainsCondition(
                type=ConditionType.CONTAINS,
                target=Target(product_ids=[first.id]),
                mode=ContainsMode.ANY,
            )
        ],
    )
    order = await _checkout(db_session, user.id, (first, 1), (second, 1))
    assert order.total_cents == 10_800

    await OrdersService(db_session).drop_product(first.id)

    assert _live(order) == []
    assert order.total_cents == 2_000


async def test_dropping_the_last_line_cancels_the_order_and_frees_the_customer(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))

    drops = await OrdersService(db_session).drop_product(product.id)

    assert drops[0].is_cancelled
    assert order.status is OrderStatus.CANCELLED_BY_OWNER
    assert _live(order) == []
    assert await _live_participations(db_session) == []


async def test_erasing_the_account_lets_go_of_what_the_orders_held(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))

    await UsersService(db_session).delete_account(user.id)

    assert order.status is OrderStatus.CANCELLED_BY_CUSTOMER
    assert await _live_participations(db_session) == []


# ─── The bill freezes the promotions ─────────────────────────────────────────────────


async def test_after_the_bill_goes_out_the_promotions_are_frozen(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    serum = await make_product(db_session, name="Serum", price_cents=10_000)
    toner = await make_product(db_session, name="Toner", price_cents=10_000)
    await _promotion(
        db_session,
        rewards=[_percent(10), _custom_gift()],
        conditions=[_subtotal(15_000)],
    )
    order = await _checkout(db_session, user.id, (serum, 1), (toner, 1))
    assert order.total_cents == 18_000
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    toner_line = next(item for item in order.items if item.product_name == "Toner")

    # The owner removes a line: the sum no longer reaches the threshold, but the bill's
    # promotion stays — what is recounted is the money, against the order as it is now.
    order, _ = await service.edit_by_admin(
        order.id, order.revision, {item.id: 1 for item in order.items if item is not toner_line}, []
    )

    assert len(_live(order)) == 1
    assert len(order.gifts) == 1
    assert order.total_cents == 9_000

    # Nothing is attached after the bill either: a promotion that began since stays out.
    await _promotion(db_session, rewards=[_percent(50)], title="Новая")
    order, _ = await service.edit_by_admin(order.id, order.revision, {order.items[0].id: 3}, [])
    assert [p.title for p in _live(order)] == ["Акция"]
    assert order.total_cents == 27_000


async def test_a_repricing_does_not_touch_an_order_past_pending(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))
    await OrdersService(db_session).update_status(order.id, OrderStatus.AWAITING_PAYMENT)

    await OrdersService(db_session).reprice_variant(variant_id(product), 20_000)

    assert order.total_cents == 9_000
    assert len(_live(order)) == 1


async def test_the_owners_discount_is_anchored_against_what_the_promotions_left(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    serum = await make_product(db_session, name="Serum", price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(50, Target(product_ids=[serum.id]))])
    order = await _checkout(db_session, user.id, (serum, 1))
    assert order.total_cents == 5_000

    await OrdersService(db_session).set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
    )

    # 10% of the 50 сом the promotion left, not of the full 100.
    assert order.total_cents == 4_500
    assert order.discount_base_cents == 5_000


# ─── What the customer is warned about ───────────────────────────────────────────────


async def test_the_edit_preview_names_the_promotions_it_would_lose_and_changes_nothing(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(
        db_session,
        rewards=[_percent(10)],
        title="От двух",
        conditions=[QuantityCondition(type=ConditionType.QUANTITY, min_quantity=2)],
    )
    order = await _checkout(db_session, user.id, (product, 2))
    await db_session.commit()

    async with async_session() as session:
        service = OrdersService(session)
        impact = await service.preview_customer_edit(
            user.id,
            order.id,
            revision=order.revision,
            item_id=order.items[0].id,
            variant_id=None,
            quantity=1,
        )
        await session.rollback()

    assert impact.lost == [(promotion.id, "От двух")]
    assert impact.gained == []
    assert impact.total_cents == 10_000
    async with async_session() as session:
        stored = await session.get(Order, order.id)
        assert stored is not None
        assert stored.total_cents == 18_000
        assert len(_live(stored)) == 1


# ─── The purchase list ───────────────────────────────────────────────────────────────


async def test_catalogue_gifts_join_the_purchase_list_and_free_ones_are_apart(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session, name="Serum", price_cents=1_000)
    present = await make_product(db_session, name="Tester", price_cents=500, volume_ml=10)
    await _promotion(
        db_session,
        rewards=[
            _custom_gift(),
            GiftReward(
                type=RewardType.GIFT,
                gift=GiftKind.PRODUCT,
                title="x",
                variant_id=variant_id(present),
                quantity=2,
            ),
        ],
    )
    other = await make_user(db_session)
    await _checkout(db_session, user.id, (product, 1), (present, 1))
    # Withdrawn orders are nothing to buy, and their gifts with them.
    cancelled = await _checkout(db_session, other.id, (product, 1))
    await OrdersService(db_session).cancel(other.id, cancelled.id)

    exports = ExportService(db_session)
    rows = {
        (row.product_name, row.volume_ml): row for row in await exports.checklist_rows(cycle.id)
    }
    gifts = await exports.checklist_custom_gifts(cycle.id)

    # One tester ordered and two given, on one line at the catalogue price.
    assert rows[("Tester", 10)].quantity == 3
    assert rows[("Tester", 10)].unit_price_cents == 500
    assert rows[("Serum", None)].quantity == 1
    assert [(gift.title, gift.quantity) for gift in gifts] == [("Mystery box", 1)]


async def test_orders_hold_their_promotions_through_a_fresh_load(db_session: AsyncSession) -> None:
    """Responses read `order.promotions` and `order.gifts` off orders loaded by any query."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10), _custom_gift()])
    order = await _checkout(db_session, user.id, (product, 1))
    await db_session.commit()

    async with async_session() as session:
        orders, _ = await OrdersService(session).list_for_user(user.id)

    assert orders[0].id == order.id
    assert len(_live(orders[0])) == 1
    assert len(orders[0].gifts) == 1
    assert order_totals(orders[0]).total_cents == orders[0].total_cents == 9_000


async def test_refreshing_a_non_pending_order_does_nothing(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order = await _checkout(db_session, user.id, (product, 1))
    await OrdersService(db_session).update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await _promotion(db_session, rewards=[_percent(10)])

    delta = await OrderPromotionsService(db_session).refresh(order)

    assert not delta.changed
    assert _live(order) == []


async def test_a_gift_is_not_an_order_line(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1_000)
    await _promotion(db_session, rewards=[_custom_gift()])

    order = await _checkout(db_session, user.id, (product, 1))

    gifts = list((await db_session.scalars(select(OrderGift))).all())
    assert len(gifts) == 1 and gifts[0].order_id == order.id
    assert len(order.items) == 1
