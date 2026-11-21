"""Promo codes on real orders: issuing, reserving, using, taking back."""

import asyncio
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.cart.service import CartService
from app.catalog.models import Product
from app.db import async_session
from app.orders.discounts import order_totals
from app.orders.models import DiscountKind, Order, OrderStatus
from app.orders.service import OrdersService
from app.payments.models import PaymentReceipt, ReceiptKind
from app.payments.service import PaymentsService
from app.promotions.code_errors import (
    PromoCodeAlreadyUsedError,
    PromoCodeConditionsNotMetError,
    PromoCodeExpiredError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
)
from app.promotions.code_schemas import promo_code_response
from app.promotions.codes import (
    CODE_ALPHABET,
    PromoCodesService,
    PromoCodeView,
    code_status,
    issue_missing_promo_codes,
)
from app.promotions.models import OrderPromotion, PromoCode, PromoCodeStatus, Promotion
from app.promotions.orders import OrderPromotionsService
from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    AnyReward,
    ConditionType,
    DiscountReward,
    GiftKind,
    GiftReward,
    PromoCodeReward,
    RewardType,
    SubtotalCondition,
    dump_conditions,
    dump_rewards,
)
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

NOW = datetime.now(UTC)


def _percent(value: int) -> DiscountReward:
    return DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value)


def _gift(title: str = "Mystery box") -> GiftReward:
    return GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, title=title)


def _subtotal(min_cents: int) -> SubtotalCondition:
    return SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=min_cents)


def _code_reward(
    *,
    rewards: Sequence[AnyCodeReward] | None = None,
    conditions: Sequence[AnyCondition] = (),
    valid_days: int | None = 30,
    valid_from: datetime | None = None,
    valid_until: datetime | None = None,
) -> PromoCodeReward:
    return PromoCodeReward(
        type=RewardType.PROMO_CODE,
        valid_days=valid_days,
        valid_from=valid_from,
        valid_until=valid_until,
        conditions=list(conditions),
        rewards=list(rewards if rewards is not None else [_percent(10)]),
    )


async def _promotion(
    session: AsyncSession,
    *,
    rewards: Sequence[AnyReward],
    conditions: Sequence[AnyCondition] = (),
    title: str = "Акция",
) -> Promotion:
    promotion = Promotion(
        slug=f"promo-{uuid.uuid4().hex[:10]}",
        title=title,
        starts_at=NOW - timedelta(days=1),
        ends_at=NOW + timedelta(days=1),
        is_enabled=True,
        conditions=dump_conditions(list(conditions)),
        rewards=dump_rewards(list(rewards)),
    )
    session.add(promotion)
    await session.flush()
    return promotion


async def _checkout(
    session: AsyncSession,
    user_id: uuid.UUID,
    *lines: tuple[Product, int],
    promo_code: str | None = None,
) -> Order:
    for product, quantity in lines:
        await CartService(session).add_item(user_id, variant_id(product), quantity)
    return await OrdersService(session).checkout(user_id, note=None, promo_code=promo_code)


async def _pay(session: AsyncSession, order: Order) -> OrdersService:
    """Bill and mark paid by hand — the owner's panel path."""
    service = OrdersService(session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CONFIRMED)
    return service


async def _earn_code(
    session: AsyncSession,
    user_id: uuid.UUID,
    product: Product,
    *,
    reward: PromoCodeReward | None = None,
) -> tuple[Order, PromoCode]:
    """A customer who has paid for an order that earned them a code."""
    await _promotion(session, rewards=[reward or _code_reward()])
    order = await _checkout(session, user_id, (product, 1))
    service = await _pay(session, order)
    assert len(service.issued_codes) == 1
    return order, service.issued_codes[0]


async def _all_codes(session: AsyncSession) -> list[PromoCode]:
    return list((await session.scalars(select(PromoCode).order_by(PromoCode.created_at))).all())


def _expire(code: PromoCode) -> None:
    """The code ran out an hour ago (its window stays valid: it started two days back)."""
    code.valid_from = datetime.now(UTC) - timedelta(days=2)
    code.expires_at = datetime.now(UTC) - timedelta(hours=1)


def _live(order: Order) -> list[OrderPromotion]:
    return [p for p in order.promotions if p.released_at is None]


# --- Issuing ----------------------------------------------------------------------------


async def test_paying_by_hand_issues_the_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)

    order, code = await _earn_code(db_session, user.id, product)

    assert len(code.code) == 8
    assert set(code.code) <= set(CODE_ALPHABET)
    assert not set(code.code) & set("0O1I")
    assert code.user_id == user.id
    assert code.source_order_id == order.id
    assert code.status is PromoCodeStatus.ACTIVE
    # The template is copied: percent discount, thirty days from now.
    assert code.rewards[0]["type"] == "DISCOUNT"
    assert timedelta(days=29) < code.expires_at - code.valid_from <= timedelta(days=30)


async def test_a_receipt_accepted_in_the_bot_issues_the_code_too(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_code_reward()])
    order = await _checkout(db_session, user.id, (product, 1))
    await OrdersService(db_session).update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    receipt = PaymentReceipt(
        order_id=order.id,
        kind=ReceiptKind.PHOTO,
        file_id="f",
        file_unique_id="u",
        submitted_at=datetime.now(UTC),
    )
    db_session.add(receipt)
    await db_session.flush()

    reviewed = await PaymentsService(db_session).review(receipt.id, accept=True)

    assert order.status is OrderStatus.CONFIRMED
    assert [c.user_id for c in reviewed.issued_codes] == [user.id]
    assert len(await _all_codes(db_session)) == 1
    # A second press changes nothing and issues nothing.
    again = await PaymentsService(db_session).review(receipt.id, accept=True)
    assert again.changed is False and again.issued_codes == []
    assert len(await _all_codes(db_session)) == 1


async def test_a_rejected_receipt_issues_nothing(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_code_reward()])
    order = await _checkout(db_session, user.id, (product, 1))
    await OrdersService(db_session).update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    receipt = PaymentReceipt(
        order_id=order.id,
        kind=ReceiptKind.PHOTO,
        file_id="f",
        file_unique_id="u",
        submitted_at=datetime.now(UTC),
    )
    db_session.add(receipt)
    await db_session.flush()

    await PaymentsService(db_session).review(receipt.id, accept=False)

    assert await _all_codes(db_session) == []


async def test_issuing_twice_gives_one_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order, code = await _earn_code(db_session, user.id, product)

    again = await PromoCodesService(db_session).on_paid(order)
    swept = await issue_missing_promo_codes(db_session)

    assert again == [] and swept == []
    assert await _all_codes(db_session) == [code]


async def test_the_index_refuses_a_second_standing_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    _, code = await _earn_code(db_session, user.id, product)

    db_session.add(
        PromoCode(
            code="ZZZZZZZZ",
            user_id=user.id,
            promotion_id=code.promotion_id,
            conditions=[],
            rewards=code.rewards,
            valid_from=code.valid_from,
            expires_at=code.expires_at,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_a_code_template_with_fixed_dates(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    start = NOW + timedelta(days=5)
    end = NOW + timedelta(days=15)
    reward = _code_reward(valid_days=None, valid_from=start, valid_until=end)

    _, code = await _earn_code(db_session, user.id, product, reward=reward)

    assert code.valid_from == start and code.expires_at == end


async def test_a_promotion_without_a_code_reward_issues_none(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))

    service = await _pay(db_session, order)

    assert service.issued_codes == []
    assert await issue_missing_promo_codes(db_session) == []


async def test_the_sweep_issues_what_the_event_missed(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order, code = await _earn_code(db_session, user.id, product)
    # The event "failed": the code never made it.
    await db_session.delete(code)
    await db_session.flush()

    swept = await issue_missing_promo_codes(db_session)

    assert len(swept) == 1
    assert swept[0].source_order_id == order.id and swept[0].user_id == user.id
    assert await issue_missing_promo_codes(db_session) == []


async def test_the_sweep_ignores_an_order_not_yet_paid(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_code_reward()])
    order = await _checkout(db_session, user.id, (product, 1))
    await OrdersService(db_session).update_status(order.id, OrderStatus.AWAITING_PAYMENT)

    assert await issue_missing_promo_codes(db_session) == []


async def test_a_revoked_code_can_be_earned_again(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order, code = await _earn_code(db_session, user.id, product)
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert code.status is PromoCodeStatus.REVOKED

    # Back to PENDING it joins the promotion again, is billed and paid: a fresh code.
    await service.update_status(order.id, OrderStatus.PENDING)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CONFIRMED)

    codes = await _all_codes(db_session)
    assert [c.status for c in codes].count(PromoCodeStatus.REVOKED) == 1
    assert [c.status for c in codes].count(PromoCodeStatus.ACTIVE) == 1


# --- Using ------------------------------------------------------------------------------


async def _customer_with_code(
    session: AsyncSession, *, price_cents: int = 10_000, reward: PromoCodeReward | None = None
) -> tuple[uuid.UUID, Product, PromoCode]:
    user = await make_user(session)
    await make_cycle(session)
    product = await make_product(session, price_cents=price_cents)
    _, code = await _earn_code(session, user.id, product, reward=reward)
    # The promotion that earned it must not also hand out its reward to the next order.
    await session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    await session.flush()
    return user.id, product, code


async def test_checkout_reserves_the_code_and_counts_it(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)

    order = await _checkout(db_session, user_id, (product, 2), promo_code=code.code.lower())

    assert code.status is PromoCodeStatus.RESERVED and code.used_order_id == order.id
    [participation] = _live(order)
    assert participation.promo_code_id == code.id and participation.promotion_id is None
    assert order.total_cents == 18_000
    assert order_totals(order).promo_by_layer[participation.id] == 2_000


async def test_a_code_may_give_a_gift(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(
        db_session, reward=_code_reward(rewards=[_gift("Подарок за покупку")])
    )

    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    assert [g.title for g in order.gifts] == ["Подарок за покупку"]
    assert order.total_cents == 10_000


async def test_paying_the_order_spends_the_code(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    await _pay(db_session, order)

    assert code.status is PromoCodeStatus.USED and code.used_order_id == order.id


async def test_a_code_with_unmet_conditions_is_refused_and_nothing_is_ordered(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(
        db_session, reward=_code_reward(conditions=[_subtotal(50_000)])
    )
    await CartService(db_session).add_item(user_id, variant_id(product), 1)

    with pytest.raises(PromoCodeConditionsNotMetError):
        await OrdersService(db_session).checkout(user_id, None, code.code)

    # No order, the cart is as it was, the code is free.
    assert (
        await db_session.scalar(
            select(Order).where(Order.user_id == user_id, Order.status == OrderStatus.PENDING)
        )
        is None
    )
    assert code.status is PromoCodeStatus.ACTIVE
    cart = await CartService(db_session).get_cart(user_id)
    assert len(cart.items) == 1


@pytest.mark.parametrize(
    ("mutate", "error"),
    [
        (_expire, PromoCodeExpiredError),
        (
            lambda c: (
                setattr(c, "valid_from", datetime.now(UTC) + timedelta(days=1)),
                setattr(c, "expires_at", datetime.now(UTC) + timedelta(days=2)),
            ),
            PromoCodeNotYetValidError,
        ),
        (lambda c: setattr(c, "status", PromoCodeStatus.USED), PromoCodeAlreadyUsedError),
        (lambda c: setattr(c, "status", PromoCodeStatus.RESERVED), PromoCodeAlreadyUsedError),
        (lambda c: setattr(c, "status", PromoCodeStatus.REVOKED), PromoCodeNotFoundError),
    ],
)
async def test_every_refusal_of_the_check(
    db_session: AsyncSession, mutate: object, error: type[Exception]
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    await CartService(db_session).add_item(user_id, variant_id(product), 1)
    mutate(code)  # type: ignore[operator]
    await db_session.flush()

    with pytest.raises(error):
        await CartService(db_session).check_promo_code(user_id, code.code)
    with pytest.raises(error):
        await OrdersService(db_session).checkout(user_id, None, code.code)


async def test_the_check_says_what_the_code_gives(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    await CartService(db_session).add_item(user_id, variant_id(product), 3)

    result = await CartService(db_session).check_promo_code(
        user_id, f" {code.code[:4].lower()} {code.code[4:]} "
    )

    assert result.code.code == code.code
    assert result.discount_cents == 3_000
    assert result.cart_total_cents == 30_000 and result.payable_cents == 27_000
    # Writes nothing.
    assert code.status is PromoCodeStatus.ACTIVE


async def test_the_check_refuses_an_empty_cart_and_unmet_conditions(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(
        db_session, reward=_code_reward(conditions=[_subtotal(50_000)])
    )
    with pytest.raises(PromoCodeConditionsNotMetError):
        await CartService(db_session).check_promo_code(user_id, code.code)
    await CartService(db_session).add_item(user_id, variant_id(product), 1)
    with pytest.raises(PromoCodeConditionsNotMetError):
        await CartService(db_session).check_promo_code(user_id, code.code)
    await CartService(db_session).add_item(user_id, variant_id(product), 4)
    assert (await CartService(db_session).check_promo_code(user_id, code.code)).discount_cents > 0


async def test_somebody_elses_code_is_not_found(db_session: AsyncSession) -> None:
    _, product, code = await _customer_with_code(db_session)
    stranger = await make_user(db_session)
    await CartService(db_session).add_item(stranger.id, variant_id(product), 1)

    # Exactly what a string that is no code at all answers.
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(stranger.id, code.code)
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(stranger.id, "NOSUCHCD")
    with pytest.raises(PromoCodeNotFoundError):
        await OrdersService(db_session).checkout(stranger.id, None, code.code)
    assert code.status is PromoCodeStatus.ACTIVE


async def test_a_second_order_cannot_take_a_reserved_code(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    with pytest.raises(PromoCodeAlreadyUsedError):
        await _checkout(db_session, user_id, (product, 1), promo_code=code.code)


async def test_two_checkouts_race_for_one_code(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    await CartService(db_session).add_item(user_id, variant_id(product), 1)
    other_product = await make_product(db_session, price_cents=5_000)
    await db_session.commit()

    first_holds = asyncio.Event()
    second_started = asyncio.Event()

    async def first() -> bool:
        async with async_session() as session:
            await OrdersService(session).checkout(user_id, None, code.code)
            first_holds.set()
            # Holds the code's row while the second one reaches for it.
            await second_started.wait()
            await asyncio.sleep(0.3)
            await session.commit()
            return True

    async def second() -> bool:
        await first_holds.wait()
        async with async_session() as session:
            # A second tab with its own cart line: the first checkout is emptying the cart,
            # and the cart row it holds is what makes this one wait for it.
            second_started.set()
            await CartService(session).add_item(user_id, variant_id(other_product), 1)
            try:
                await OrdersService(session).checkout(user_id, None, code.code)
            except PromoCodeAlreadyUsedError:
                await session.rollback()
                return False
            await session.commit()
            return True

    results = await asyncio.gather(first(), second())

    assert sorted(results) == [False, True]
    async with async_session() as session:
        live = [
            p
            for p in (await session.scalars(select(OrderPromotion))).all()
            if p.promo_code_id == code.id and p.released_at is None
        ]
        assert len(live) == 1
        assert (await session.get(PromoCode, code.id)).status is PromoCodeStatus.RESERVED  # type: ignore[union-attr]


async def test_the_codes_row_lock_makes_the_second_reader_see_the_reservation(
    db_session: AsyncSession,
) -> None:
    user_id, _, code = await _customer_with_code(db_session)
    await db_session.commit()
    holding = asyncio.Event()

    async def first() -> None:
        async with async_session() as session:
            found = await PromoCodesService(session).usable(user_id, code.code, for_update=True)
            found.status = PromoCodeStatus.RESERVED
            holding.set()
            await asyncio.sleep(0.3)
            await session.commit()

    async def second() -> type[Exception] | None:
        await holding.wait()
        async with async_session() as session:
            try:
                await PromoCodesService(session).usable(user_id, code.code, for_update=True)
            except PromoCodeAlreadyUsedError:
                return PromoCodeAlreadyUsedError
            return None

    _, refused = await asyncio.gather(first(), second())

    assert refused is PromoCodeAlreadyUsedError


async def test_the_index_is_the_last_word_on_a_code_in_two_orders(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    other = await _checkout(db_session, user_id, (product, 1))

    db_session.add(
        OrderPromotion(
            order_id=other.id,
            user_id=user_id,
            promo_code_id=code.id,
            title="x",
            rewards=[],
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    assert order is not None


# --- While PENDING ----------------------------------------------------------------------


async def test_the_code_goes_when_its_conditions_stop_holding(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(
        db_session, reward=_code_reward(conditions=[_subtotal(15_000)])
    )
    order = await _checkout(db_session, user_id, (product, 2), promo_code=code.code)
    assert order.total_cents == 18_000
    service = OrdersService(db_session)

    await service.set_item_quantity(user_id, order.id, order.items[0].id, 1)

    assert _live(order) == []
    assert order.total_cents == 10_000
    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None
    # Not taken again on its own: a code is entered at checkout and nowhere else.
    await service.set_item_quantity(user_id, order.id, order.items[0].id, 3)
    assert _live(order) == [] and order.total_cents == 30_000


async def test_a_code_that_expires_while_pending_is_kept(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    _expire(code)
    await db_session.flush()

    await OrdersService(db_session).set_item_quantity(user_id, order.id, order.items[0].id, 2)

    assert [p.promo_code_id for p in _live(order)] == [code.id]
    assert order.total_cents == 18_000
    assert code.status is PromoCodeStatus.RESERVED


# --- Cancelling -------------------------------------------------------------------------


async def test_cancelling_gives_the_reserved_code_back(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    await OrdersService(db_session).cancel(user_id, order.id)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None
    assert _live(order) == []
    # It can go on another order.
    again = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    assert again.total_cents == 9_000


async def test_the_owner_cancelling_a_billed_order_gives_the_code_back(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)

    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.ACTIVE
    # The bill stands: what was asked of the customer is not rewritten by the cancellation.
    assert order.total_cents == 9_000


async def test_cancelling_a_pending_order_reads_as_what_it_would_cost(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    assert order.total_cents == 9_000

    await OrdersService(db_session).cancel(user_id, order.id)

    assert order.total_cents == 10_000


async def test_cancelling_a_billed_promotion_order_keeps_the_billed_total(
    db_session: AsyncSession,
) -> None:
    """Stage 2's reviewer remark: a frozen order's total is the bill, cancel or not."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(10)])
    order = await _checkout(db_session, user.id, (product, 1))
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    assert order.total_cents == 9_000

    await service.cancel(user.id, order.id)

    assert order.total_cents == 9_000
    assert all(p.released_at is not None for p in order.promotions)


async def test_the_owner_cancelling_a_paid_order_gives_the_spent_code_back(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    assert code.status is PromoCodeStatus.USED

    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None
    assert _live(order) == []
    # The sum that was paid is the owner's to settle: the total is not rewritten.
    assert order.total_cents == 9_000
    again = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    assert again.total_cents == 9_000 and code.used_order_id == again.id


async def test_a_spent_code_that_has_expired_comes_back_as_an_expired_one(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    _expire(code)

    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.ACTIVE
    assert code_status(code, datetime.now(UTC)) is PromoCodeView.EXPIRED
    with pytest.raises(PromoCodeExpiredError):
        await PromoCodesService(db_session).usable(user_id, code.code)


async def test_undoing_the_cancellation_of_a_paid_order_takes_the_code_again(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    await service.update_status(order.id, OrderStatus.PENDING)

    [participation] = _live(order)
    assert participation.promo_code_id == code.id
    assert code.status is PromoCodeStatus.RESERVED and code.used_order_id == order.id
    assert order.total_cents == 9_000
    # Paying again spends it again.
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CONFIRMED)
    assert code.status is PromoCodeStatus.USED


async def test_undoing_the_cancellation_after_the_code_went_elsewhere_drops_it(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    other = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    await _pay(db_session, other)
    assert code.status is PromoCodeStatus.USED and code.used_order_id == other.id

    await service.update_status(order.id, OrderStatus.PENDING)

    assert _live(order) == []
    assert order.total_cents == 10_000
    assert code.status is PromoCodeStatus.USED and code.used_order_id == other.id


async def test_undoing_the_cancellation_after_the_code_expired_drops_it(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    _expire(code)

    await service.update_status(order.id, OrderStatus.PENDING)

    assert _live(order) == [] and order.total_cents == 10_000
    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None


async def test_deleting_a_paid_order_does_not_give_the_spent_code_back(
    db_session: AsyncSession,
) -> None:
    for final in (OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED):
        user_id, product, code = await _customer_with_code(db_session)
        order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
        service = await _pay(db_session, order)
        for step in (OrderStatus.READY, OrderStatus.COMPLETED):
            if final is not OrderStatus.CONFIRMED and order.status is not final:
                await service.update_status(order.id, step)
        assert code.status is PromoCodeStatus.USED

        await service.delete(order.id)
        await db_session.flush()
        await db_session.refresh(code)

        assert code.status is PromoCodeStatus.USED


async def test_deleting_a_billed_order_gives_its_reserved_code_back(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    assert code.status is PromoCodeStatus.RESERVED

    await service.delete(order.id)
    await db_session.flush()
    await db_session.refresh(code)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None


async def test_cancelling_a_paid_order_from_ready_gives_the_code_back(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.READY)

    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None


async def test_undoing_a_cancellation_made_from_a_billed_order_takes_the_code_again(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert code.status is PromoCodeStatus.ACTIVE

    await service.update_status(order.id, OrderStatus.PENDING)

    assert code.status is PromoCodeStatus.RESERVED and code.used_order_id == order.id
    assert order.total_cents == 9_000


async def test_an_earned_code_never_comes_back_once_its_earner_is_cancelled(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    for earner_first in (True, False):
        earning, code = await _earn_code(db_session, user.id, product)
        await db_session.execute(
            Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
        )
        spent = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
        service = await _pay(db_session, spent)
        order_ids = [earning.id, spent.id] if earner_first else [spent.id, earning.id]

        for order_id in order_ids:
            await service.update_status(order_id, OrderStatus.CANCELLED_BY_OWNER)

        assert code.status is PromoCodeStatus.REVOKED and code.used_order_id is None
        with pytest.raises(PromoCodeNotFoundError):
            await PromoCodesService(db_session).usable(user.id, code.code)


async def test_an_earned_code_in_a_billed_order_is_revoked_when_both_are_cancelled(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    earning, code = await _earn_code(db_session, user.id, product)
    await db_session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    holder = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
    service = OrdersService(db_session)
    await service.update_status(holder.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(earning.id, OrderStatus.CANCELLED_BY_OWNER)

    await service.update_status(holder.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.REVOKED


async def test_a_code_of_an_uncancelled_earner_goes_back_active(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    _, code = await _earn_code(db_session, user.id, product)
    await db_session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    spent = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, spent)

    await service.update_status(spent.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.ACTIVE


async def test_a_reserved_code_held_by_another_order_is_not_freed_by_this_one(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    other = await _checkout(db_session, user_id, (product, 1))
    code.used_order_id = other.id
    await db_session.flush()
    [participation] = _live(order)

    await OrderPromotionsService(db_session)._free_code(participation)

    assert code.status is PromoCodeStatus.RESERVED and code.used_order_id == other.id


async def test_a_cancelled_paid_order_still_shows_the_code_that_gave_its_discount(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    shown = (await PromoCodesService(db_session).for_orders([order]))[order.id]

    assert shown.used is not None and shown.used.id == code.id


async def test_a_cancelled_pending_order_shows_no_code_even_after_it_is_reused(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    await OrdersService(db_session).cancel(user_id, order.id)
    other = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    await _pay(db_session, other)
    assert code.status is PromoCodeStatus.USED and code.used_order_id == other.id

    shown = await PromoCodesService(db_session).for_orders([order, other])

    assert shown[order.id].used is None
    assert shown[other.id].used is not None and shown[other.id].used.id == code.id


async def test_a_cancelled_paid_order_shows_the_codes_current_status(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = await _pay(db_session, order)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    other = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    shown = (await PromoCodesService(db_session).for_orders([order]))[order.id]

    assert shown.used is not None and shown.used.id == code.id
    assert shown.used.status is PromoCodeStatus.RESERVED and code.used_order_id == other.id


async def test_a_code_dropped_by_an_edit_is_not_shown_after_the_cancel(
    db_session: AsyncSession,
) -> None:
    user_id, product, code = await _customer_with_code(
        db_session, reward=_code_reward(conditions=[_subtotal(15_000)])
    )
    order = await _checkout(db_session, user_id, (product, 2), promo_code=code.code)
    service = OrdersService(db_session)
    await service.set_item_quantity(user_id, order.id, order.items[0].id, 1)
    assert _live(order) == []
    await service.cancel(user_id, order.id)

    shown = (await PromoCodesService(db_session).for_orders([order]))[order.id]

    assert shown.used is None


async def test_restoring_does_not_put_the_code_back(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    service = OrdersService(db_session)
    await service.cancel(user_id, order.id)

    await service.restore(user_id, order.id)

    assert _live(order) == [] and order.total_cents == 10_000
    assert code.status is PromoCodeStatus.ACTIVE


async def test_deleting_an_order_gives_its_code_back(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)

    await OrdersService(db_session).delete(order.id)
    await db_session.flush()
    await db_session.refresh(code)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None


async def test_cancelling_the_earning_order_revokes_an_unused_code(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    order, code = await _earn_code(db_session, user.id, product)

    await OrdersService(db_session).update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.REVOKED
    with pytest.raises(PromoCodeNotFoundError):
        await PromoCodesService(db_session).usable(user.id, code.code)


async def test_a_used_code_survives_the_cancellation_of_the_earning_order(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    earning, code = await _earn_code(db_session, user.id, product)
    spent = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
    await _pay(db_session, spent)
    assert code.status is PromoCodeStatus.USED

    await OrdersService(db_session).update_status(earning.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.USED


async def test_a_code_reserved_in_a_pending_order_is_taken_from_it(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    earning, code = await _earn_code(db_session, user.id, product)
    await db_session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    holder = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
    assert holder.total_cents == 9_000
    revision = holder.revision

    await OrdersService(db_session).update_status(earning.id, OrderStatus.CANCELLED_BY_OWNER)
    await db_session.refresh(holder, attribute_names=["promotions", "total_cents", "revision"])

    assert code.status is PromoCodeStatus.REVOKED
    assert _live(holder) == [] and holder.total_cents == 10_000
    assert holder.revision == revision + 1


async def test_a_code_reserved_in_a_billed_order_stays_with_it(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    earning, code = await _earn_code(db_session, user.id, product)
    await db_session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    holder = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)
    await OrdersService(db_session).update_status(holder.id, OrderStatus.AWAITING_PAYMENT)

    await OrdersService(db_session).update_status(earning.id, OrderStatus.CANCELLED_BY_OWNER)

    assert code.status is PromoCodeStatus.RESERVED
    assert holder.total_cents == 9_000


# --- Reading ----------------------------------------------------------------------------


async def test_the_customers_codes_with_their_status_as_of_now(db_session: AsyncSession) -> None:
    user_id, product, code = await _customer_with_code(db_session)
    other = await make_user(db_session)
    now = datetime.now(UTC)

    rows = await PromoCodesService(db_session).list_for_user(user_id)
    assert [(c.id, title) for c, title in rows] == [(code.id, "Акция")]
    assert code_status(code, now) is PromoCodeView.ACTIVE
    assert (await PromoCodesService(db_session).list_for_user(other.id)) == []

    _expire(code)
    assert code_status(code, now) is PromoCodeView.EXPIRED
    code.status = PromoCodeStatus.USED
    assert code_status(code, now) is PromoCodeView.USED

    response = promo_code_response(code, "Акция", now)
    assert response.status is PromoCodeView.USED
    assert response.rewards and response.conditions == []
    assert product is not None


async def test_orders_know_the_code_they_hold_and_the_ones_they_earned(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    earning, code = await _earn_code(db_session, user.id, product)
    await db_session.execute(
        Promotion.__table__.update().values(is_enabled=False)  # type: ignore[attr-defined]
    )
    holder = await _checkout(db_session, user.id, (product, 1), promo_code=code.code)

    found = await PromoCodesService(db_session).for_orders([earning, holder])

    assert [c.id for c in found[earning.id].issued] == [code.id]
    assert found[earning.id].used is None
    assert found[holder.id].used is not None and found[holder.id].used.id == code.id  # type: ignore[union-attr]
    assert found[holder.id].issued == []


async def test_user_roles_are_not_needed_to_see_own_codes(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.SUPER_ADMIN)
    assert await PromoCodesService(db_session).list_for_user(admin.id) == []


async def test_dropping_the_last_product_cancels_and_moves_the_revision(
    db_session: AsyncSession,
) -> None:
    """The lines changed, so the revision moves even though the order ends cancelled."""
    user_id, product, code = await _customer_with_code(db_session)
    order = await _checkout(db_session, user_id, (product, 1), promo_code=code.code)
    revision = order.revision

    drops = await OrdersService(db_session).drop_product(product.id)

    assert [d.is_cancelled for d in drops] == [True]
    assert order.status is OrderStatus.CANCELLED_BY_OWNER
    assert order.revision == revision + 1
    assert code.status is PromoCodeStatus.ACTIVE
