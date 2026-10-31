import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.checklist.models import ChecklistExtra
from app.checklist.service import ChecklistExtraNotFoundError, ChecklistExtrasService
from app.cycles.models import CycleStatus
from app.cycles.service import CycleNotFoundError, CyclesService
from tests.integration.factories import make_cycle


async def test_lines_belong_to_their_cycle_in_the_order_added(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session)
    other = await make_cycle(db_session, status=CycleStatus.CLOSED)
    service = ChecklistExtrasService(db_session)

    first = await service.add(cycle.id, name="Пакеты", quantity=10, unit_price_cents=0)
    second = await service.add(cycle.id, name="Тестер", quantity=1, unit_price_cents=50000)
    await service.add(other.id, name="Чужое", quantity=1, unit_price_cents=0)

    assert [extra.id for extra in await service.list(cycle.id)] == [first.id, second.id]


async def test_a_line_for_a_missing_cycle_is_refused(db_session: AsyncSession) -> None:
    with pytest.raises(CycleNotFoundError):
        await ChecklistExtrasService(db_session).add(
            uuid.uuid4(), name="Пакеты", quantity=1, unit_price_cents=0
        )


async def test_removing_a_line(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session)
    service = ChecklistExtrasService(db_session)
    extra = await service.add(cycle.id, name="Пакеты", quantity=1, unit_price_cents=0)

    await service.delete(extra.id)

    assert await service.list(cycle.id) == []
    with pytest.raises(ChecklistExtraNotFoundError):
        await service.delete(extra.id)


async def test_deleting_the_cycle_takes_its_lines(db_session: AsyncSession) -> None:
    cycle = await make_cycle(
        db_session,
        status=CycleStatus.CLOSED,
        deadline_at=datetime.now(UTC) - timedelta(days=60),
    )
    await ChecklistExtrasService(db_session).add(
        cycle.id, name="Пакеты", quantity=1, unit_price_cents=0
    )

    await CyclesService(db_session).delete(cycle.id, expected_orders=0)
    await db_session.flush()

    assert (await db_session.execute(select(ChecklistExtra))).scalars().all() == []
