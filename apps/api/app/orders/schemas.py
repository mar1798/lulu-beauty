import uuid
from datetime import datetime

from pydantic import Field

from app.common.schemas import CamelModel
from app.orders.models import OrderStatus


class CheckoutRequest(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


class OrderStatusUpdateRequest(CamelModel):
    status: OrderStatus


class OrderNoteUpdateRequest(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


MAX_ITEM_QUANTITY = 999


class OrderItemQuantityRequest(CamelModel):
    # Same floor as the cart: dropping to zero is "remove", and that has its own endpoint,
    # so a 0 here is a mistake worth reporting rather than a silent deletion.
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class OrderItemAddRequest(CamelModel):
    """A product added to an order that's already been placed — not through the cart.

    The cart belongs to the *next* order; adding there would leave this one unchanged.
    """

    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=MAX_ITEM_QUANTITY)


class OrderItemResponse(CamelModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    product_name: str
    product_slug: str
    product_image_url: str | None
    product_price_cents: int
    quantity: int
    line_total_cents: int


class OrderResponse(CamelModel):
    id: uuid.UUID
    cycle_id: uuid.UUID
    status: OrderStatus
    total_cents: int
    note: str | None
    created_at: datetime
    items: list[OrderItemResponse]
    # Whether the customer may still change this order: PENDING and the cycle still open.
    # Computed here so the UI doesn't re-derive a rule it can't fully see — the deadline
    # lives on the cycle, not on the order.
    is_editable: bool = False
    # The other side of the same deadline: a cancellation the customer can still walk
    # back, i.e. CANCELLED and the cycle still open. Never true together with is_editable.
    is_restorable: bool = False


class AdminOrderResponse(OrderResponse):
    """Admin view — adds the customer, which the owner needs to fulfil the request.

    Kept separate from OrderResponse so the customer-facing contract is unchanged
    (and so a customer's own order never carries another user's details).
    """

    customer_name: str
    customer_phone: str
