import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cycles.models import CycleStatus, OrderCycle
from app.orders.models import Order


class CycleNotFoundError(Exception):
    pass


class PastDeadlineError(Exception):
    pass


class CycleHasOrdersError(Exception):
    pass


class CycleAlreadyClosedError(Exception):
    """Closing a closed cycle: nothing to do, and the second tally would be a lie."""


class ActiveCycleExistsError(Exception):
    """There is already a cycle collecting orders, and there can only be one.

    Two open cycles do not divide the shop in two — they break it. A cart belongs to one
    cycle (`Unique(user_id, cycle_id)`), and `get_active_cycle` picks the nearest deadline,
    so a second cycle created with an earlier deadline silently becomes *the* cycle and
    every cart collected under the first one drops out of sight. Editing the open cycle's
    deadline is the operation the owner actually wanted.
    """


class CyclesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[OrderCycle]:
        result = await self._session.execute(select(OrderCycle).order_by(OrderCycle.deadline_at))
        return list(result.scalars().all())

    async def get_active_cycle(self) -> OrderCycle | None:
        """The cycle currently collecting orders, if any.

        Not by deadline alone: the owner can close a cycle before its deadline (see
        `CycleSchedulerService.close_now`), and a cycle whose carts have already been
        emptied into wishlists must not go on accepting new ones just because the date
        it was going to end on hasn't arrived yet.
        """
        result = await self._session.execute(
            select(OrderCycle)
            .where(
                OrderCycle.deadline_at > datetime.now(UTC),
                OrderCycle.status != CycleStatus.CLOSED,
            )
            .order_by(OrderCycle.deadline_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get(self, cycle_id: uuid.UUID) -> OrderCycle | None:
        return await self._session.get(OrderCycle, cycle_id)

    async def create(self, deadline_at: datetime, label: str | None) -> OrderCycle:
        if deadline_at <= datetime.now(UTC):
            raise PastDeadlineError
        if await self.get_active_cycle() is not None:
            raise ActiveCycleExistsError

        cycle = OrderCycle(deadline_at=deadline_at, label=label)
        self._session.add(cycle)
        await self._session.flush()
        return cycle

    async def update(self, cycle_id: uuid.UUID, updates: dict[str, Any]) -> OrderCycle:
        cycle = await self._session.get(OrderCycle, cycle_id)
        if cycle is None:
            raise CycleNotFoundError

        # create() refuses a deadline in the past; update() used to accept one silently,
        # and on a cycle customers are still ordering in that is not a shorter cycle but a
        # closed one — the next sweep shuts it and empties every cart collected under it.
        #
        # Only *open* cycles are guarded. A cycle whose deadline has already passed is
        # history, and the owner still edits those: the calendar's form saves the label
        # and the deadline together, so refusing a past date there would make renaming a
        # finished cycle impossible.
        now = datetime.now(UTC)
        deadline_at = updates.get("deadline_at")
        if deadline_at is not None and deadline_at <= now and cycle.deadline_at > now:
            raise PastDeadlineError

        for field, value in updates.items():
            setattr(cycle, field, value)

        # Moving a closed cycle's deadline back into the future reopens it — and until the
        # rest of the row followed, that reopening was only half real: `get_active_cycle()`
        # goes by the deadline alone, so the cycle started collecting orders again, while
        # `sweep_deadlines` skips anything already CLOSED and so would never close it a
        # second time. It also kept `closed_at` and both reminder stamps, so the new
        # deadline would pass unannounced. UPCOMING rather than ACTIVE for the same reason
        # `create()` leaves it there: the sweep promotes whichever cycle is next.
        if cycle.status is CycleStatus.CLOSED and cycle.deadline_at > now:
            cycle.status = CycleStatus.UPCOMING
            cycle.closed_at = None
            cycle.reminder_sent_at = None
            cycle.final_reminder_sent_at = None

        await self._session.flush()
        return cycle

    async def delete(self, cycle_id: uuid.UUID) -> None:
        cycle = await self._session.get(OrderCycle, cycle_id)
        if cycle is None:
            raise CycleNotFoundError

        has_orders = await self._session.scalar(
            select(Order.id).where(Order.cycle_id == cycle_id).limit(1)
        )
        if has_orders is not None:
            raise CycleHasOrdersError

        await self._session.delete(cycle)
