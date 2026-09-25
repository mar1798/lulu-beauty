import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.limits import MAX_WANTED_MESSAGE_LENGTH
from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class WantedProduct(UUIDPrimaryKeyMixin, Base):
    """Something a customer looked for and the catalog did not have.

    Not a wishlist item, which points at a product that exists. This is free text, written
    where the search came back empty, and the only thing it turns into is a line on the
    owner's shopping list for the next cycle. Nothing in the shop reads it back: no cart,
    no order and no cycle hangs off this table.

    Stored even though the owner is told over Telegram the moment it arrives, because the
    notification is best-effort by design (`telegram/notify.py` swallows its own failures)
    and the next cycle is assembled days later, when a chat message has long scrolled past.
    The row is what survives both.

    `user_id` is nullable and detaches instead of cascading: the search is open to guests,
    so half of these have no account behind them, and the ones that do must not disappear
    with an order history that outlives the person. Name and phone are copied in rather than
    read back through the link for the same reason — for a guest there is nothing to read,
    and for a customer the contact that was current when they wrote is the one this note is
    about. Erasing an account deletes its rows here outright (`UsersService.delete_account`):
    that copy is exactly the personal data the erasure is for.
    """

    __tablename__ = "wanted_products"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(String(MAX_WANTED_MESSAGE_LENGTH))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
