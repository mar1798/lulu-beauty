import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.orders.models import OrderStatus
from app.orders.schemas import (
    MAX_ITEM_QUANTITY,
    AdminOrderResponse,
    CheckoutRequest,
    OrderItemAddRequest,
    OrderItemResponse,
    OrderResponse,
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


def test_order_item_add_accepts_camel_case_and_defaults_to_one() -> None:
    product_id = uuid.uuid4()

    request = OrderItemAddRequest.model_validate({"productId": str(product_id)})

    assert request.product_id == product_id
    assert request.quantity == 1


def test_order_item_add_rejects_quantities_outside_the_range() -> None:
    product_id = uuid.uuid4()

    with pytest.raises(ValidationError):
        OrderItemAddRequest.model_validate({"productId": str(product_id), "quantity": 0})
    with pytest.raises(ValidationError):
        OrderItemAddRequest.model_validate(
            {"productId": str(product_id), "quantity": MAX_ITEM_QUANTITY + 1}
        )


def test_order_item_response_product_id_can_be_none() -> None:
    response = OrderItemResponse(
        id=uuid.uuid4(),
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


def test_order_response_flags_default_to_closed_and_serialize_camel_case() -> None:
    """Both flags default to False: a response built without them promises nothing."""
    response = OrderResponse(
        id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=OrderStatus.CANCELLED,
        total_cents=0,
        note=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        items=[],
    )

    dumped = response.model_dump(by_alias=True)
    assert dumped["isEditable"] is False
    assert dumped["isRestorable"] is False


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
