import enum
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    select,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.elements import ColumnElement

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


class OrderStatus(enum.StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    READY = "READY"
    COMPLETED = "COMPLETED"
    # Cancellation says who did it. One CANCELLED left both sides guessing: the customer
    # couldn't tell "я передумал" from "владелец не смог достать", and the owner couldn't
    # tell an order they'd dropped themselves from one that walked away.
    CANCELLED_BY_CUSTOMER = "CANCELLED_BY_CUSTOMER"
    CANCELLED_BY_OWNER = "CANCELLED_BY_OWNER"


# Everything that means "this order is off". Membership, not equality, is the test —
# a cancelled order is cancelled whoever ended it.
CANCELLED_STATUSES = frozenset({OrderStatus.CANCELLED_BY_CUSTOMER, OrderStatus.CANCELLED_BY_OWNER})

# Everything the customer is still waiting on. The complement of "off" plus COMPLETED:
# a handed-over order is as finished as a cancelled one, it just ended well. Used where
# a short list has room only for what still needs the person's attention (the bot's
# "Мои заявки"), never on the site — there the full history is the point.
OPEN_STATUSES = frozenset({OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.READY})

# Where the customer is asked to pay and may send a receipt: confirmation is the message
# that carries the amount and the requisites, and READY can come before the money does.
# PENDING has nothing to pay for yet — its total still moves with the catalog price.
PAYABLE_STATUSES = frozenset({OrderStatus.CONFIRMED, OrderStatus.READY})

# Where an order may go from where it is. The owner's panel used to accept any target at
# all, so a promise about an order — "подтверждена", "готова к выдаче" — could be made
# about one the customer had already withdrawn, and a finished order could be walked back
# into the purchase list.
#
# Cancelling stays available from every live status: it is the answer to "не смогла
# достать", which can happen at any point up to handover.
#
# A cancellation is undone by whoever made it, and by nobody else. The owner's own goes
# back to PENDING from here; the customer's is theirs to take back, through
# `OrdersService.restore`, and never appears in this table — the owner reviving an order
# the customer withdrew would put them back in a queue they chose to leave. COMPLETED
# leads nowhere either way: it is a statement about goods already handed over.
ALLOWED_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.PENDING: frozenset({OrderStatus.CONFIRMED, OrderStatus.CANCELLED_BY_OWNER}),
    OrderStatus.CONFIRMED: frozenset({OrderStatus.READY, OrderStatus.CANCELLED_BY_OWNER}),
    OrderStatus.READY: frozenset({OrderStatus.COMPLETED, OrderStatus.CANCELLED_BY_OWNER}),
    OrderStatus.COMPLETED: frozenset(),
    OrderStatus.CANCELLED_BY_CUSTOMER: frozenset(),
    OrderStatus.CANCELLED_BY_OWNER: frozenset({OrderStatus.PENDING}),
}


class PendingStage(enum.StrEnum):
    """Where a PENDING order stands against the cycle's clock.

    `PENDING` says one thing only — nothing has been bought against this order yet — and
    that single word covered two situations the customer reads very differently: an order
    in a cycle still collecting, which they may still rewrite, and one in a cycle that
    closed weeks ago, which they could neither change nor understand. The badge stayed
    "Ожидает подтверждения" for both and the page went silent for the second.

    The stage is not a status and never reaches the database: it is derived from the
    cycle behind the order, so it moves on its own as time passes and no sweep has to
    walk the table to keep it true. Only the copy branches on it — every rule about what
    the customer may *do* still hangs off the status.
    """

    # The cycle is still collecting: the order is editable, like it was at checkout.
    COLLECTING = "COLLECTING"
    # The cycle closed and the owner is out buying against the list this order is on.
    PURCHASING = "PURCHASING"
    # Past the shopping window, still unanswered. Nothing is wrong yet — a supplier can
    # be slow — but the shop owes the customer a word, and the page says so.
    DELAYED = "DELAYED"
    # Long past it. In practice this order was never taken into the purchase: saying so
    # is honest, and leaving it saying "ожидает подтверждения" is not.
    UNFULFILLED = "UNFULFILLED"


# How long after a cycle closes the owner is normally still buying. Measured from
# `closed_at` — the cycle's own deadline is when it stopped taking orders, and the
# shopping starts there, so counting from the deadline would be counting the wrong thing
# for a cycle the owner closed early.
PURCHASE_WINDOW = timedelta(days=5)

# When an order still sitting in PENDING stops being "slow" and starts being one that
# never made it into the purchase. Deliberately a good deal wider than the window above:
# the first number is what the shop aims for, this one is what it admits to.
UNFULFILLED_AFTER = timedelta(days=10)

# How long after a cycle closes the owner may still put an order into it on a customer's
# behalf — someone who missed the deadline while the shopping is still going on. Kept
# inside `PURCHASE_WINDOW` on purpose: an order added later would greet its customer with
# "Закупка идёт дольше обычного" on the day it was made.
ADMIN_ORDER_WINDOW = timedelta(days=3)


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    # Every listing of orders — the owner's, the customer's, the export — is newest-first,
    # and the owner's is usually narrowed to one cycle. Without these the admin table sorted
    # the entire orders table on each page request.
    __table_args__ = (
        Index("ix_orders_created_at", text("created_at DESC")),
        Index("ix_orders_cycle_created", "cycle_id", text("created_at DESC")),
        UniqueConstraint("request_id", name="uq_orders_request_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_cycles.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status"), default=OrderStatus.PENDING
    )
    # 64-bit, unlike the per-line columns: this one is a sum. A single line stays inside
    # int4 because MAX_PRICE_CENTS is set just under it, but MAX_PRICE_CENTS × quantity —
    # let alone across lines — passes it easily, and the overflow landed as a 500 at flush
    # on checkout, with no way for the customer to get past it.
    total_cents: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(Text)
    # When the owner pressed «Оплата получена» under a receipt. Not a status: payment runs
    # alongside CONFIRMED → READY → COMPLETED rather than between them, and a status of its
    # own would have to be threaded through every `OPEN_STATUSES` check in the codebase.
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The last time the order went PENDING → CONFIRMED, i.e. when its bill went out. The
    # bot offers only recently confirmed orders when it has to ask which one a receipt
    # pays for; `created_at` would not do, since a cycle collects for weeks before any
    # of its orders is confirmed.
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The admin who placed this order for its customer (`OrdersService.create_for_customer`);
    # NULL for the customer's own checkout. With several admins, "where did this заявка
    # come from" otherwise has no answer. SET NULL rather than CASCADE: the order is the
    # customer's, and it outlives whoever typed it in.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # The key the admin panel sends with an order it places (one per draft), unique so a
    # retry — a double click, a resend after a dropped response — finds the order it
    # already made instead of making a second one. Checkout needs none: the cart row is
    # its key. NULL for every checkout, and Postgres lets NULLs repeat under UNIQUE.
    request_id: Mapped[uuid.UUID | None] = mapped_column()

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by=lambda: _item_order()
    )


class OrderItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    # Which volume was ordered. Nullable for the same reason product_id is — the row
    # outlives what it points at — and, like it, the line stays readable without it
    # because product_volume_ml below is a snapshot.
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(255))
    # Snapshotted alongside name/price so an order stays renderable (thumbnail + link to the
    # catalog page) after the product is edited or soft-deleted — product_id goes NULL then.
    product_slug: Mapped[str] = mapped_column(String(255), default="")
    product_image_url: Mapped[str | None] = mapped_column(String(2048))
    product_price_cents: Mapped[int] = mapped_column(Integer)
    # Snapshotted rather than read from the catalog with the other labels (brand,
    # category — see `OrdersService._product_tags`). Those describe the product and are
    # the same for every line of it; the volume is the thing the customer *chose*, and
    # once a product has several, the product row no longer knows which one this was.
    product_volume_ml: Mapped[int | None] = mapped_column(Integer)
    # The shade, snapshotted for the same reason as the volume: it is the other half of
    # what the customer chose, and "Помада Velvet" alone does not say which one to buy.
    product_shade: Mapped[str | None] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column(Integer)

    order: Mapped["Order"] = relationship(back_populates="items")


def _item_order() -> list[ColumnElement[Any]]:
    """The cart's order — by name, then the volumes the way the owner sorted them.

    Without an ORDER BY the lines came back in heap order, and Postgres writes an
    UPDATE as a new row version elsewhere in the table, so changing a quantity moved
    the line. The variant's position is looked up rather than snapshotted: it is the
    owner's to change, and a line whose variant is gone sorts last within its name.
    The id breaks the remaining ties so the order never depends on the heap.
    """
    from app.catalog.models import ProductVariant

    variant_position = (
        select(ProductVariant.sort_order)
        .where(ProductVariant.id == OrderItem.variant_id)
        .scalar_subquery()
    )
    return [OrderItem.product_name.asc(), variant_position.asc().nulls_last(), OrderItem.id.asc()]
