import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class WishlistItem(UUIDPrimaryKeyMixin, Base):
    """A product a customer wants, independent of any order cycle.

    Deliberately not modelled like the cart: a cart belongs to a cycle (that is what
    makes checkout meaningful), while the whole point of a wishlist is to survive the
    gaps between cycles, so it hangs off the user directly.

    No quantity and no TimestampMixin — the row is either there or not, and is never
    updated. Only created_at is kept, and only so the list can be shown newest-first.
    """

    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
