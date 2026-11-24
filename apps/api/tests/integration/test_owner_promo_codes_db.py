"""The owner's promo codes on a real database: created by hand, typed at checkout."""

import uuid
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.cart.models import CartItem
from app.cart.service import CartService
from app.catalog.models import Product
from app.cycles.models import CycleStatus
from app.cycles.service import CyclesService
from app.db import get_session
from app.main import app
from app.orders.discounts import order_totals
from app.orders.models import DiscountKind, Order, OrderStatus
from app.orders.service import OrdersService
from app.promotions.code_errors import (
    PromoCodeAlreadyUsedError,
    PromoCodeConditionsNotMetError,
    PromoCodeExpiredError,
    PromoCodeInvalidError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
    PromoCodeTakenError,
    PromoCodeUsedThisCycleError,
    PromoCodeUserNotFoundError,
)
from app.promotions.code_schemas import personal_promo_code_response
from app.promotions.codes import CODE_ALPHABET, PromoCodesService, PromoCodeView
from app.promotions.models import OrderPromotion, PromoCode, Promotion
from app.promotions.orders import CODE_SORT_ORDER, OrderPromotionsService, active_promotions
from app.promotions.owner_codes import OwnerCodeDraft, OwnerCodesService
from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    ConditionType,
    DiscountReward,
    GiftKind,
    GiftReward,
    PromoCodeReward,
    RewardType,
    SubtotalCondition,
    dump_rewards,
)
from app.promotions.service import PromotionNotFoundError, PromotionsService
from app.promotions.sweep import unannounced_promotions
from app.telegram.notify import notify_personal_promo_code
from app.telegram.service import Delivery
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

NOW = datetime.now(UTC)


def _percent(value: int) -> DiscountReward:
    return DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value)


def _gift() -> GiftReward:
    return GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, title="Mystery box")


def _subtotal(min_cents: int) -> SubtotalCondition:
    return SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=min_cents)


async def _make_code(
    session: AsyncSession,
    *,
    code: str | None = None,
    assigned_user_ids: Sequence[uuid.UUID] = (),
    uses_per_customer: int | None = 1,
    conditions: Sequence[AnyCondition] = (),
    rewards: Sequence[AnyCodeReward] | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    is_enabled: bool = True,
) -> Promotion:
    return await OwnerCodesService(session).create(
        OwnerCodeDraft(
            code=code,
            title="Скидка",
            description_html=None,
            starts_at=starts_at or NOW - timedelta(days=1),
            ends_at=ends_at,
            is_enabled=is_enabled,
            assigned_user_ids=assigned_user_ids,
            uses_per_customer=uses_per_customer,
            conditions=conditions,
            rewards=rewards if rewards is not None else [_percent(10)],
        )
    )


async def _checkout(
    session: AsyncSession,
    user_id: uuid.UUID,
    *lines: tuple[Product, int],
    promo_code: str | None = None,
) -> Order:
    for product, quantity in lines:
        await CartService(session).add_item(user_id, variant_id(product), quantity)
    return await OrdersService(session).checkout(user_id, note=None, promo_code=promo_code)


async def _cycle_id(session: AsyncSession) -> uuid.UUID:
    cycle = await CyclesService(session).get_active_cycle()
    assert cycle is not None
    return cycle.id


async def _next_cycle(session: AsyncSession) -> None:
    """Closes the collecting cycle and opens another."""
    cycle = await CyclesService(session).get_active_cycle()
    assert cycle is not None
    cycle.status = CycleStatus.CLOSED
    await session.flush()
    await make_cycle(session, deadline_at=cycle.deadline_at + timedelta(days=7))


def _live(order: Order) -> list[OrderPromotion]:
    return [p for p in order.promotions if p.released_at is None]


async def _shop(session: AsyncSession, price_cents: int = 10_000) -> Product:
    await make_cycle(session)
    return await make_product(session, price_cents=price_cents)


# --- Creating ---------------------------------------------------------------------------


async def test_no_code_means_one_is_generated(db_session: AsyncSession) -> None:
    promotion = await _make_code(db_session)

    assert promotion.code is not None and len(promotion.code) == 8
    assert set(promotion.code) <= set(CODE_ALPHABET)
    assert promotion.slug == f"promo-code-{promotion.id.hex}"
    assert promotion.announce is False


async def test_a_typed_code_is_normalised(db_session: AsyncSession) -> None:
    promotion = await _make_code(db_session, code=" leto-2026 ")

    assert promotion.code == "LETO-2026"


async def test_a_malformed_code_is_refused(db_session: AsyncSession) -> None:
    with pytest.raises(PromoCodeInvalidError):
        await _make_code(db_session, code="ab c")


async def test_a_code_string_is_unique_among_owner_codes_archived_included(
    db_session: AsyncSession,
) -> None:
    first = await _make_code(db_session, code="LETO2026")
    with pytest.raises(PromoCodeTakenError):
        await _make_code(db_session, code="leto2026")

    first.deleted_at = NOW
    await db_session.flush()
    with pytest.raises(PromoCodeTakenError):
        await _make_code(db_session, code="LETO2026")


async def test_a_code_string_is_unique_against_issued_codes(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    template = await _make_code(db_session)
    db_session.add(
        PromoCode(
            code="ISSUED77",
            user_id=user.id,
            promotion_id=template.id,
            conditions=[],
            rewards=dump_rewards([_percent(5)]),
            valid_from=NOW,
            expires_at=NOW + timedelta(days=1),
        )
    )
    await db_session.flush()

    with pytest.raises(PromoCodeTakenError):
        await _make_code(db_session, code="issued77")


async def test_an_unknown_or_erased_customer_cannot_be_assigned(db_session: AsyncSession) -> None:
    with pytest.raises(PromoCodeUserNotFoundError):
        await _make_code(db_session, assigned_user_ids=[uuid.uuid4()])
    erased = await make_user(db_session)
    erased.deleted_at = NOW
    await db_session.flush()
    with pytest.raises(PromoCodeUserNotFoundError):
        await _make_code(db_session, assigned_user_ids=[erased.id])


async def test_updating_keeps_or_replaces_the_string(db_session: AsyncSession) -> None:
    service = OwnerCodesService(db_session)
    promotion = await _make_code(db_session, code="LETO2026")
    other = await _make_code(db_session, code="ZIMA2026")

    def draft(code: str | None) -> OwnerCodeDraft:
        return OwnerCodeDraft(
            code=code,
            title="Другое",
            description_html=None,
            starts_at=NOW,
            ends_at=None,
            is_enabled=True,
            assigned_user_ids=[],
            uses_per_customer=1,
            conditions=[],
            rewards=[_percent(5)],
        )

    await service.update(promotion.id, draft("leto2026"))
    assert promotion.code == "LETO2026" and promotion.title == "Другое"
    with pytest.raises(PromoCodeTakenError):
        await service.update(promotion.id, draft(other.code))
    await service.update(promotion.id, draft(None))
    assert promotion.code not in (None, "LETO2026")


async def test_issuing_skips_a_string_an_owner_code_holds(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="TAKEN123")
    reward = PromoCodeReward(
        type=RewardType.PROMO_CODE, valid_days=30, conditions=[], rewards=[_percent(10)]
    )
    db_session.add(
        Promotion(
            slug="earner",
            title="Акция",
            starts_at=NOW - timedelta(days=1),
            ends_at=NOW + timedelta(days=1),
            conditions=[],
            rewards=dump_rewards([reward]),
        )
    )
    await db_session.flush()
    order = await _checkout(db_session, user.id, (product, 1))
    strings = iter(["TAKEN123", "FRESH234"])
    monkeypatch.setattr("app.promotions.codes.generate_code", lambda: next(strings))

    issued = await PromoCodesService(db_session).on_paid(order)

    assert [c.code for c in issued] == ["FRESH234"]


# --- Isolation --------------------------------------------------------------------------


async def test_an_owner_code_is_never_automatic(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="SECRET10")
    promotion.announce = True
    await db_session.flush()
    service = PromotionsService(db_session)

    assert await active_promotions(db_session, NOW) == []
    assert await service.list_active() == []
    with pytest.raises(PromotionNotFoundError):
        await service.get_active(promotion.slug)
    assert await service.list_all() == []
    assert await OwnerCodesService(db_session).list_all() == [promotion]
    assert await unannounced_promotions(db_session, NOW) == []
    with pytest.raises(PromotionNotFoundError):
        await service.get(promotion.id)
    assert await service.get(promotion.id, owner_code=True) is promotion
    # A cart without the code gets nothing from it.
    order = await _checkout(db_session, user.id, (product, 1))
    assert order.total_cents == 10_000 and _live(order) == []


async def test_an_automatic_promotion_is_not_a_promo_code(db_session: AsyncSession) -> None:
    promotion = Promotion(
        slug="plain",
        title="Акция",
        starts_at=NOW,
        conditions=[],
        rewards=dump_rewards([_percent(5)]),
    )
    db_session.add(promotion)
    await db_session.flush()

    with pytest.raises(PromotionNotFoundError):
        await OwnerCodesService(db_session).get(promotion.id)
    assert await OwnerCodesService(db_session).list_all() == []


# --- Checkout ---------------------------------------------------------------------------


async def test_checkout_takes_the_code_as_an_ordinary_participation(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="LETO-2026")

    order = await _checkout(db_session, user.id, (product, 2), promo_code=" leto - 2026 ")

    [participation] = _live(order)
    assert participation.promotion_id == promotion.id and participation.promo_code_id is None
    assert participation.title == "Промокод LETO-2026"
    assert participation.sort_order == CODE_SORT_ORDER
    assert order.total_cents == 18_000
    assert order_totals(order).promo_by_layer[participation.id] == 2_000


async def test_a_gift_code_adds_the_gift(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="GIFT2026", rewards=[_gift()])

    order = await _checkout(db_session, user.id, (product, 1), promo_code="GIFT2026")

    assert [g.title for g in order.gifts] == ["Mystery box"]
    assert order.total_cents == 10_000


async def test_the_code_is_counted_after_the_promotions(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    db_session.add(
        Promotion(
            slug="ten",
            title="Акция",
            starts_at=NOW - timedelta(days=1),
            conditions=[],
            rewards=dump_rewards([_percent(10)]),
        )
    )
    await _make_code(db_session, code="LETO2026")

    order = await _checkout(db_session, user.id, (product, 1), promo_code="LETO2026")

    # 10% off the full price, then 10% off what is left.
    assert order.total_cents == 8_100


async def test_the_check_reports_an_open_ended_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026")
    await CartService(db_session).add_item(user.id, variant_id(product), 3)

    result = await CartService(db_session).check_promo_code(user.id, "leto2026")

    assert result.code.code == "LETO2026" and result.code.expires_at is None
    assert result.discount_cents == 3_000 and result.payable_cents == 27_000


async def test_a_general_code_is_used_once_by_each_customer(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026")

    a_order = await _checkout(db_session, alice.id, (product, 1), promo_code="LETO2026")
    b_order = await _checkout(db_session, bob.id, (product, 1), promo_code="LETO2026")

    assert a_order.total_cents == b_order.total_cents == 9_000
    await CartService(db_session).add_item(alice.id, variant_id(product), 1)
    with pytest.raises(PromoCodeAlreadyUsedError):
        await OrdersService(db_session).checkout(alice.id, None, "LETO2026")
    with pytest.raises(PromoCodeAlreadyUsedError):
        await CartService(db_session).check_promo_code(alice.id, "LETO2026")


async def test_a_cancelled_order_gives_a_general_code_back(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026")
    order = await _checkout(db_session, alice.id, (product, 1), promo_code="LETO2026")

    await OrdersService(db_session).cancel(alice.id, order.id)

    again = await _checkout(db_session, alice.id, (product, 1), promo_code="LETO2026")
    assert again.total_cents == 9_000


async def test_a_personal_code_is_for_its_customer_alone(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="ALICE100", assigned_user_ids=[alice.id])

    await CartService(db_session).add_item(bob.id, variant_id(product), 1)
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(bob.id, "ALICE100")
    with pytest.raises(PromoCodeNotFoundError):
        await OrdersService(db_session).checkout(bob.id, None, "ALICE100")

    order = await _checkout(db_session, alice.id, (product, 1), promo_code="ALICE100")
    assert order.total_cents == 9_000
    await CartService(db_session).add_item(alice.id, variant_id(product), 1)
    with pytest.raises(PromoCodeAlreadyUsedError):
        await OrdersService(db_session).checkout(alice.id, None, "ALICE100")


async def test_a_personal_code_may_be_given_to_several_customers(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    carol = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="FRIENDS1", assigned_user_ids=[alice.id, bob.id])

    for user in (alice, bob):
        order = await _checkout(db_session, user.id, (product, 1), promo_code="FRIENDS1")
        assert order.total_cents == 9_000
    await CartService(db_session).add_item(carol.id, variant_id(product), 1)
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(carol.id, "FRIENDS1")


async def test_taking_a_customer_off_a_code_closes_it_to_them(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    product = await _shop(db_session)
    service = OwnerCodesService(db_session)
    promotion = await _make_code(db_session, code="FRIENDS1", assigned_user_ids=[alice.id, bob.id])

    await service.update(
        promotion.id,
        OwnerCodeDraft(
            code="FRIENDS1",
            title="Скидка",
            description_html=None,
            starts_at=NOW - timedelta(days=1),
            ends_at=None,
            is_enabled=True,
            assigned_user_ids=[bob.id],
            uses_per_customer=1,
            conditions=[],
            rewards=[_percent(10)],
        ),
    )

    assert await service.assignees(promotion.id) == [bob.id]
    assert promotion.assigned_user_id == bob.id
    await CartService(db_session).add_item(alice.id, variant_id(product), 1)
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(alice.id, "FRIENDS1")


async def test_a_code_with_uses_works_once_per_cycle_until_they_run_out(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="TWICE001", uses_per_customer=2)

    first = await _checkout(db_session, alice.id, (product, 1), promo_code="TWICE001")
    assert first.total_cents == 9_000
    await CartService(db_session).add_item(alice.id, variant_id(product), 1)
    with pytest.raises(PromoCodeUsedThisCycleError):
        await CartService(db_session).check_promo_code(alice.id, "TWICE001")
    with pytest.raises(PromoCodeUsedThisCycleError):
        await OrdersService(db_session).checkout(alice.id, None, "TWICE001")

    await _next_cycle(db_session)
    second = await _checkout(db_session, alice.id, (product, 1), promo_code="TWICE001")
    assert second.total_cents == 9_000 and second.cycle_id != first.cycle_id

    await _next_cycle(db_session)
    await CartService(db_session).add_item(alice.id, variant_id(product), 1)
    with pytest.raises(PromoCodeAlreadyUsedError):
        await OrdersService(db_session).checkout(alice.id, None, "TWICE001")


async def test_an_unlimited_code_works_in_every_cycle(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="ALWAYS01", uses_per_customer=None)
    # Stored as NULL, not turned into the column's default of one use.
    await db_session.refresh(promotion)
    assert promotion.uses_per_customer is None

    for _ in range(3):
        order = await _checkout(db_session, alice.id, (product, 1), promo_code="ALWAYS01")
        assert order.total_cents == 9_000
        await _next_cycle(db_session)


async def test_a_cancelled_use_frees_the_cycle(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="ALWAYS01", uses_per_customer=None)
    order = await _checkout(db_session, alice.id, (product, 1), promo_code="ALWAYS01")

    await OrdersService(db_session).cancel(alice.id, order.id)

    again = await _checkout(db_session, alice.id, (product, 1), promo_code="ALWAYS01")
    assert again.total_cents == 9_000


async def test_my_codes_show_a_reusable_code_as_usable_in_a_new_cycle(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="ALICE200", assigned_user_ids=[alice.id], uses_per_customer=2)
    service = OwnerCodesService(db_session)
    await _checkout(db_session, alice.id, (product, 1), promo_code="ALICE200")

    [(_, held_by, _)] = await service.personal_for_user(alice.id, await _cycle_id(db_session))
    assert held_by is not None
    await _next_cycle(db_session)
    [(_, held_by, _)] = await service.personal_for_user(alice.id, await _cycle_id(db_session))
    assert held_by is None
    await _checkout(db_session, alice.id, (product, 1), promo_code="ALICE200")
    await _next_cycle(db_session)
    [(_, held_by, _)] = await service.personal_for_user(alice.id, await _cycle_id(db_session))
    assert held_by is not None


async def test_refusals_of_an_owner_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    disabled = await _make_code(db_session, code="DISABLED1", is_enabled=False)
    archived = await _make_code(db_session, code="ARCHIVED1")
    archived.deleted_at = NOW
    await _make_code(db_session, code="FUTURE001", starts_at=NOW + timedelta(days=1))
    await _make_code(
        db_session,
        code="PAST00001",
        starts_at=NOW - timedelta(days=3),
        ends_at=NOW - timedelta(hours=1),
    )
    await db_session.flush()

    for typed, error in [
        ("NOSUCHCODE", PromoCodeNotFoundError),
        (disabled.code or "", PromoCodeNotFoundError),
        ("ARCHIVED1", PromoCodeNotFoundError),
        ("FUTURE001", PromoCodeNotYetValidError),
        ("PAST00001", PromoCodeExpiredError),
    ]:
        with pytest.raises(error):
            await CartService(db_session).check_promo_code(user.id, typed)
        with pytest.raises(error):
            await OrdersService(db_session).checkout(user.id, None, typed)


async def test_unmet_conditions_leave_no_order_and_the_cart_alone(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="BIG200000", conditions=[_subtotal(200_000)])
    await CartService(db_session).add_item(user.id, variant_id(product), 1)

    with pytest.raises(PromoCodeConditionsNotMetError):
        await OrdersService(db_session).checkout(user.id, None, "BIG200000")
    with pytest.raises(PromoCodeConditionsNotMetError):
        await CartService(db_session).check_promo_code(user.id, "BIG200000")

    assert await db_session.scalar(select(func.count()).select_from(Order)) == 0
    assert await db_session.scalar(select(func.count()).select_from(CartItem)) == 1


# --- While PENDING, and after ----------------------------------------------------------


async def test_the_code_goes_when_its_conditions_stop_holding(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026", conditions=[_subtotal(15_000)])
    order = await _checkout(db_session, user.id, (product, 2), promo_code="LETO2026")
    assert order.total_cents == 18_000
    service = OrdersService(db_session)

    await service.set_item_quantity(user.id, order.id, order.items[0].id, 1)

    assert _live(order) == [] and order.total_cents == 10_000
    # A code is on an order only because it was entered: a recount never takes it again.
    await service.set_item_quantity(user.id, order.id, order.items[0].id, 3)
    assert _live(order) == [] and order.total_cents == 30_000


async def test_the_owner_undoing_a_cancellation_takes_the_code_again(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026")
    order = await _checkout(db_session, user.id, (product, 1), promo_code="LETO2026")
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert _live(order) == []

    await service.update_status(order.id, OrderStatus.PENDING)

    [participation] = _live(order)
    assert participation.title == "Промокод LETO2026"
    assert order.total_cents == 9_000


async def test_the_undo_drops_a_code_disabled_in_between(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="LETO2026")
    order = await _checkout(db_session, user.id, (product, 1), promo_code="LETO2026")
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    promotion.is_enabled = False
    await db_session.flush()

    await service.update_status(order.id, OrderStatus.PENDING)

    assert _live(order) == [] and order.total_cents == 10_000


async def test_the_undo_drops_a_code_used_in_another_order_meanwhile(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    await _make_code(db_session, code="LETO2026")
    order = await _checkout(db_session, user.id, (product, 1), promo_code="LETO2026")
    service = OrdersService(db_session)
    await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    other = await _checkout(db_session, user.id, (product, 1), promo_code="LETO2026")

    await service.update_status(order.id, OrderStatus.PENDING)

    assert _live(order) == [] and len(_live(other)) == 1


# --- Deleting, listing ----------------------------------------------------------------


async def test_an_unused_code_is_deleted_and_a_used_one_archived(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await _shop(db_session)
    unused = await _make_code(db_session, code="UNUSED001")
    used = await _make_code(db_session, code="USED00001")
    await _checkout(db_session, user.id, (product, 1), promo_code="USED00001")
    service = OwnerCodesService(db_session)

    assert (await service.delete(unused.id)).deleted is True
    assert (await service.delete(used.id)).deleted is False

    assert used.deleted_at is not None
    assert await service.list_all() == []
    assert await service.list_all(include_deleted=True) == [used]
    with pytest.raises(PromoCodeNotFoundError):
        await CartService(db_session).check_promo_code(user.id, "USED00001")
    with pytest.raises(PromoCodeTakenError):
        await _make_code(db_session, code="USED00001")


async def test_participants_of_a_code(db_session: AsyncSession) -> None:
    alice = await make_user(db_session, name="Алиса")
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="LETO2026")
    await _checkout(db_session, alice.id, (product, 1), promo_code="LETO2026")
    service = OwnerCodesService(db_session)

    rows, total = await service.participants(promotion.id)

    assert total == 1 and rows[0].user.name == "Алиса"
    assert (await service.participant_counts([promotion.id]))[promotion.id] == 1


async def test_my_codes_show_a_personal_code_and_its_life(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="ALICE100", assigned_user_ids=[alice.id])
    await _make_code(db_session, code="GENERAL01")
    await _make_code(db_session, code="OFF000001", assigned_user_ids=[alice.id], is_enabled=False)
    service = OwnerCodesService(db_session)

    def status(rows: list[tuple[Promotion, uuid.UUID | None, bool]]) -> PromoCodeView:
        [(found, order_id, paid)] = rows
        assert found.id == promotion.id
        return personal_promo_code_response(
            found, datetime.now(UTC), used_order_id=order_id, used_order_paid=paid
        ).status

    cycle_id = await _cycle_id(db_session)
    assert await service.personal_for_user(bob.id, cycle_id) == []
    assert status(await service.personal_for_user(alice.id, cycle_id)) is PromoCodeView.ACTIVE
    order = await _checkout(db_session, alice.id, (product, 1), promo_code="ALICE100")
    assert status(await service.personal_for_user(alice.id, cycle_id)) is PromoCodeView.RESERVED
    orders = OrdersService(db_session)
    await orders.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await orders.update_status(order.id, OrderStatus.CONFIRMED)
    assert status(await service.personal_for_user(alice.id, cycle_id)) is PromoCodeView.USED


async def test_a_personal_code_past_its_end_reads_as_expired(db_session: AsyncSession) -> None:
    alice = await make_user(db_session)
    promotion = await _make_code(
        db_session,
        code="OLD000001",
        assigned_user_ids=[alice.id],
        starts_at=NOW - timedelta(days=5),
        ends_at=NOW - timedelta(days=1),
    )

    [(found, order_id, paid)] = await OwnerCodesService(db_session).personal_for_user(
        alice.id, None
    )

    response = personal_promo_code_response(
        found, datetime.now(UTC), used_order_id=order_id, used_order_paid=paid
    )
    assert response.status is PromoCodeView.EXPIRED and found.id == promotion.id


async def test_a_disabled_personal_code_that_was_used_stays_listed(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="ALICE100", assigned_user_ids=[alice.id])
    await _make_code(db_session, code="OFF000001", assigned_user_ids=[alice.id], is_enabled=False)
    await _checkout(db_session, alice.id, (product, 1), promo_code="ALICE100")
    await OwnerCodesService(db_session).set_enabled(promotion.id, False)

    rows = await OwnerCodesService(db_session).personal_for_user(alice.id, None)

    assert [found.id for found, _order, _paid in rows] == [promotion.id]
    assert rows[0][1] is not None


async def test_editing_a_code_of_a_deleted_customer_keeps_the_assignment(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    promotion = await _make_code(db_session, code="ALICE100", assigned_user_ids=[alice.id])
    alice.deleted_at = datetime.now(UTC)
    await db_session.flush()
    service = OwnerCodesService(db_session)

    def draft(user_id: uuid.UUID) -> OwnerCodeDraft:
        return OwnerCodeDraft(
            code="ALICE100",
            title="Новое имя",
            description_html=None,
            starts_at=NOW - timedelta(days=1),
            ends_at=None,
            is_enabled=True,
            assigned_user_ids=[user_id],
            uses_per_customer=1,
            conditions=[],
            rewards=[_percent(10)],
        )

    updated = await service.update(promotion.id, draft(alice.id))
    assert updated.title == "Новое имя"
    assert await service.assignees(promotion.id) == [alice.id]
    # A new assignment to a deleted customer is still refused.
    bob.deleted_at = datetime.now(UTC)
    await db_session.flush()
    with pytest.raises(PromoCodeUserNotFoundError):
        await service.update(promotion.id, draft(bob.id))


async def test_a_lost_race_for_the_participation_is_used_this_cycle(
    db_session: AsyncSession,
) -> None:
    alice = await make_user(db_session)
    product = await _shop(db_session)
    promotion = await _make_code(db_session, code="RACE00001")
    first = await _checkout(db_session, alice.id, (product, 1))
    first_id = first.id
    second = await _checkout(db_session, alice.id, (product, 1))
    # What a concurrent checkout would have committed between `usable` and the insert.
    db_session.add(
        OrderPromotion(
            id=uuid.uuid4(),
            order_id=first.id,
            user_id=alice.id,
            promotion_id=promotion.id,
            code_cycle_id=first.cycle_id,
            title="Скидка",
            rewards=dump_rewards([_percent(10)]),
            sort_order=CODE_SORT_ORDER,
        )
    )
    await db_session.flush()

    with pytest.raises(PromoCodeUsedThisCycleError):
        await OrderPromotionsService(db_session).attach_owner_code(second, promotion)

    held = await db_session.scalars(
        select(OrderPromotion.order_id).where(OrderPromotion.promotion_id == promotion.id)
    )
    assert list(held) == [first_id]


async def test_a_code_row_is_not_a_promotion_over_http(db_session: AsyncSession) -> None:
    owner = await make_user(db_session, role=Role.SUPER_ADMIN)
    promotion = await _make_code(db_session, code="HIDDEN001")
    promotion.announce = True
    await db_session.flush()
    owner_id, promotion_id, slug = owner.id, promotion.id, promotion.slug

    async def session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=owner_id, role=Role.SUPER_ADMIN
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            assert (await http.get(f"/promotions/{slug}")).status_code == 404
            assert (await http.get(f"/admin/promotions/{promotion_id}")).status_code == 404
            assert (await http.get(f"/admin/promo-codes/{promotion_id}")).status_code == 200
            deletion = await http.delete(f"/admin/promo-codes/{promotion_id}")
            assert deletion.status_code == 200 and deletion.json() == {"deleted": True}
    finally:
        app.dependency_overrides.clear()


# --- Telling the customer ---------------------------------------------------------------


@pytest.fixture
def personal_sends(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """The notifier opens its own session; hand it the test's, and catch what it sends."""

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.notify.async_session", factory)
    send = AsyncMock(return_value=Delivery.SENT)
    monkeypatch.setattr("app.telegram.notify.notifications_service.send_personal_promo_code", send)
    return send


async def test_the_customer_hears_of_a_personal_code(
    db_session: AsyncSession, personal_sends: AsyncMock
) -> None:
    user = await make_user(db_session, telegram_chat_id=101)
    promotion = await _make_code(db_session, assigned_user_ids=[user.id])

    await notify_personal_promo_code(promotion.id, user.id)

    personal_sends.assert_awaited_once()
    assert personal_sends.await_args is not None
    assert personal_sends.await_args.args[0].id == user.id


async def test_a_code_that_is_off_or_moved_on_is_not_announced(
    db_session: AsyncSession, personal_sends: AsyncMock
) -> None:
    user = await make_user(db_session, telegram_chat_id=102)
    other = await make_user(db_session, telegram_chat_id=103)
    switched_off = await _make_code(db_session, assigned_user_ids=[user.id], is_enabled=False)
    moved = await _make_code(db_session, assigned_user_ids=[other.id])

    await notify_personal_promo_code(switched_off.id, user.id)
    await notify_personal_promo_code(moved.id, user.id)

    personal_sends.assert_not_awaited()


async def test_each_customer_of_a_shared_code_hears_of_it(
    db_session: AsyncSession, personal_sends: AsyncMock
) -> None:
    alice = await make_user(db_session, telegram_chat_id=105)
    bob = await make_user(db_session, telegram_chat_id=106)
    promotion = await _make_code(db_session, assigned_user_ids=[alice.id, bob.id])

    await notify_personal_promo_code(promotion.id, alice.id)
    await notify_personal_promo_code(promotion.id, bob.id)

    assert personal_sends.await_count == 2


async def test_a_code_already_on_an_order_is_not_announced_again(
    db_session: AsyncSession, personal_sends: AsyncMock
) -> None:
    product = await _shop(db_session)
    user = await make_user(db_session, telegram_chat_id=104)
    promotion = await _make_code(db_session, code="LICHNYI1", assigned_user_ids=[user.id])
    await _checkout(db_session, user.id, (product, 1), promo_code="LICHNYI1")

    await notify_personal_promo_code(promotion.id, user.id)

    personal_sends.assert_not_awaited()


async def test_a_dash_is_part_of_the_code(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await _make_code(db_session, code="LETO-2026")

    with pytest.raises(PromoCodeNotFoundError):
        await OwnerCodesService(db_session).usable(user.id, "LETO2026", cycle_id=None)
    found = await OwnerCodesService(db_session).usable(user.id, "leto-2026", cycle_id=None)
    assert found.code == "LETO-2026"
