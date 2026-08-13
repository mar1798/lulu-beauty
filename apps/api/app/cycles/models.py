import enum
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import UUIDPrimaryKeyMixin
from app.db import Base


class CycleStatus(enum.StrEnum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class OrderCycle(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_cycles"

    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    label: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[CycleStatus] = mapped_column(
        SAEnum(CycleStatus, name="cycle_status"), default=CycleStatus.UPCOMING
    )
    # Two separate stamps rather than a counter: each reminder stage is a different text
    # sent at a different distance from the deadline, and the sweep has to be able to say
    # which one a cycle has already had (see cycles/scheduler_service.REMINDER_STAGES).
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    final_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
