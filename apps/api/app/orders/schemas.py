import uuid
from datetime import datetime

from pydantic import Field

from app.common.limits import MAX_ITEM_QUANTITY
from app.common.schemas import CamelModel
from app.orders.models import OrderStatus, PendingStage

__all__ = [
    "MAX_ITEM_QUANTITY",
    "AdminOrderResponse",
    "CheckoutRequest",
    "OrderItemAddRequest",
    "OrderItemQuantityRequest",
    "OrderItemResponse",
    "OrderNoteUpdateRequest",
    "OrderResponse",
    "OrderStatusUpdateRequest",
]


class CheckoutRequest(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


class OrderStatusUpdateRequest(CamelModel):
    status: OrderStatus


class OrderNoteUpdateRequest(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


class OrderItemQuantityRequest(CamelModel):
    # Same floor as the cart: dropping to zero is "remove", and that has its own endpoint,
    # so a 0 here is a mistake worth reporting rather than a silent deletion.
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class OrderItemAddRequest(CamelModel):
    """A volume added to an order that's already been placed — not through the cart.

    The cart belongs to the *next* order; adding there would leave this one unchanged.

    Addressed by variant, not by product: the customer picks "30 мл", and a product sold
    in two volumes gives the server no way to guess which one was meant.
    """

    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=MAX_ITEM_QUANTITY)


class OrderItemResponse(CamelModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    product_slug: str
    product_image_url: str | None
    product_price_cents: int
    quantity: int
    line_total_cents: int
    # Descriptive labels (brand · category), read from the live catalog rather than
    # snapshotted: unlike name and price, they are not part of what was agreed, and a
    # line whose product has been hard-deleted (product_id NULL) simply has none.
    # See OrdersService.load_item_tags.
    product_brand: str | None = None
    product_category_name: str | None = None
    # The volume, unlike the two above, *is* a snapshot on the line — it is what the
    # customer chose between, and the product row stops knowing it the moment the same
    # product is sold in a second volume.
    product_volume_ml: int | None = None


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
    # The other side of the same clock: a cancellation the customer can still walk
    # back. Never true together with is_editable — an order is either live or withdrawn.
    is_restorable: bool = False
    # Withdrawing, which is not editing: true through PENDING, cycle or no cycle,
    # because nothing has been bought against the order yet. Split off from is_editable
    # so a request left unanswered in a closed cycle still has one action on it instead
    # of none — and false again at `UNFULFILLED`, where the order is past being the
    # customer's to call off and is waiting on the shop's answer instead.
    is_cancellable: bool = False
    # Which of the two very different PENDINGs this is — still collecting, being bought,
    # late, or never taken into a purchase. Copy only: nothing is permitted or refused
    # by it, and it is null for every status but PENDING.
    pending_stage: PendingStage | None = None


class AdminOrderResponse(OrderResponse):
    """Admin view — adds the customer, which the owner needs to fulfil the request.

    Kept separate from OrderResponse so the customer-facing contract is unchanged
    (and so a customer's own order never carries another user's details).
    """

    customer_name: str
    customer_phone: str
