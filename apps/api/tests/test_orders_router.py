import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.orders.models import Order, OrderStatus


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


@pytest.fixture
def committing_client() -> Iterator[AsyncClient]:
    """Same as `client`, for the routes that commit — those need a session to commit on."""
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _order(status: OrderStatus) -> Order:
    order = Order(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=status,
        total_cents=1000,
        note=None,
    )
    order.created_at = datetime.now(UTC)
    order.items = []
    return order


async def _patch_status(client: AsyncClient, order: Order, *, changed: bool) -> AsyncMock:
    with (
        patch("app.orders.router.OrdersService") as mock_service_cls,
        patch("app.orders.router.notify_order_status", new_callable=AsyncMock) as notify,
    ):
        service = mock_service_cls.return_value
        service.update_status = AsyncMock(return_value=(order, changed))
        service.load_customers = AsyncMock(return_value={})
        async with client as c:
            response = await c.patch(
                f"/admin/orders/{order.id}/status", json={"status": order.status.value}
            )

    assert response.status_code == 200
    return notify


async def test_status_update_notifies_the_customer(committing_client: AsyncClient) -> None:
    notify = await _patch_status(committing_client, _order(OrderStatus.READY), changed=True)

    notify.assert_awaited_once()


async def test_status_update_stays_silent_when_the_status_did_not_move(
    committing_client: AsyncClient,
) -> None:
    """The owner's UI lets them press the status the order is already on; re-announcing
    "готова к выдаче" every time would train the customer to ignore the bot."""
    notify = await _patch_status(committing_client, _order(OrderStatus.READY), changed=False)

    notify.assert_not_awaited()
