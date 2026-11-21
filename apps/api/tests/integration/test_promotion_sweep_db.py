"""The promotion sweep: announcements, missing codes, expiry reminders - on a real database."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import scheduler
from app.cart.service import CartService
from app.orders.models import DiscountKind, OrderStatus
from app.orders.service import OrdersService
from app.promotions.models import PromoCode, PromoCodeStatus, Promotion
from app.promotions.rules import (
    ConditionType,
    DiscountReward,
    PromoCodeReward,
    RewardType,
    SubtotalCondition,
    dump_conditions,
    dump_rewards,
)
from app.promotions.sweep import expiring_promo_codes, unannounced_promotions
from app.telegram.notify import notify_promo_codes_issued, notify_promotion_started
from app.telegram.service import BroadcastResult, Delivery
from tests.integration.factories import make_cycle, make_product, make_user, variant_id


def _percent(value: int) -> DiscountReward:
    return DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value)


async def _promotion(
    session: AsyncSession,
    *,
    starts_in: timedelta = timedelta(days=-1),
    lasts: timedelta = timedelta(days=2),
    announce: bool = True,
    is_enabled: bool = True,
    rewards: list[DiscountReward | PromoCodeReward] | None = None,
) -> Promotion:
    now = datetime.now(UTC)
    promotion = Promotion(
        slug=f"promo-{uuid.uuid4().hex[:10]}",
        title="Акция",
        starts_at=now + starts_in,
        ends_at=now + starts_in + lasts,
        is_enabled=is_enabled,
        announce=announce,
        conditions=dump_conditions([SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=1)]),
        rewards=dump_rewards(rewards or [_percent(10)]),
    )
    session.add(promotion)
    await session.flush()
    return promotion


@pytest.fixture
def sweep_session(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
    """The scheduler and the notifier open their own sessions; hand them the test's, so
    the stamps they write are visible to the assertions."""

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.notify.async_session", factory)
    monkeypatch.setattr("app.scheduler.async_session", factory)
    return db_session


@pytest.fixture
def sends(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    mocks = {
        "started": AsyncMock(return_value=BroadcastResult(sent=1, blocked_chat_ids=[])),
        "issued": AsyncMock(return_value=Delivery.SENT),
        "expiring": AsyncMock(return_value=Delivery.SENT),
    }
    base = "app.telegram.notify.notifications_service"
    monkeypatch.setattr(f"{base}.send_promotion_started", mocks["started"])
    monkeypatch.setattr(f"{base}.send_promo_code_issued", mocks["issued"])
    monkeypatch.setattr(f"{base}.send_promo_code_expiring", mocks["expiring"])
    return mocks


# --- What is due ------------------------------------------------------------------------


async def test_only_a_live_enabled_announced_unstamped_promotion_is_due(
    db_session: AsyncSession,
) -> None:
    due = await _promotion(db_session)
    await _promotion(db_session, announce=False)
    await _promotion(db_session, is_enabled=False)
    await _promotion(db_session, starts_in=timedelta(days=1))  # not yet
    await _promotion(db_session, starts_in=timedelta(days=-5), lasts=timedelta(days=1))  # over
    archived = await _promotion(db_session)
    archived.deleted_at = datetime.now(UTC)
    stamped = await _promotion(db_session)
    stamped.announced_at = datetime.now(UTC)
    await db_session.flush()

    assert await unannounced_promotions(db_session, datetime.now(UTC)) == [due.id]


async def _code(
    session: AsyncSession,
    promotion: Promotion,
    *,
    expires_in: timedelta,
    age: timedelta = timedelta(days=5),
    status: PromoCodeStatus = PromoCodeStatus.ACTIVE,
    telegram_chat_id: int | None | str = "auto",
) -> PromoCode:
    chat_id = uuid.uuid4().int % 10**12 if telegram_chat_id == "auto" else telegram_chat_id
    user = await make_user(session, telegram_chat_id=chat_id)  # type: ignore[arg-type]
    now = datetime.now(UTC)
    code = PromoCode(
        code=uuid.uuid4().hex[:8].upper(),
        user_id=user.id,
        promotion_id=promotion.id,
        conditions=[],
        rewards=dump_rewards([_percent(10)]),
        valid_from=now - age,
        expires_at=now + expires_in,
        status=status,
        created_at=now - age,
    )
    session.add(code)
    await session.flush()
    return code


async def test_only_an_unused_unreminded_code_running_out_soon_is_due(
    db_session: AsyncSession,
) -> None:
    promotion = await _promotion(db_session)
    due = await _code(db_session, promotion, expires_in=timedelta(days=2))
    await _code(db_session, promotion, expires_in=timedelta(days=10))  # not yet
    await _code(db_session, promotion, expires_in=timedelta(hours=-1))  # already expired
    await _code(db_session, promotion, expires_in=timedelta(days=2), status=PromoCodeStatus.USED)
    await _code(
        db_session, promotion, expires_in=timedelta(days=2), status=PromoCodeStatus.RESERVED
    )
    # Handed over a minute ago with a two day life: the issue message is the reminder.
    await _code(db_session, promotion, expires_in=timedelta(days=2), age=timedelta(minutes=1))
    reminded = await _code(db_session, promotion, expires_in=timedelta(days=2))
    reminded.reminded_at = datetime.now(UTC)
    await db_session.flush()

    assert [c.id for c in await expiring_promo_codes(db_session, datetime.now(UTC))] == [due.id]


# --- Announcements ----------------------------------------------------------------------


async def test_announcing_a_promotion_stamps_it_and_does_not_say_it_twice(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    await make_user(sweep_session, telegram_chat_id=1001)
    promotion = await _promotion(sweep_session)

    assert await notify_promotion_started(promotion.id) is True

    sends["started"].assert_awaited_once()
    await sweep_session.refresh(promotion)
    assert promotion.announced_at is not None
    assert await unannounced_promotions(sweep_session, datetime.now(UTC)) == []

    assert await notify_promotion_started(promotion.id) is False
    sends["started"].assert_awaited_once()


async def test_a_promotion_that_already_ended_is_not_announced(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    promotion = await _promotion(
        sweep_session, starts_in=timedelta(days=-5), lasts=timedelta(days=1)
    )

    assert await notify_promotion_started(promotion.id) is False

    sends["started"].assert_not_awaited()
    await sweep_session.refresh(promotion)
    assert promotion.announced_at is None


async def test_a_failed_broadcast_leaves_the_promotion_for_the_next_tick(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    promotion = await _promotion(sweep_session)
    sends["started"].side_effect = RuntimeError("Telegram is unreachable")

    assert await notify_promotion_started(promotion.id) is False
    await sweep_session.refresh(promotion)
    assert promotion.announced_at is None

    sends["started"].side_effect = None
    assert await notify_promotion_started(promotion.id) is True


async def test_a_second_tick_mid_broadcast_does_not_start_another(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    promotion = await _promotion(sweep_session)
    calls = 0

    async def send(*args: object, **kwargs: object) -> BroadcastResult:
        nonlocal calls
        calls += 1
        assert await notify_promotion_started(promotion.id) is False  # the next tick
        return BroadcastResult(sent=1, blocked_chat_ids=[])

    sends["started"].side_effect = send

    assert await notify_promotion_started(promotion.id) is True
    assert calls == 1


# --- The whole sweep --------------------------------------------------------------------


async def test_a_code_already_past_its_end_date_is_not_announced(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    promotion = await _promotion(sweep_session)
    dead = await _code(sweep_session, promotion, expires_in=timedelta(days=-1))
    live = await _code(sweep_session, promotion, expires_in=timedelta(days=3))

    await notify_promo_codes_issued([dead.id, live.id])

    sends["issued"].assert_awaited_once()
    assert sends["issued"].await_args is not None
    assert sends["issued"].await_args.args[1].id == live.id


async def test_the_sweep_announces_issues_missing_codes_and_reminds(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    session = sweep_session
    await make_cycle(session)
    product = await make_product(session, price_cents=10_000)
    buyer = await make_user(session, telegram_chat_id=2002)

    announced = await _promotion(session)
    earning = await _promotion(
        session,
        announce=False,
        rewards=[
            PromoCodeReward(
                type=RewardType.PROMO_CODE,
                valid_days=30,
                conditions=[],
                rewards=[_percent(10)],
            )
        ],
    )
    await CartService(session).add_item(buyer.id, variant_id(product), 1)
    order = await OrdersService(session).checkout(buyer.id, note=None)
    service = OrdersService(session)
    await service.update_status(order.id, OrderStatus.AWAITING_PAYMENT)
    await service.update_status(order.id, OrderStatus.CONFIRMED)
    (issued,) = service.issued_codes
    # The event "failed": the paid order has no code.
    await session.delete(issued)
    await session.flush()
    expiring = await _code(session, announced, expires_in=timedelta(days=2))
    await session.commit()

    await scheduler._run_promotion_sweep()

    sends["started"].assert_awaited_once()
    sends["issued"].assert_awaited_once()
    sends["expiring"].assert_awaited_once()
    assert sends["issued"].await_args is not None
    assert sends["issued"].await_args.args[0].id == buyer.id
    await session.refresh(announced)
    await session.refresh(expiring)
    assert announced.announced_at is not None
    assert expiring.reminded_at is not None
    reissued = (
        await session.scalars(select(PromoCode).where(PromoCode.promotion_id == earning.id))
    ).all()
    assert len(reissued) == 1 and reissued[0].source_order_id == order.id

    # A second tick has nothing left to say.
    for mock in sends.values():
        mock.reset_mock()
    await scheduler._run_promotion_sweep()
    for mock in sends.values():
        mock.assert_not_awaited()


async def test_a_reminder_that_failed_is_tried_again_and_a_blocked_one_is_settled(
    sweep_session: AsyncSession, sends: dict[str, AsyncMock]
) -> None:
    promotion = await _promotion(sweep_session, announce=False)
    flaky = await _code(sweep_session, promotion, expires_in=timedelta(days=2))
    blocked = await _code(sweep_session, promotion, expires_in=timedelta(days=2))
    unbound = await _code(
        sweep_session, promotion, expires_in=timedelta(days=2), telegram_chat_id=None
    )
    sends["expiring"].side_effect = lambda user, code, title: (
        Delivery.FAILED if code.id == flaky.id else Delivery.BLOCKED
    )
    await sweep_session.commit()

    await scheduler._run_promotion_sweep()

    for code in (flaky, blocked, unbound):
        await sweep_session.refresh(code)
    assert flaky.reminded_at is None  # transient: next tick
    assert blocked.reminded_at is not None  # the bot is blocked, never going to work
    assert unbound.reminded_at is not None  # nobody to tell
    assert sends["expiring"].await_count == 2  # the unbound one is not even tried
