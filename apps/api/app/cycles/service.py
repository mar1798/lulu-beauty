import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cycles.models import OrderCycle
from app.orders.models import Order


class CycleNotFoundError(Exception):
    pass


class PastDeadlineError(Exception):
    pass


class CycleHasOrdersError(Exception):
    pass


class CyclesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[OrderCycle]:
        result = await self._session.execute(select(OrderCycle).order_by(OrderCycle.deadline_at))
        return list(result.scalars().all())

    async def get_active_cycle(self) -> OrderCycle | None:
        result = await self._session.execute(
            select(OrderCycle)
            .where(OrderCycle.deadline_at > datetime.now(UTC))
            .order_by(OrderCycle.deadline_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, deadline_at: datetime, label: str | None) -> OrderCycle:
        if deadline_at <= datetime.now(UTC):
            raise PastDeadlineError

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
