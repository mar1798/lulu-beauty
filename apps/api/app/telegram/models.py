from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class PendingTelegramContact(UUIDPrimaryKeyMixin, Base):
    """Phone → chat_id link captured via /start + contact-share before the phone has a User row."""

    __tablename__ = "pending_telegram_contacts"

    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
