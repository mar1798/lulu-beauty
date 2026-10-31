import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.checklist.models import ChecklistExtra
from app.cycles.models import OrderCycle
from app.cycles.service import CycleNotFoundError


class ChecklistExtraNotFoundError(Exception):
    pass


class ChecklistExtrasService:
    """The owner's own lines on a cycle's purchase list (see `ChecklistExtra`)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self, cycle_id: uuid.UUID) -> list[ChecklistExtra]:
        """In the order they were added: the list grows at the bottom, like on paper."""
        result = await self._session.execute(
            select(ChecklistExtra)
            .where(ChecklistExtra.cycle_id == cycle_id)
            .order_by(ChecklistExtra.created_at, ChecklistExtra.id)
        )
        return list(result.scalars().all())

    async def add(
        self, cycle_id: uuid.UUID, *, name: str, quantity: int, unit_price_cents: int
    ) -> ChecklistExtra:
        """Any cycle, closed ones included: the checklist shows the last closed cycle when
        none is open, and that is exactly when the owner is out buying it."""
        if await self._session.get(OrderCycle, cycle_id) is None:
            raise CycleNotFoundError

        extra = ChecklistExtra(
            cycle_id=cycle_id, name=name, quantity=quantity, unit_price_cents=unit_price_cents
        )
        self._session.add(extra)
        await self._session.flush()
        return extra

    async def delete(self, extra_id: uuid.UUID) -> None:
        extra = await self._session.get(ChecklistExtra, extra_id)
        if extra is None:
            raise ChecklistExtraNotFoundError
        await self._session.delete(extra)
        await self._session.flush()
