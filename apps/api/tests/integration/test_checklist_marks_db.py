import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.checklist.models import ChecklistMark
from app.checklist.service import ChecklistMarksService
from app.cycles.models import CycleStatus
from app.cycles.service import CycleNotFoundError, CyclesService
from tests.integration.factories import make_cycle


async def test_ticks_belong_to_their_cycle_and_are_idempotent(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session)
    other = await make_cycle(db_session, status=CycleStatus.CLOSED)
    service = ChecklistMarksService(db_session)

    await service.set(cycle.id, "a", checked=True)
    # Twice: two admins ticking the same row at once is not an error.
    await service.set(cycle.id, "a", checked=True)
    await service.set(cycle.id, "b", checked=True)
    await service.set(other.id, "c", checked=True)
    await service.set(cycle.id, "b", checked=False)
    await service.set(cycle.id, "missing", checked=False)

    assert await service.keys(cycle.id) == ["a"]
    assert await service.keys(other.id) == ["c"]


async def test_a_tick_for_a_missing_cycle_is_refused(db_session: AsyncSession) -> None:
    with pytest.raises(CycleNotFoundError):
        await ChecklistMarksService(db_session).set(uuid.uuid4(), "a", checked=True)


async def test_clearing_touches_only_its_cycle(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session)
    other = await make_cycle(db_session, status=CycleStatus.CLOSED)
    service = ChecklistMarksService(db_session)
    await service.set(cycle.id, "a", checked=True)
    await service.set(other.id, "b", checked=True)

    await service.clear(cycle.id)

    assert await service.keys(cycle.id) == []
    assert await service.keys(other.id) == ["b"]


async def test_deleting_the_cycle_takes_its_ticks(db_session: AsyncSession) -> None:
    cycle = await make_cycle(
        db_session,
        status=CycleStatus.CLOSED,
        deadline_at=datetime.now(UTC) - timedelta(days=60),
    )
    await ChecklistMarksService(db_session).set(cycle.id, "a", checked=True)

    await CyclesService(db_session).delete(cycle.id, expected_orders=0)
    await db_session.flush()

    assert (await db_session.execute(select(ChecklistMark))).scalars().all() == []
