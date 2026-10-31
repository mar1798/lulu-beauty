import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.checklist.models import ChecklistExtra
from app.checklist.service import ChecklistExtraNotFoundError
from app.cycles.service import CycleNotFoundError
from app.db import get_session
from app.main import app


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


async def test_an_added_line_comes_back_as_a_checklist_row(client: AsyncClient) -> None:
    cycle_id = uuid.uuid4()
    extra = ChecklistExtra(cycle_id=cycle_id, name="Пакеты", quantity=10, unit_price_cents=0)
    extra.id = uuid.uuid4()

    with patch("app.checklist.router.ChecklistExtrasService") as service_cls:
        service_cls.return_value.add = AsyncMock(return_value=extra)
        async with client as c:
            response = await c.post(
                "/admin/checklist/extras",
                json={"cycleId": str(cycle_id), "name": "  Пакеты ", "quantity": 10},
            )

    assert response.status_code == 201
    assert response.json()["extraId"] == str(extra.id)
    # Trimmed, and the price defaults to 0 when the form leaves it out.
    service_cls.return_value.add.assert_awaited_once_with(
        cycle_id, name="Пакеты", quantity=10, unit_price_cents=0
    )


@pytest.mark.parametrize(
    "body",
    [
        {"name": "   ", "quantity": 1},
        {"name": "Пакеты", "quantity": 0},
        {"name": "Пакеты", "quantity": 1, "unitPriceCents": -1},
    ],
)
async def test_a_blank_name_zero_quantity_or_negative_price_is_refused(
    client: AsyncClient, body: dict[str, object]
) -> None:
    with patch("app.checklist.router.ChecklistExtrasService") as service_cls:
        service_cls.return_value.add = AsyncMock()
        async with client as c:
            response = await c.post(
                "/admin/checklist/extras", json={"cycleId": str(uuid.uuid4()), **body}
            )

    assert response.status_code == 422
    service_cls.return_value.add.assert_not_awaited()


async def test_a_line_for_a_deleted_cycle_is_refused(client: AsyncClient) -> None:
    with patch("app.checklist.router.ChecklistExtrasService") as service_cls:
        service_cls.return_value.add = AsyncMock(side_effect=CycleNotFoundError)
        async with client as c:
            response = await c.post(
                "/admin/checklist/extras",
                json={"cycleId": str(uuid.uuid4()), "name": "Пакеты", "quantity": 1},
            )

    assert response.status_code == 404
    assert response.json() == {"detail": "cycle_not_found"}


async def test_removing_a_line(client: AsyncClient) -> None:
    extra_id = uuid.uuid4()

    with patch("app.checklist.router.ChecklistExtrasService") as service_cls:
        service_cls.return_value.delete = AsyncMock()
        async with client as c:
            response = await c.delete(f"/admin/checklist/extras/{extra_id}")

    assert response.status_code == 204
    service_cls.return_value.delete.assert_awaited_once_with(extra_id)


async def test_removing_a_missing_line(client: AsyncClient) -> None:
    with patch("app.checklist.router.ChecklistExtrasService") as service_cls:
        service_cls.return_value.delete = AsyncMock(side_effect=ChecklistExtraNotFoundError)
        async with client as c:
            response = await c.delete(f"/admin/checklist/extras/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "checklist_extra_not_found"}


async def test_only_the_owner_edits_the_checklist(client: AsyncClient) -> None:
    app.dependency_overrides.pop(require_admin)
    async with client as c:
        response = await c.post(
            "/admin/checklist/extras",
            json={"cycleId": str(uuid.uuid4()), "name": "Пакеты", "quantity": 1},
        )

    assert response.status_code == 401
