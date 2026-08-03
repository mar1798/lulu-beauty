import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.orders.models import OrderStatus


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _mock_service(mock_service_cls: MagicMock) -> MagicMock:
    service = mock_service_cls.return_value
    service.list_admin_page = AsyncMock(return_value=([], 0))
    service.load_customers = AsyncMock(return_value={})
    return service


async def test_list_orders_admin_maps_camel_case_cycle_id_query_param(
    client: AsyncClient,
) -> None:
    cycle_id = uuid.uuid4()
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        service = _mock_service(mock_service_cls)
        async with client as c:
            response = await c.get(f"/admin/orders?cycleId={cycle_id}")

    assert response.status_code == 200
    service.list_admin_page.assert_awaited_once_with(cycle_id, None, 1, 20)


async def test_list_orders_admin_without_cycle_id_passes_none(client: AsyncClient) -> None:
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        service = _mock_service(mock_service_cls)
        async with client as c:
            response = await c.get("/admin/orders")

    assert response.status_code == 200
    service.list_admin_page.assert_awaited_once_with(None, None, 1, 20)


async def test_list_orders_admin_maps_status_and_page_size_query_params(
    client: AsyncClient,
) -> None:
    """Same class of bug as cycleId/isPrimary: Query params bypass CamelModel's alias_generator."""
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        service = _mock_service(mock_service_cls)
        async with client as c:
            response = await c.get("/admin/orders?status=CONFIRMED&page=2&pageSize=5")

    assert response.status_code == 200
    service.list_admin_page.assert_awaited_once_with(None, OrderStatus.CONFIRMED, 2, 5)


async def test_list_orders_admin_returns_pagination_envelope(client: AsyncClient) -> None:
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        _mock_service(mock_service_cls)
        async with client as c:
            response = await c.get("/admin/orders")

    assert response.json() == {"items": [], "total": 0, "page": 1, "pageSize": 20}
