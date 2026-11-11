import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base

#: Cap on a tick's key. The page builds it from a product name (255), a volume, a price and
#: a shade, so a real one is a fraction of this; the cap only bounds the column.
MARK_KEY_MAX_LENGTH = 1024


class ChecklistExtra(UUIDPrimaryKeyMixin, Base):
    """A line the owner added to a cycle's purchase list by hand.

    Everything else on the checklist is computed from orders; this is what no order asks
    for — a tester, bags, something for the shop itself. It belongs to a cycle because the
    list does, and goes with it (ON DELETE CASCADE). No product link: it is free text, and
    the price is whatever the owner typed, 0 unless they knew it.

    Stored rather than kept in the browser: added on a laptop, a line has to be there on
    the phone, and its price counts in the total.
    """

    __tablename__ = "checklist_extras"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_cycles.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_cents: Mapped[int] = mapped_column(Integer, server_default="0")
    # `clock_timestamp()`, not `now()`: the list is ordered by this, and `now()` is the
    # transaction's start — two lines added in one transaction would tie.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )


class ChecklistMark(Base):
    """A "bought" tick on one row of a cycle's purchase list.

    On the server, not in the browser, because the list is shared: two admins split a shop
    between them, and what one has ticked the other must see as bought. Goes with the cycle
    (ON DELETE CASCADE), like the list itself.

    The key is the page's own row key (`itemKey` in `pages/admin/checklist.tsx`: name,
    volume, price, shade; `extra|<id>` for a hand-added line), stored as an opaque string.
    It deliberately leaves out the quantity, so a cancellation after the purchase does not
    untick what is already bought — and a tick whose row is gone simply matches nothing.
    """

    __tablename__ = "checklist_marks"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_cycles.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(MARK_KEY_MAX_LENGTH), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
