import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


class ReceiptKind(enum.StrEnum):
    # Telegram keeps the two apart: a photo is recompressed and comes in several sizes,
    # a document is the file as sent. Forwarding needs to know which call to make.
    PHOTO = "PHOTO"
    DOCUMENT = "DOCUMENT"


class ReceiptVerdict(enum.StrEnum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class PaymentReceipt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A payment receipt a customer sent the bot for one of their orders.

    The file itself stays in Telegram: `file_id` is enough for the bot to send it on to
    the owners again, and storing a copy would put customers' bank details on this server
    for no gain.
    """

    __tablename__ = "payment_receipts"
    # The same file sent twice — an impatient second tap, or a forwarded copy — is one
    # receipt, and the owner should not be asked to review it again.
    __table_args__ = (
        UniqueConstraint("order_id", "file_unique_id", name="uq_payment_receipts_order_file"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ReceiptKind] = mapped_column(SAEnum(ReceiptKind, name="receipt_kind"))
    # Bot-scoped and opaque; Telegram documents no length, so the column is roomy.
    file_id: Mapped[str] = mapped_column(String(512))
    # Stable across bots and re-sends — the one to compare, never to send.
    file_unique_id: Mapped[str] = mapped_column(String(128))
    verdict: Mapped[ReceiptVerdict | None] = mapped_column(
        SAEnum(ReceiptVerdict, name="receipt_verdict")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the customer last sent this file: on creation, and again when a file already
    # decided on is sent back for review. Measured against `orders.confirmed_at`, it
    # tells a receipt for the current bill from one left over from before the order went
    # back to PENDING — `created_at` would not, since a resent file keeps its row.
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
