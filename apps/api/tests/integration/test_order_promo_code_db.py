"""A promo code put on, and taken off, an order that's already been placed."""

import uuid
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.cart.service import CartService
from app.catalog.models import Product
from app.cycles.models import CycleStatus, OrderCycle
from app.db import get_session
from app.main import app
from app.orders.models import DiscountKind, Order, OrderStatus
from app.orders.service import OrderChangedError, OrderNotEditableError, OrdersService
from app.promotions.code_errors import (
    OrderHasPromoCodeError,
    PromoCodeAlreadyUsedError,
    PromoCodeConditionsNotMetError,
    PromoCodeError,
    PromoCodeExpiredError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
    PromoCodeUsedThisCycleError,
)
from app.promotions.models import OrderPromotion, PromoCode, PromoCodeStatus, Promotion
from app.promotions.owner_codes import OwnerCodeDraft, OwnerCodesService
from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    ConditionType,
    DiscountReward,
    GiftKind,
    GiftReward,
    RewardType,
    SubtotalCondition,
    dump_conditions,
    dump_rewards,
)
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

NOW = datetime.now(UTC)


def _percent(value: int) -> DiscountReward:
    return DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value)


def _gift() -> GiftReward:
    return GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, title="Mystery box")


def _subtotal(min_cents: int) -> SubtotalCondition:
    return SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=min_cents)


async def _promotion(
    session: AsyncSession, *, rewards: Sequence[DiscountReward | GiftReward]
) -> Promotion:
    promotion = Promotion(
        slug=f"promo-{uuid.uuid4().hex[:10]}",
        title="Акция",
        starts_at=NOW - timedelta(days=1),
        ends_at=NOW + timedelta(days=1),
        is_enabled=True,
        conditions=[],
        rewards=dump_rewards(list(rewards)),
    )
    session.add(promotion)
    await session.flush()
    return promotion


async def _issued(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    code: str = "ABCD2345",
    conditions: Sequence[AnyCondition] = (),
    rewards: Sequence[AnyCodeReward] | None = None,
    valid_from: datetime | None = None,
    expires_at: datetime | None = None,
) -> PromoCode:
    """A code issued to this customer, by a promotion that is over."""
    promotion = await _promotion(session, rewards=[_percent(1)])
    promotion.is_enabled = False
    issued = PromoCode(
        code=code,
        user_id=user_id,
        promotion_id=promotion.id,
        conditions=dump_conditions(list(conditions)),
        rewards=dump_rewards(list(rewards if rewards is not None else [_percent(10)])),
        valid_from=valid_from or NOW - timedelta(days=2),
        expires_at=expires_at or NOW + timedelta(days=2),
        status=PromoCodeStatus.ACTIVE,
    )
    session.add(issued)
    await session.flush()
    return issued


async def _owner_code(
    session: AsyncSession,
    code: str = "LETO2026",
    *,
    uses_per_customer: int | None = 1,
    rewards: Sequence[AnyCodeReward] | None = None,
) -> Promotion:
    return await OwnerCodesService(session).create(
        OwnerCodeDraft(
            code=code,
            title="Скидка",
            description_html=None,
            starts_at=NOW - timedelta(days=1),
            ends_at=None,
            is_enabled=True,
            assigned_user_ids=[],
            uses_per_customer=uses_per_customer,
            conditions=[],
            rewards=rewards if rewards is not None else [_percent(10)],
        )
    )


async def _order(
    session: AsyncSession, user_id: uuid.UUID, product: Product, quantity: int = 2
) -> Order:
    await CartService(session).add_item(user_id, variant_id(product), quantity)
    return await OrdersService(session).checkout(user_id, note=None)


async def _placed(session: AsyncSession) -> tuple[uuid.UUID, Product, Order, OrderCycle]:
    """An order of two units at 100 сом each, no code on it."""
    user = await make_user(session)
    cycle = await make_cycle(session)
    product = await make_product(session, price_cents=10_000)
    return user.id, product, await _order(session, user.id, product), cycle


def _live(order: Order) -> list[OrderPromotion]:
    return [p for p in order.promotions if p.released_at is None]


# --- Applying -----------------------------------------------------------------------------


async def test_an_issued_code_is_reserved_by_the_order(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id)
    revision = order.revision

    order = await OrdersService(db_session).add_promo_code(
        user_id, order.id, " abcd 2345 ", revision=revision
    )

    assert code.status is PromoCodeStatus.RESERVED and code.used_order_id == order.id
    [participation] = _live(order)
    assert participation.promo_code_id == code.id
    assert order.total_cents == 18_000
    assert order.revision == revision + 1


async def test_it_comes_to_what_checkout_with_the_code_would(db_session: AsyncSession) -> None:
    """Counted after the promotions, with its gifts — the same order either way."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    await _promotion(db_session, rewards=[_percent(50)])
    await _owner_code(db_session, rewards=[_percent(10), _gift()])
    other = await make_user(db_session)
    await CartService(db_session).add_item(other.id, variant_id(product), 2)
    at_checkout = await OrdersService(db_session).checkout(other.id, None, "LETO2026")

    order = await _order(db_session, user.id, product)
    order = await OrdersService(db_session).add_promo_code(user.id, order.id, "leto2026")

    assert order.total_cents == at_checkout.total_cents == 9_000
    assert [g.title for g in order.gifts] == [g.title for g in at_checkout.gifts] == ["Mystery box"]
    assert {p.title for p in _live(order)} == {p.title for p in _live(at_checkout)}


async def test_paying_the_order_spends_the_code(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id)
    service = OrdersService(db_session)
    await service.add_promo_code(user_id, order.id, code.code)

    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CONFIRMED)

    assert code.status is PromoCodeStatus.USED


async def test_the_owners_discount_and_the_promotions_stay(db_session: AsyncSession) -> None:
    """A code changes no line: nothing the admin gave, and no promotion, comes off for it."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(db_session, rewards=[_gift()])
    order = await _order(db_session, user.id, product)
    order.discount_kind, order.discount_value = DiscountKind.PERCENT, 50
    # The owner has made the promotion's conditions stricter since: a recount would drop it.
    promotion.conditions = dump_conditions([_subtotal(1_000_000)])
    await db_session.flush()
    await _issued(db_session, user.id)

    order = await OrdersService(db_session).add_promo_code(user.id, order.id, "ABCD2345")

    assert order.discount_value == 50
    assert {p.promotion_id for p in _live(order)} == {promotion.id, None}
    assert order.total_cents == 9_000


async def test_the_code_goes_when_an_edit_breaks_its_conditions(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id, conditions=[_subtotal(20_000)])
    service = OrdersService(db_session)
    order = await service.add_promo_code(user_id, order.id, code.code)

    await service.set_item_quantity(user_id, order.id, order.items[0].id, 1)
    assert _live(order) == [] and code.status is PromoCodeStatus.ACTIVE

    # And may be entered again once they hold — the order is where it is entered now.
    await service.set_item_quantity(user_id, order.id, order.items[0].id, 2)
    order = await service.add_promo_code(user_id, order.id, code.code)
    assert order.total_cents == 18_000


# --- Refusals -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("terms", "expected"),
    [
        ({"expires_at": NOW - timedelta(hours=1)}, PromoCodeExpiredError),
        ({"valid_from": NOW + timedelta(hours=1)}, PromoCodeNotYetValidError),
        ({"conditions": [_subtotal(20_001)]}, PromoCodeConditionsNotMetError),
    ],
)
async def test_checkouts_refusals_leave_the_order_alone(
    db_session: AsyncSession, terms: dict[str, object], expected: type[PromoCodeError]
) -> None:
    user_id, _, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id, **terms)  # type: ignore[arg-type]

    with pytest.raises(expected):
        await OrdersService(db_session).add_promo_code(user_id, order.id, code.code)

    assert _live(order) == [] and order.total_cents == 20_000
    assert code.status is PromoCodeStatus.ACTIVE


async def test_somebody_elses_code_is_not_found(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    stranger = await make_user(db_session)
    code = await _issued(db_session, stranger.id)

    with pytest.raises(PromoCodeNotFoundError):
        await OrdersService(db_session).add_promo_code(user_id, order.id, code.code)


async def test_a_code_another_order_holds_is_refused(db_session: AsyncSession) -> None:
    user_id, product, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id)
    await _owner_code(db_session)
    service = OrdersService(db_session)
    await service.add_promo_code(user_id, order.id, code.code)
    second = await _order(db_session, user_id, product)

    with pytest.raises(PromoCodeAlreadyUsedError):
        await service.add_promo_code(user_id, second.id, code.code)

    await service.remove_promo_code(user_id, order.id)
    assert (await service.add_promo_code(user_id, second.id, code.code)).total_cents == 18_000


async def test_an_owner_code_is_once_per_the_orders_own_cycle(db_session: AsyncSession) -> None:
    user_id, product, order, _ = await _placed(db_session)
    await _owner_code(db_session, uses_per_customer=5)
    service = OrdersService(db_session)
    order = await service.add_promo_code(user_id, order.id, "LETO2026")
    assert _live(order)[0].code_cycle_id == order.cycle_id
    second = await _order(db_session, user_id, product)

    with pytest.raises(PromoCodeUsedThisCycleError):
        await service.add_promo_code(user_id, second.id, "LETO2026")


async def test_an_order_takes_one_code(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    code = await _issued(db_session, user_id)
    await _owner_code(db_session)
    service = OrdersService(db_session)
    await service.add_promo_code(user_id, order.id, "LETO2026")

    with pytest.raises(OrderHasPromoCodeError):
        await service.add_promo_code(user_id, order.id, code.code)

    assert code.status is PromoCodeStatus.ACTIVE


async def test_the_gate_is_every_edits_gate(db_session: AsyncSession) -> None:
    user_id, _, order, cycle = await _placed(db_session)
    code = await _issued(db_session, user_id)
    service = OrdersService(db_session)

    with pytest.raises(OrderChangedError):
        await service.add_promo_code(user_id, order.id, code.code, revision=order.revision + 1)

    order = await service.add_promo_code(user_id, order.id, code.code)
    cycle.status = CycleStatus.CLOSED
    cycle.closed_at = datetime.now(UTC)
    await db_session.flush()

    with pytest.raises(OrderNotEditableError):
        await service.remove_promo_code(user_id, order.id)
    with pytest.raises(OrderNotEditableError):
        await service.add_promo_code(user_id, order.id, code.code)
    assert code.status is PromoCodeStatus.RESERVED


# --- Taking off ---------------------------------------------------------------------------


async def test_taking_the_code_off_gives_it_back(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=10_000)
    promotion = await _promotion(db_session, rewards=[_percent(50)])
    order = await _order(db_session, user.id, product)
    code = await _issued(db_session, user.id, rewards=[_percent(10), _gift()])
    service = OrdersService(db_session)
    order = await service.add_promo_code(user.id, order.id, code.code)
    revision = order.revision

    order = await service.remove_promo_code(user.id, order.id, revision=revision)

    assert code.status is PromoCodeStatus.ACTIVE and code.used_order_id is None
    assert [p.promotion_id for p in _live(order)] == [promotion.id]
    assert order.gifts == [] and order.total_cents == 10_000
    assert order.revision == revision + 1


async def test_an_owner_code_taken_off_may_be_entered_again(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    await _owner_code(db_session)
    service = OrdersService(db_session)
    await service.add_promo_code(user_id, order.id, "LETO2026")

    assert (await service.remove_promo_code(user_id, order.id)).total_cents == 20_000
    assert (await service.add_promo_code(user_id, order.id, "LETO2026")).total_cents == 18_000


async def test_taking_off_nothing_changes_nothing(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    revision = order.revision

    order = await OrdersService(db_session).remove_promo_code(user_id, order.id)

    assert order.revision == revision


# --- Over HTTP ----------------------------------------------------------------------------


async def test_the_response_names_the_code_of_either_kind(db_session: AsyncSession) -> None:
    user_id, _, order, _ = await _placed(db_session)
    await _issued(db_session, user_id)
    renamed = await _owner_code(db_session)
    order_id = order.id
    url = f"/orders/{order_id}/promo-code"

    async def session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, role=Role.CUSTOMER)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            revision = (await http.get(f"/orders/{order_id}")).json()["revision"]
            added = await http.post(url, json={"revision": revision, "code": "ABCD2345"})
            assert added.status_code == 200
            body = added.json()
            assert body["promoCode"]["code"] == "ABCD2345"
            assert body["promoCode"]["status"] == "RESERVED"
            assert [(p["isPromoCode"], p["discountCents"]) for p in body["promotions"]] == [
                (True, 2_000)
            ]

            again = await http.post(url, json={"revision": body["revision"], "code": "LETO2026"})
            assert (again.status_code, again.json()["detail"]) == (409, "order_has_promo_code")
            stale = await http.delete(url, params={"revision": revision})
            assert (stale.status_code, stale.json()["detail"]) == (409, "order_changed")

            removed = await http.delete(url, params={"revision": body["revision"]})
            assert removed.status_code == 200
            assert removed.json()["promoCode"] is None and removed.json()["promotions"] == []

            unknown = await http.post(
                url, json={"revision": removed.json()["revision"], "code": "NOPE"}
            )
            assert (unknown.status_code, unknown.json()["detail"]) == (404, "promo_code_not_found")

            await http.post(url, json={"revision": removed.json()["revision"], "code": "leto2026"})
            # The owner renames the code: the order keeps the string the customer typed.
            renamed.code = "ZIMA2026"
            await db_session.flush()
            body = (await http.get(f"/orders/{order_id}")).json()
            assert body["promoCode"]["code"] == "LETO2026"
            assert body["promoCode"]["status"] == "RESERVED"
            assert body["promoCode"]["rewards"][0]["value"] == 10
            [entry] = body["promotions"]
            assert entry["isPromoCode"] is True and entry["promotionId"] is not None
    finally:
        app.dependency_overrides.clear()
