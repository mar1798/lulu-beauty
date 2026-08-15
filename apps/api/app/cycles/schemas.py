import uuid
from datetime import datetime

from pydantic import AwareDatetime, Field

from app.common.schemas import CamelModel
from app.cycles.models import CycleStatus

# The deadline is compared against `datetime.now(UTC)` in every path that touches it, and
# Python refuses to compare an aware datetime with a naive one. A request carrying
# "2026-09-01T12:00:00" (no offset) therefore reached the service and died there as a 500;
# as an aware-only field it is a 422 with the field named, which is what it always was.
Deadline = AwareDatetime


class OrderCycleResponse(CamelModel):
    id: uuid.UUID
    deadline_at: datetime
    label: str | None
    status: CycleStatus
    reminder_sent_at: datetime | None
    final_reminder_sent_at: datetime | None
    closed_at: datetime | None


class CycleCreateRequest(CamelModel):
    deadline_at: Deadline
    label: str | None = Field(default=None, max_length=255)


class CycleUpdateRequest(CamelModel):
    deadline_at: Deadline | None = None
    label: str | None = Field(default=None, max_length=255)
