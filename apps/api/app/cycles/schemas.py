import uuid
from datetime import datetime

from pydantic import Field

from app.common.schemas import CamelModel
from app.cycles.models import CycleStatus


class OrderCycleResponse(CamelModel):
    id: uuid.UUID
    deadline_at: datetime
    label: str | None
    status: CycleStatus
    reminder_sent_at: datetime | None
    final_reminder_sent_at: datetime | None
    closed_at: datetime | None


class CycleCreateRequest(CamelModel):
    deadline_at: datetime
    label: str | None = Field(default=None, max_length=255)


class CycleUpdateRequest(CamelModel):
    deadline_at: datetime | None = None
    label: str | None = Field(default=None, max_length=255)
