import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.cycles.models import CycleStatus, OrderCycle
from app.db import get_session
from app.main import app


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    # A mock session rather than None: the handler commits, and nothing here reaches the
    # database — `CyclesService` is patched out in every test below.
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _cycle(deadline_at: datetime, status: CycleStatus) -> OrderCycle:
    return OrderCycle(id=uuid.uuid4(), deadline_at=deadline_at, label=None, status=status)


def _service(mock_service_cls: MagicMock, *, before: OrderCycle, after: OrderCycle) -> MagicMock:
    """The row as the handler sees it either side of the edit: `get()` answers with the
    state it reads before updating, `update()` with the state it returns afterwards."""
    service = mock_service_cls.return_value
    service.get = AsyncMock(return_value=before)
    service.update = AsyncMock(return_value=after)
    return service


async def test_reopening_a_cycle_announces_it_instead_of_reporting_a_moved_deadline(
    client: AsyncClient,
) -> None:
    """The shop at large was never told this cycle is collecting again, and
    "дедлайн перенесён" goes only to the people already inside it — which, after a close,
    is whoever had an order in it and nobody else."""
    now = datetime.now(UTC)
    cycle_id = uuid.uuid4()
    before = _cycle(now - timedelta(days=1), CycleStatus.CLOSED)
    after = _cycle(now + timedelta(days=3), CycleStatus.UPCOMING)
    before.id = after.id = cycle_id

    with (
        patch("app.cycles.router.CyclesService") as mock_service_cls,
        patch("app.cycles.router.notify_cycle_opened", AsyncMock()) as announce,
        patch("app.cycles.router.notify_cycle_deadline_changed", AsyncMock()) as deadline_moved,
    ):
        _service(mock_service_cls, before=before, after=after)
        async with client as c:
            response = await c.patch(
                f"/admin/cycles/{cycle_id}",
                json={"deadlineAt": (now + timedelta(days=3)).isoformat()},
            )

    assert response.status_code == 200
    announce.assert_awaited_once_with(cycle_id)
    deadline_moved.assert_not_awaited()


async def test_moving_an_open_cycles_deadline_still_only_reports_the_move(
    client: AsyncClient,
) -> None:
    now = datetime.now(UTC)
    cycle_id = uuid.uuid4()
    previous_deadline_at = now + timedelta(days=1)
    before = _cycle(previous_deadline_at, CycleStatus.ACTIVE)
    after = _cycle(now + timedelta(days=3), CycleStatus.ACTIVE)
    before.id = after.id = cycle_id

    with (
        patch("app.cycles.router.CyclesService") as mock_service_cls,
        patch("app.cycles.router.notify_cycle_opened", AsyncMock()) as announce,
        patch("app.cycles.router.notify_cycle_deadline_changed", AsyncMock()) as deadline_moved,
    ):
        _service(mock_service_cls, before=before, after=after)
        async with client as c:
            response = await c.patch(
                f"/admin/cycles/{cycle_id}",
                json={"deadlineAt": (now + timedelta(days=3)).isoformat()},
            )

    assert response.status_code == 200
    deadline_moved.assert_awaited_once_with(cycle_id, previous_deadline_at)
    announce.assert_not_awaited()
