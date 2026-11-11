import uuid
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from app.common.limits import MAX_ITEM_QUANTITY
from app.common.schemas import CamelModel, PageResponse
from app.orders.discounts import MAX_DISCOUNT_PERCENT
from app.orders.models import DiscountKind, OrderStatus, PendingStage

# Mirrored by `OWNER_MESSAGE_MAX_LENGTH` on the website, which counts down to it.
MAX_OWNER_MESSAGE_LENGTH = 3500

# Why a discount was given. Mirrored by `DISCOUNT_NOTE_MAX_LENGTH` on the website. Short
# on purpose: it goes into the bot message under the new sum, not into a letter.
MAX_DISCOUNT_NOTE_LENGTH = 500

# The largest amount a discount may name, in cents — a sanity ceiling on the request, the
# real one being the line or the order it is taken from (`DiscountExceedsTotalError`).
MAX_DISCOUNT_AMOUNT_CENTS = 2_000_000_000

# Lines in one order the owner builds by hand. A ceiling on the request, not a rule
# about orders: a checkout is bounded by the cart, and this one by nothing else.
MAX_ADMIN_ORDER_LINES = 100

__all__ = [
    "MAX_ADMIN_ORDER_LINES",
    "MAX_DISCOUNT_NOTE_LENGTH",
    "MAX_ITEM_QUANTITY",
    "MAX_OWNER_MESSAGE_LENGTH",
    "AdminOrderCreateRequest",
    "AdminOrderCycleResponse",
    "AdminOrderDiscount",
    "AdminOrderDiscountPreviewResponse",
    "AdminOrderDiscountRequest",
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
    # The order's as the customer's page read it (`OrderResponse.revision`): the page
    # warned about the discounts the change takes off, and a newer one would go unwarned.
    revision: int = Field(ge=0)
    # Same floor as the cart: dropping to zero is "remove", and that has its own endpoint,
    # so a 0 here is a mistake worth reporting rather than a silent deletion.
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class OrderItemAddRequest(CamelModel):
    """A volume added to an order that's already been placed — not through the cart.

    The cart belongs to the *next* order; adding there would leave this one unchanged.

    Addressed by variant, not by product: the customer picks "30 мл", and a product sold
    in two volumes gives the server no way to guess which one was meant.

    `revision` as in `OrderItemQuantityRequest`.
    """

    revision: int = Field(ge=0)
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


class AdminOrderDiscount(CamelModel):
    """A discount as the admin sets it: whole percent (1–100), or an amount in cents."""

    kind: DiscountKind
    value: int = Field(ge=1, le=MAX_DISCOUNT_AMOUNT_CENTS)
    note: str | None = Field(default=None, max_length=MAX_DISCOUNT_NOTE_LENGTH)

    @field_validator("note")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def _percent_in_range(self) -> "AdminOrderDiscount":
        if self.kind is DiscountKind.PERCENT and self.value > MAX_DISCOUNT_PERCENT:
            raise ValueError("a percent discount is at most 100")
        return self


class AdminOrderDiscountRequest(CamelModel):
    """Give a discount on one of the order's lines, or on the whole order — or take it back.

    `item_id` names the line; omitted, the discount is on the whole order. `discount` null
    removes the one the target has. `revision` is the order's as the panel read it, as in
    `AdminOrderEditRequest`: the admin confirmed a sum computed from those lines.
    """

    revision: int = Field(ge=0)
    item_id: uuid.UUID | None = None
    discount: AdminOrderDiscount | None


class AdminOrderDiscountPreviewResponse(CamelModel):
    """What the order would come to with the discount — `PUT .../discount` without saving."""

    total_cents: int


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
    # The line's own discount, as the admin set it, and what it comes to now.
    # `line_total_cents` stays price × quantity; what the line costs after the discount
    # is `line_total_cents - discount_cents`.
    discount_kind: DiscountKind | None = None
    discount_value: int | None = None
    discount_note: str | None = None
    discount_cents: int = 0


class OrderResponse(CamelModel):
    id: uuid.UUID
    cycle_id: uuid.UUID
    status: OrderStatus
    # What the customer pays, every discount taken off.
    total_cents: int
    # Price × quantity over every line, before any discount. Equal to `total_cents` on
    # an order without discounts.
    subtotal_cents: int = 0
    # The order's own discount (not the lines'), as set, and what it comes to now.
    discount_kind: DiscountKind | None = None
    discount_value: int | None = None
    discount_note: str | None = None
    discount_cents: int = 0
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
    # Moves with every change to the lines and their discounts. Sent back with an edit
    # (`OrderItemQuantityRequest.revision`, `AdminOrderEditRequest.revision`), so a change
    # decided on lines that have since moved is refused instead of applied over them.
    revision: int = 0


class AdminOrderResponse(OrderResponse):
    """Admin view — adds the customer, which the owner needs to fulfil the request.

    Kept separate from OrderResponse so the customer-facing contract is unchanged
    (and so a customer's own order never carries another user's details).
    """

    customer_name: str
    customer_phone: str
    # The customer's profile as it is now, not a copy taken at checkout: the hand-over
    # is arranged in person after the order is paid, and the address that matters then
    # is the current one. Null when the customer left it empty, and for an erased account.
    customer_delivery_address: str | None = None
    customer_delivery_note: str | None = None
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
    `item_count` counts units, the way each row of the table does ("3 товара"), not lines.
    """

    item_count: int
    total_cents: int


class AdminOrderPageResponse(PageResponse[AdminOrderResponse]):
    summary: AdminOrdersSummary
