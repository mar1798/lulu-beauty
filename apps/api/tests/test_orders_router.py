import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.db import get_session
from app.main import app


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


async def test_list_orders_admin_maps_camel_case_cycle_id_query_param(
    client: AsyncClient,
) -> None:
    cycle_id = uuid.uuid4()
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        mock_service_cls.return_value.list_admin = AsyncMock(return_value=[])
        async with client as c:
            response = await c.get(f"/admin/orders?cycleId={cycle_id}")

    assert response.status_code == 200
    mock_service_cls.return_value.list_admin.assert_awaited_once_with(cycle_id)


async def test_list_orders_admin_without_cycle_id_passes_none(client: AsyncClient) -> None:
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        mock_service_cls.return_value.list_admin = AsyncMock(return_value=[])
        async with client as c:
            response = await c.get("/admin/orders")

    assert response.status_code == 200
    mock_service_cls.return_value.list_admin.assert_awaited_once_with(None)
