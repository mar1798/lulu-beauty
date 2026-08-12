from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

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
