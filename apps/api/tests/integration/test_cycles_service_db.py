from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.cycles.models import CycleStatus
from app.cycles.service import CyclesService, PastDeadlineError
from tests.integration.factories import make_cycle

"""update()'s deadline rule.

create() has always refused a deadline in the past; update() accepted one silently, and
on a cycle customers are still ordering in that is not a shorter cycle — it is a closed
one, and the next sweep empties every cart collected under it.
"""


async def test_moving_an_open_cycle_into_the_past_is_refused(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=2))

    with pytest.raises(PastDeadlineError):
        await CyclesService(db_session).update(
            cycle.id, {"deadline_at": datetime.now(UTC) - timedelta(minutes=1)}
        )


async def test_an_open_cycle_still_moves_to_another_future_date(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=2))
    moved_to = datetime.now(UTC) + timedelta(days=5)

    updated = await CyclesService(db_session).update(cycle.id, {"deadline_at": moved_to})

    assert updated.deadline_at == moved_to


async def test_a_finished_cycle_can_still_be_relabelled(db_session: AsyncSession) -> None:
    """The calendar's form saves the label and the deadline together, so guarding past
    deadlines unconditionally would make renaming a closed cycle impossible."""
    past = datetime.now(UTC) - timedelta(days=3)
    cycle = await make_cycle(db_session, deadline_at=past, label="Май")

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": past, "label": "Май 2026"}
    )

    assert updated.label == "Май 2026"


async def test_reopening_a_closed_cycle_puts_the_whole_row_back(db_session: AsyncSession) -> None:
    """Moving a closed cycle's deadline forward has to reopen it properly, not halfway.

    `get_active_cycle()` goes by the deadline alone, so the cycle started collecting orders
    again — while `sweep_deadlines` skips anything already CLOSED and would therefore never
    close it a second time, and both reminder stamps stayed set so the new deadline would
    pass unannounced.
    """
    now = datetime.now(UTC)
    cycle = await make_cycle(
        db_session, deadline_at=now - timedelta(days=1), status=CycleStatus.CLOSED
    )
    cycle.closed_at = now - timedelta(days=1)
    cycle.reminder_sent_at = now - timedelta(days=2)
    cycle.final_reminder_sent_at = now - timedelta(days=2)
    await db_session.flush()

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": now + timedelta(days=3)}
    )

    assert updated.status is CycleStatus.UPCOMING
    assert updated.closed_at is None
    assert updated.reminder_sent_at is None
    assert updated.final_reminder_sent_at is None
    assert await CyclesService(db_session).get_active_cycle() is not None


async def test_renaming_a_finished_cycle_leaves_it_closed(db_session: AsyncSession) -> None:
    """The calendar's form saves label and deadline together, so an ordinary rename
    re-sends the past deadline — which must not be read as reopening anything."""
    now = datetime.now(UTC)
    cycle = await make_cycle(
        db_session, deadline_at=now - timedelta(days=1), status=CycleStatus.CLOSED
    )
    cycle.closed_at = now - timedelta(days=1)
    await db_session.flush()

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": now - timedelta(days=1), "label": "Ноябрьский сбор"}
    )

    assert updated.status is CycleStatus.CLOSED
    assert updated.closed_at is not None
    assert updated.label == "Ноябрьский сбор"
