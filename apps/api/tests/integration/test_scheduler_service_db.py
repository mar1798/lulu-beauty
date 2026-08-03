from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.cycles.models import CycleStatus
from app.cycles.scheduler_service import CycleSchedulerService
from app.orders.service import OrdersService
from tests.integration.factories import make_cycle, make_product, make_user


async def test_sweep_reminders_notifies_once_and_is_idempotent(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)

    send_reminder = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "app.cycles.scheduler_service.notifications_service.send_reminder", send_reminder
    )
    service = CycleSchedulerService(db_session)

    first_count = await service.sweep_reminders()
    await db_session.refresh(cycle)
    assert first_count == 1
    assert cycle.reminder_sent_at is not None
    send_reminder.assert_awaited_once()

    second_count = await service.sweep_reminders()
    assert second_count == 0
    send_reminder.assert_awaited_once()  # still just once: reminder_sent_at gates re-entry


async def test_sweep_reminders_skips_users_who_already_checked_out(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(hours=1))
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    await OrdersService(db_session).checkout(user.id, note=None)

    send_reminder = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "app.cycles.scheduler_service.notifications_service.send_reminder", send_reminder
    )

    count = await CycleSchedulerService(db_session).sweep_reminders()

    assert count == 0
    send_reminder.assert_not_awaited()


async def test_sweep_deadlines_closes_cycle_and_clears_abandoned_carts_only(
    db_session: AsyncSession,
) -> None:
    abandoned_user = await make_user(db_session)
    checked_out_user = await make_user(db_session)
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    product = await make_product(db_session)

    await CartService(db_session).add_item(abandoned_user.id, product.id, 1)
    await CartService(db_session).add_item(checked_out_user.id, product.id, 1)
    order = await OrdersService(db_session).checkout(checked_out_user.id, note=None)

    # Simulate the deadline having passed (rather than sleeping in the test).
    cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    closed_count = await CycleSchedulerService(db_session).sweep_deadlines()

    assert closed_count == 1
    await db_session.refresh(cycle)
    assert cycle.status == CycleStatus.CLOSED
    assert cycle.closed_at is not None

    remaining_items = (await db_session.execute(select(CartItem))).scalars().all()
    assert remaining_items == []  # abandoned cart cleared

    # The already-checked-out order is untouched.
    reloaded_order = await OrdersService(db_session).get_for_user(checked_out_user.id, order.id)
    assert len(reloaded_order.items) == 1


async def test_sweep_deadlines_activates_next_upcoming_cycle_every_tick(
    db_session: AsyncSession,
) -> None:
    now = datetime.now(UTC)
    expiring = await make_cycle(db_session, deadline_at=now + timedelta(seconds=1), label="Old")
    upcoming = await make_cycle(db_session, deadline_at=now + timedelta(days=2), label="Next")
    expiring.deadline_at = now - timedelta(seconds=1)
    await db_session.flush()

    await CycleSchedulerService(db_session).sweep_deadlines()

    await db_session.refresh(upcoming)
    assert upcoming.status == CycleStatus.ACTIVE

    # A second tick with nothing newly expiring should keep the status in sync (not only
    # transition it as a side effect of another cycle closing in the same tick).
    await db_session.refresh(upcoming)
    upcoming.status = CycleStatus.UPCOMING
    await db_session.flush()

    await CycleSchedulerService(db_session).sweep_deadlines()

    await db_session.refresh(upcoming)
    assert upcoming.status == CycleStatus.ACTIVE
