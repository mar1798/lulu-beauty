import enum
import uuid

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
