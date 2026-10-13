import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user, require_admin
from app.auth.models import Role, User
from app.cycles.models import OrderCycle
from app.db import get_session
from app.main import app
from app.orders.models import Order, OrderStatus
from app.orders.service import (
    AdminOrderCycle,
    CustomerNotFoundError,
    DeletedOrder,
    NoCycleForOrderError,
    OrderCycleUnavailableError,
    ProductNotFoundError,
)
from app.telegram.service import Delivery


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
    service.admin_summary = AsyncMock(return_value=(0, 0))
    service.load_customers = AsyncMock(return_value={})
    service.load_creators = AsyncMock(return_value={})
    service.load_item_tags = AsyncMock(return_value={})
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
    """Same class of bug as cycleId: Query params bypass CamelModel's alias_generator."""
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

    assert response.json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "pageSize": 20,
        "summary": {"itemCount": 0, "totalCents": 0},
    }


async def test_list_orders_admin_summarises_under_the_same_filters(client: AsyncClient) -> None:
    cycle_id = uuid.uuid4()
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        service = _mock_service(mock_service_cls)
        service.admin_summary = AsyncMock(return_value=(7, 12_300))
        async with client as c:
            response = await c.get(f"/admin/orders?cycleId={cycle_id}&status=CONFIRMED&page=2")

    service.admin_summary.assert_awaited_once_with(cycle_id, OrderStatus.CONFIRMED)
    assert response.json()["summary"] == {"itemCount": 7, "totalCents": 12_300}


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
        patch("app.orders.router.PaymentsService") as mock_payments_cls,
    ):
        mock_payments_cls.return_value.orders_with_receipts = AsyncMock(return_value=set())
        service = mock_service_cls.return_value
        service.update_status = AsyncMock(return_value=(order, changed))
        service.load_customers = AsyncMock(return_value={})
        service.load_creators = AsyncMock(return_value={})
        service.load_item_tags = AsyncMock(return_value={})
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


async def test_delete_hands_the_notification_what_the_row_no_longer_holds(
    committing_client: AsyncClient,
) -> None:
    """The order is gone by the time the task runs, so the router has to pass the facts
    along; whether they're worth a message is `messages.order_deleted`'s call."""
    order = _order(OrderStatus.CONFIRMED)
    with (
        patch("app.orders.router.OrdersService") as mock_service_cls,
        patch("app.orders.router.notify_order_deleted", new_callable=AsyncMock) as notify,
    ):
        service = mock_service_cls.return_value
        service.delete = AsyncMock(
            return_value=DeletedOrder(order_id=order.id, user_id=order.user_id, status=order.status)
        )
        async with committing_client as c:
            response = await c.delete(f"/admin/orders/{order.id}")

    assert response.status_code == 204
    notify.assert_awaited_once_with(order.user_id, order.id, OrderStatus.CONFIRMED)


@pytest.fixture
def customer_client() -> Iterator[AsyncClient]:
    """For the customer's own routes: they commit, so they need a session too."""
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=uuid.uuid4(), role=Role.CUSTOMER
    )
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


async def _post_own_order_action(
    client: AsyncClient, order: Order, action: str
) -> tuple[AsyncMock, uuid.UUID]:
    with (
        patch("app.orders.router.OrdersService") as mock_service_cls,
        patch(
            "app.orders.router.notify_order_cancelled_by_customer", new_callable=AsyncMock
        ) as notify,
    ):
        service = mock_service_cls.return_value
        service.cancel = AsyncMock(return_value=order)
        service.restore = AsyncMock(return_value=order)
        service.customer_flags = AsyncMock(return_value={})
        service.load_item_tags = AsyncMock(return_value={})
        async with client as c:
            response = await c.post(f"/orders/{order.id}/{action}")

    assert response.status_code == 200
    return notify, order.id


async def test_own_cancellation_reaches_the_owner(customer_client: AsyncClient) -> None:
    """The one post-checkout change the customer can make to the shopping list — before
    this it only showed up the next time the owner reopened the admin table."""
    notify, order_id = await _post_own_order_action(
        customer_client, _order(OrderStatus.CANCELLED_BY_CUSTOMER), "cancel"
    )

    notify.assert_awaited_once_with(order_id, restored=False)


async def test_taking_a_cancellation_back_reaches_the_owner_too(
    customer_client: AsyncClient,
) -> None:
    """The owner was told the order was off; a silent restore would leave that standing."""
    notify, order_id = await _post_own_order_action(
        customer_client, _order(OrderStatus.PENDING), "restore"
    )

    notify.assert_awaited_once_with(order_id, restored=True)


def _session_with(order: Order | None) -> AsyncMock:
    session = AsyncMock()
    session.get = AsyncMock(return_value=order)
    return session


async def _post_message(
    session: AsyncMock,
    order: Order,
    customer: User | None,
    outcome: Delivery = Delivery.SENT,
    text: str = "Добрый день!",
) -> tuple[int, str | None, AsyncMock, AsyncMock]:
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)
    try:
        with (
            patch("app.orders.router.OrdersService") as mock_service_cls,
            patch("app.orders.router.notifications_service") as notifications,
            patch(
                "app.orders.router.recipients.clear_stale_bindings", new_callable=AsyncMock
            ) as clear,
        ):
            mock_service_cls.return_value.load_customers = AsyncMock(
                return_value={} if customer is None else {order.user_id: customer}
            )
            notifications.send_owner_message = AsyncMock(return_value=outcome)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                response = await c.post(f"/admin/orders/{order.id}/message", json={"text": text})
    finally:
        app.dependency_overrides.clear()

    detail = response.json().get("detail") if response.content else None
    return response.status_code, detail, notifications.send_owner_message, clear


def _customer(chat_id: int | None) -> User:
    return User(phone="+996700123456", name="Айгуль", telegram_chat_id=chat_id)


async def test_message_goes_to_the_customer_through_the_bot() -> None:
    order = _order(OrderStatus.CONFIRMED)
    customer = _customer(42)

    code, _, send, _ = await _post_message(_session_with(order), order, customer, text="  Привет  ")

    assert code == 204
    # Trimmed: a stray newline from the textarea is not part of what the owner meant.
    send.assert_awaited_once_with(customer, order.id, "Привет")


async def test_message_to_a_customer_without_a_chat_is_refused_before_sending() -> None:
    order = _order(OrderStatus.CONFIRMED)

    code, detail, send, _ = await _post_message(_session_with(order), order, _customer(None))

    assert (code, detail) == (409, "customer_not_in_bot")
    send.assert_not_awaited()


async def test_message_to_an_erased_account_is_refused_the_same_way() -> None:
    order = _order(OrderStatus.CONFIRMED)

    code, detail, send, _ = await _post_message(_session_with(order), order, None)

    assert (code, detail) == (409, "customer_not_in_bot")
    send.assert_not_awaited()


async def test_message_to_a_blocked_bot_drops_the_dead_binding() -> None:
    order = _order(OrderStatus.CONFIRMED)
    session = _session_with(order)

    code, detail, _, clear = await _post_message(session, order, _customer(42), Delivery.BLOCKED)

    assert (code, detail) == (409, "customer_blocked_bot")
    clear.assert_awaited_once_with(session, [42])
    # Once to end the read before the send, once for the dropped binding.
    assert session.commit.await_count == 2


async def test_message_that_telegram_did_not_take_is_a_gateway_error() -> None:
    order = _order(OrderStatus.CONFIRMED)

    code, detail, _, _ = await _post_message(
        _session_with(order), order, _customer(42), Delivery.FAILED
    )

    assert (code, detail) == (502, "telegram_send_failed")


async def test_blank_message_is_rejected() -> None:
    order = _order(OrderStatus.CONFIRMED)

    code, _, send, _ = await _post_message(_session_with(order), order, _customer(42), text="   ")

    assert code == 422
    send.assert_not_awaited()


async def test_message_about_a_missing_order_is_not_found() -> None:
    order = _order(OrderStatus.CONFIRMED)

    code, detail, _, _ = await _post_message(_session_with(None), order, _customer(42))

    assert (code, detail) == (404, "order_not_found")


async def test_message_counts_length_the_way_telegram_does() -> None:
    """An emoji is one character but two UTF-16 units — Telegram's and the textarea's."""
    order = _order(OrderStatus.CONFIRMED)

    code, _, send, _ = await _post_message(
        _session_with(order), order, _customer(42), text="😀" * 1751
    )

    assert code == 422
    send.assert_not_awaited()


async def _create(
    client: AsyncClient,
    body: dict[str, object],
    *,
    error: Exception | None = None,
    created: bool = True,
) -> tuple[int, object, MagicMock, AsyncMock, AsyncMock]:
    order = _order(OrderStatus.PENDING)
    body = {"requestId": str(uuid.uuid4()), **body}
    with (
        patch("app.orders.router.OrdersService") as mock_service_cls,
        patch("app.orders.router.notify_new_order", new_callable=AsyncMock) as notify_owner,
        patch(
            "app.orders.router.notify_order_created_for_customer", new_callable=AsyncMock
        ) as notify_customer,
    ):
        service = _mock_service(mock_service_cls)
        service.create_for_customer = AsyncMock(return_value=(order, created), side_effect=error)
        async with client as c:
            response = await c.post("/admin/orders", json=body)
    return response.status_code, response.json(), service, notify_owner, notify_customer


async def test_create_order_admin_passes_the_lines_and_notifies_both_sides(
    committing_client: AsyncClient,
) -> None:
    request_id, user_id, cycle_id, variant = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    code, _, service, notify_owner, notify_customer = await _create(
        committing_client,
        {
            "requestId": str(request_id),
            "userId": str(user_id),
            "cycleId": str(cycle_id),
            "items": [{"variantId": str(variant), "quantity": 2}],
            "note": "Без пакета",
        },
    )

    assert code == 201
    args = service.create_for_customer.await_args.args
    assert args[1:] == (request_id, user_id, cycle_id, [(variant, 2)], "Без пакета")
    notify_owner.assert_awaited_once()
    notify_customer.assert_awaited_once()


async def test_create_order_admin_announces_a_repeated_request_once(
    committing_client: AsyncClient,
) -> None:
    """The same `requestId` again: the order it already made, and nobody told twice."""
    with patch("app.orders.router.PaymentsService") as payments_cls:
        payments_cls.return_value.orders_with_receipts = AsyncMock(return_value=set())
        code, _, _, notify_owner, notify_customer = await _create(
            committing_client,
            {"userId": str(uuid.uuid4()), "items": [{"variantId": str(uuid.uuid4())}]},
            created=False,
        )

    assert code == 201
    notify_owner.assert_not_awaited()
    notify_customer.assert_not_awaited()


async def test_create_order_admin_refuses_an_empty_order(committing_client: AsyncClient) -> None:
    code, _, service, _, _ = await _create(
        committing_client, {"userId": str(uuid.uuid4()), "items": []}
    )

    assert code == 422
    service.create_for_customer.assert_not_awaited()


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (CustomerNotFoundError(), (404, "user_not_found")),
        (NoCycleForOrderError(), (409, "no_cycle_for_order")),
        (OrderCycleUnavailableError(), (409, "order_cycle_unavailable")),
        (ProductNotFoundError(), (404, "product_not_found")),
    ],
)
async def test_create_order_admin_maps_errors_to_codes(
    committing_client: AsyncClient, error: Exception, expected: tuple[int, str]
) -> None:
    code, body, _, notify_owner, notify_customer = await _create(
        committing_client,
        {"userId": str(uuid.uuid4()), "items": [{"variantId": str(uuid.uuid4())}]},
        error=error,
    )

    assert (code, body["detail"]) == expected  # type: ignore[index]
    notify_owner.assert_not_awaited()
    notify_customer.assert_not_awaited()


async def test_admin_order_cycles_maps_user_id_and_shape(client: AsyncClient) -> None:
    user_id, order_id = uuid.uuid4(), uuid.uuid4()
    cycle = OrderCycle(
        id=uuid.uuid4(), label="Октябрь", deadline_at=datetime(2026, 10, 10, tzinfo=UTC)
    )
    cycle.closed_at = None
    with patch("app.orders.router.OrdersService") as mock_service_cls:
        service = mock_service_cls.return_value
        service.admin_order_cycles = AsyncMock(
            return_value=[AdminOrderCycle(cycle=cycle, is_open=True, customer_order_ids=[order_id])]
        )
        async with client as c:
            response = await c.get(f"/admin/orders/cycles?userId={user_id}")

    service.admin_order_cycles.assert_awaited_once_with(user_id)
    assert response.json() == [
        {
            "id": str(cycle.id),
            "label": "Октябрь",
            "deadlineAt": "2026-10-10T00:00:00Z",
            "closedAt": None,
            "isOpen": True,
            "customerOrderIds": [str(order_id)],
        }
    ]
