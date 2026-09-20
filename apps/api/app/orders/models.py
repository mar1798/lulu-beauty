import enum
import uuid
from datetime import timedelta

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

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


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    # Every listing of orders — the owner's, the customer's, the export — is newest-first,
    # and the owner's is usually narrowed to one cycle. Without these the admin table sorted
    # the entire orders table on each page request.
    __table_args__ = (
        Index("ix_orders_created_at", text("created_at DESC")),
        Index("ix_orders_cycle_created", "cycle_id", text("created_at DESC")),
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

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(255))
    # Snapshotted alongside name/price so an order stays renderable (thumbnail + link to the
    # catalog page) after the product is edited or soft-deleted — product_id goes NULL then.
    product_slug: Mapped[str] = mapped_column(String(255), default="")
    product_image_url: Mapped[str | None] = mapped_column(String(2048))
    product_price_cents: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)

    order: Mapped["Order"] = relationship(back_populates="items")
