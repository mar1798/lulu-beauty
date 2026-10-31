import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.common.limits import MAX_ITEM_QUANTITY
from app.common.schemas import CamelModel, PageResponse
from app.orders.models import OrderStatus, PendingStage

# Mirrored by `OWNER_MESSAGE_MAX_LENGTH` on the website, which counts down to it.
MAX_OWNER_MESSAGE_LENGTH = 3500

# Lines in one order the owner builds by hand. A ceiling on the request, not a rule
# about orders: a checkout is bounded by the cart, and this one by nothing else.
MAX_ADMIN_ORDER_LINES = 100

__all__ = [
    "MAX_ADMIN_ORDER_LINES",
    "MAX_ITEM_QUANTITY",
    "MAX_OWNER_MESSAGE_LENGTH",
    "AdminOrderCreateRequest",
    "AdminOrderCycleResponse",
    "AdminOrderEditRequest",
    "AdminOrderItemQuantity",
    "AdminOrderLine",
    "AdminOrderMessageRequest",
    "AdminOrderPageResponse",
    "AdminOrderResponse",
    "AdminOrdersSummary",
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


class AdminOrderLine(CamelModel):
    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=MAX_ITEM_QUANTITY)


class AdminOrderCreateRequest(CamelModel):
    """An order the owner places for a customer from the admin panel.

    `cycle_id` omitted means the default — the open cycle, or the latest one that closed
    within `ADMIN_ORDER_WINDOW` (`GET /admin/orders/cycles` lists the choice).

    `request_id` is made by the panel once per draft: sending the same one again returns
    the order it already created instead of placing a second.
    """

    request_id: uuid.UUID
    user_id: uuid.UUID
    cycle_id: uuid.UUID | None = None
    items: list[AdminOrderLine] = Field(min_length=1, max_length=MAX_ADMIN_ORDER_LINES)
    note: str | None = Field(default=None, max_length=2000)


class AdminOrderItemQuantity(CamelModel):
    """One of the order's own lines, kept, at the quantity the owner left it at."""

    item_id: uuid.UUID
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class AdminOrderEditRequest(CamelModel):
    """The composition the owner wants the order to hold, whole.

    `items` are the order's lines to keep — any left out are removed; `added` are volumes
    from the catalogue. `revision` is the order's as the panel read it
    (`AdminOrderResponse.revision`), so a draft built on lines that have since moved is
    refused rather than saved over them. Leaving nothing at all is a cancellation, not an
    edit, and is refused by the service.
    """

    revision: int = Field(ge=0)
    items: list[AdminOrderItemQuantity] = Field(max_length=MAX_ADMIN_ORDER_LINES)
    added: list[AdminOrderLine] = Field(default_factory=list, max_length=MAX_ADMIN_ORDER_LINES)

    @field_validator("items")
    @classmethod
    def _distinct_items(cls, value: list[AdminOrderItemQuantity]) -> list[AdminOrderItemQuantity]:
        # Two quantities for one line leave no way to tell which one the owner meant.
        if len({line.item_id for line in value}) != len(value):
            raise ValueError("an order line is listed twice")
        return value


class AdminOrderCycleResponse(CamelModel):
    """A cycle an order may go into from the admin panel, as the form offers it."""

    id: uuid.UUID
    label: str | None
    deadline_at: datetime
    closed_at: datetime | None
    is_open: bool
    # The chosen customer's open orders already in this cycle, oldest first — empty
    # without `userId`. The form warns about them; the API does not refuse a second one.
    customer_order_ids: list[uuid.UUID]


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
    # The shade, a snapshot for the same reason.
    product_shade: str | None = None


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
    # When the owner confirmed the payment, from the receipt the customer sent the bot.
    paid_at: datetime | None = None


class AdminOrderResponse(OrderResponse):
    """Admin view — adds the customer, which the owner needs to fulfil the request.

    Kept separate from OrderResponse so the customer-facing contract is unchanged
    (and so a customer's own order never carries another user's details).
    """

    customer_name: str
    customer_phone: str
    # A receipt is waiting for the owner's verdict. `paid_at` says whether one was
    # accepted, and the admin table shows that instead.
    has_receipt: bool = False
    # The customer's chat is bound to the bot, so «Написать через бота» has somewhere to
    # go. False for an erased account too — its binding went with the rest of it.
    can_message: bool = False
    # Set when an admin placed the order for the customer from the panel; null for the
    # customer's own checkout. The name is null too when that admin's account is gone.
    created_by_id: uuid.UUID | None = None
    created_by_name: str | None = None
    # What the panel sends back with an edit (`AdminOrderEditRequest.revision`).
    revision: int = 0


class AdminOrderMessageRequest(CamelModel):
    """The owner's own words to a customer, sent through the bot.

    Capped well under Telegram's 4096: the bot wraps the text in a header and a footer
    (`messages.owner_message`), and a message that outgrew one send would have to be
    split in a place the owner never chose.
    """

    text: str = Field(min_length=1, max_length=MAX_OWNER_MESSAGE_LENGTH)

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text is blank")
        # Telegram counts UTF-16 code units, and so does the textarea's `maxLength` on
        # the website — `max_length` above counts characters, and an emoji is one of
        # those but two of these. Inline rather than `telegram.service._telegram_length`:
        # importing the bot from here would close a cycle through `orders.service`.
        if len(value.encode("utf-16-le")) // 2 > MAX_OWNER_MESSAGE_LENGTH:
            raise ValueError("text is too long")
        return value


class AdminOrdersSummary(CamelModel):
    """Totals across every order the filters match, not just the page on screen.

    The order count is the envelope's `total`; these are the two numbers it can't give.
    `item_count` counts lines, the way each row of the table does ("3 позиции"), not units.
    """

    item_count: int
    total_cents: int


class AdminOrderPageResponse(PageResponse[AdminOrderResponse]):
    summary: AdminOrdersSummary
