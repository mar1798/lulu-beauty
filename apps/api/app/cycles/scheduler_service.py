from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.cart.models import Cart, CartItem
from app.cycles.models import CycleStatus, OrderCycle
from app.orders.models import Order
from app.telegram.bot import notifications_service

REMINDER_WINDOW = timedelta(hours=24)


class CycleSchedulerService:
    """DB sweeps for cycle lifecycle: reminders, deadline close + cart cleanup.

    Deliberately re-reads state from the DB on every sweep rather than scheduling
    per-cycle timers, so a restart never loses a pending reminder/close (see PLAN.md).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def sweep_reminders(self) -> int:
        now = datetime.now(UTC)
        result = await self._session.execute(
            select(OrderCycle).where(
                OrderCycle.deadline_at > now,
                OrderCycle.deadline_at <= now + REMINDER_WINDOW,
                OrderCycle.reminder_sent_at.is_(None),
            )
        )
        cycles = list(result.scalars().all())

        reminders_sent = 0
        for cycle in cycles:
            reminders_sent += await self._remind_cycle(cycle)
            cycle.reminder_sent_at = now

        await self._session.flush()
        return reminders_sent

    async def _remind_cycle(self, cycle: OrderCycle) -> int:
        has_checked_out = select(Order.id).where(
            Order.user_id == User.id, Order.cycle_id == cycle.id
        )
        result = await self._session.execute(
            select(User)
            .join(Cart, Cart.user_id == User.id)
            .join(CartItem, CartItem.cart_id == Cart.id)
            .where(Cart.cycle_id == cycle.id, ~has_checked_out.exists())
            .distinct()
        )
        users = list(result.scalars().all())

        for user in users:
            await notifications_service.send_reminder(
                user, cycle.label or "the upcoming order cycle", cycle.deadline_at
            )
        return len(users)

    async def sweep_deadlines(self) -> int:
        now = datetime.now(UTC)
        result = await self._session.execute(
            select(OrderCycle).where(
                OrderCycle.deadline_at <= now,
                OrderCycle.status != CycleStatus.CLOSED,
            )
        )
        cycles = list(result.scalars().all())

        for cycle in cycles:
            await self._close_cycle(cycle, now)
        # Always resync, not just when a cycle closed this tick: otherwise a cycle created
        # without any other cycle expiring at the same moment would show UPCOMING forever,
        # even though get_active_cycle() already treats it as the active one.
        await self._activate_next_upcoming(now)

        await self._session.flush()
        return len(cycles)

    async def _close_cycle(self, cycle: OrderCycle, now: datetime) -> None:
        checked_out_user_ids = select(Order.user_id).where(Order.cycle_id == cycle.id)
        result = await self._session.execute(
            select(Cart.id).where(
                Cart.cycle_id == cycle.id,
                Cart.user_id.not_in(checked_out_user_ids),
            )
        )
        abandoned_cart_ids = list(result.scalars().all())
        if abandoned_cart_ids:
            await self._session.execute(
                delete(CartItem).where(CartItem.cart_id.in_(abandoned_cart_ids))
            )

        cycle.status = CycleStatus.CLOSED
        cycle.closed_at = now

    async def _activate_next_upcoming(self, now: datetime) -> None:
        result = await self._session.execute(
            select(OrderCycle)
            .where(OrderCycle.deadline_at > now, OrderCycle.status == CycleStatus.UPCOMING)
            .order_by(OrderCycle.deadline_at.asc())
            .limit(1)
        )
        next_cycle = result.scalar_one_or_none()
        if next_cycle is not None:
            next_cycle.status = CycleStatus.ACTIVE
