import uuid
from datetime import UTC, datetime

from app.orders.models import OrderStatus
from app.orders.schemas import (
    AdminOrderResponse,
    CheckoutRequest,
    OrderItemResponse,
    OrderStatusUpdateRequest,
)


def test_checkout_request_note_optional() -> None:
    request = CheckoutRequest()
    assert request.note is None


def test_checkout_request_accepts_camel_case_input() -> None:
    request = CheckoutRequest.model_validate({"note": "Leave at the door"})
    assert request.note == "Leave at the door"


def test_order_status_update_accepts_camel_case_input() -> None:
    request = OrderStatusUpdateRequest.model_validate({"status": "CONFIRMED"})
    assert request.status == OrderStatus.CONFIRMED


def test_order_status_update_round_trips_enum() -> None:
    request = OrderStatusUpdateRequest(status=OrderStatus.READY)
    assert request.model_dump(by_alias=True) == {"status": "READY"}


def test_order_item_response_product_id_can_be_none() -> None:
    response = OrderItemResponse(
        product_id=None,
        product_name="Deleted product",
        product_slug="deleted-product",
        product_image_url=None,
        product_price_cents=1000,
        quantity=2,
        line_total_cents=2000,
    )
    assert response.product_id is None
    # The snapshot outlives the product row, so the slug stays even with product_id gone.
    assert response.product_slug == "deleted-product"


def test_admin_order_response_adds_customer_and_keeps_camel_case() -> None:
    response = AdminOrderResponse(
        id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=OrderStatus.PENDING,
        total_cents=2000,
        note=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        items=[],
        customer_name="Aigul",
        customer_phone="+996700123456",
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["customerName"] == "Aigul"
    assert dumped["customerPhone"] == "+996700123456"
