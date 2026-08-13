import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


class Role(enum.StrEnum):
    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A customer (or the owner), identified by a phone number Telegram vouched for.

    No password column: the only way into an account is the Telegram bot, which is also
    the only channel this shop notifies over. A password would have added a second
    secret that every recovery path routes back through Telegram anyway — it protected
    against exactly the person it could not protect against.

    By the same token there is no `phone_verified`: an account is created when someone
    shares their contact with the bot, and Telegram fills that contact in itself
    (`handle_contact` additionally checks the card belongs to the sender). An unverified
    phone is therefore not a state this table can be in.
    """

    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(SAEnum(Role, name="role"), default=Role.CUSTOMER)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")


class RefreshToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class TelegramAuthSession(UUIDPrimaryKeyMixin, Base):
    """One attempt to sign in: a browser tab waiting for the bot to vouch for someone.

    Two secrets, deliberately: `link_payload` travels inside the `t.me/…?start=` link
    and ends up as visible text in the Telegram chat, while `poll_secret_hash` never
    leaves the browser (the site keeps the secret in an httpOnly cookie). Polling on
    the payload alone would mean anyone who can read the chat — a shared screen, a
    forwarded message — could claim the session out from under its owner.

    The states are timestamps rather than an enum: a row is pending until
    `authorized_at`, spent after `consumed_at`, and dead after `expires_at`. Nothing can
    be in two of those at once, which an enum plus timestamps would allow.
    """

    __tablename__ = "telegram_auth_sessions"

    link_payload: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    poll_secret_hash: Mapped[str] = mapped_column(String(255), unique=True)
    # Filled in when the bot receives /start: a brand-new chat has no account yet, and
    # the contact it shares moments later has to find its way back to this session.
    chat_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User | None"] = relationship()
