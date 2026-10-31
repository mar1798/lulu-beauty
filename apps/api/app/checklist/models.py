import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class ChecklistExtra(UUIDPrimaryKeyMixin, Base):
    """A line the owner added to a cycle's purchase list by hand.

    Everything else on the checklist is computed from orders; this is what no order asks
    for — a tester, bags, something for the shop itself. It belongs to a cycle because the
    list does, and goes with it (ON DELETE CASCADE). No product link: it is free text, and
    the price is whatever the owner typed, 0 unless they knew it.

    Stored rather than kept in the browser next to the "bought" ticks: a tick is one phone's
    progress through a shop, but a line is part of the list — added on a laptop, it has to
    be there on the phone, and its price counts in the total.
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
