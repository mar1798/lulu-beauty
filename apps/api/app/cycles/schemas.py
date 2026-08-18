import uuid
from datetime import datetime

from pydantic import AwareDatetime, Field, field_validator

from app.common.schemas import CamelModel, require_not_null
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
    # None means "omitted"; order_cycles.deadline_at is NOT NULL, so an explicit `null`
    # is refused here rather than reaching the database as one. `label` is nullable and
    # clearing it is a legitimate edit.
    deadline_at: Deadline | None = None
    label: str | None = Field(default=None, max_length=255)

    @field_validator("deadline_at", mode="before")
    @classmethod
    def _reject_null(cls, value: object) -> object:
        return require_not_null(value)
