"""What the admin API says about the owner's promo codes (`/admin/promo-codes`)."""

import uuid
from datetime import datetime

from pydantic import AwareDatetime, Field, field_validator

from app.catalog.schemas import require_description_length
from app.common.limits import (
    MAX_DESCRIPTION_HTML_LENGTH,
    MAX_PROMOTION_CONDITIONS,
    MAX_PROMOTION_REWARDS,
)
from app.common.schemas import CamelModel
from app.promotions.models import PromotionStatus
from app.promotions.rules import CodeReward, Condition


class PromoCodeWriteRequest(CamelModel):
    """`POST /admin/promo-codes` and `PUT /admin/promo-codes/{id}` — the whole code.

    The rewards are a `CodeReward` list: a code gives a discount or a gift, never another
    code (the same rule the codes issued by a promotion follow).
    """

    # Null: generate one (on a PUT, a replacement). A string is normalised and checked in
    # the service, so the refusal carries a machine code the form can show by the field.
    code: str | None = Field(default=None, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    description_html: str | None = Field(default=None, max_length=MAX_DESCRIPTION_HTML_LENGTH)
    starts_at: AwareDatetime
    # Omitted or null: open-ended, valid until disabled or archived.
    ends_at: AwareDatetime | None = None
    is_enabled: bool = True
    # Set: a personal code, usable by this account only. Null: general.
    assigned_user_id: uuid.UUID | None = None
    conditions: list[Condition] = Field(default_factory=list, max_length=MAX_PROMOTION_CONDITIONS)
    rewards: list[CodeReward] = Field(min_length=1, max_length=MAX_PROMOTION_REWARDS)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("название не может быть пустым")
        return stripped

    @field_validator("description_html")
    @classmethod
    def _validate_description_html(cls, value: str | None) -> str | None:
        return require_description_length(value)


class AssignedUserResponse(CamelModel):
    """The customer a personal code belongs to — a superset of the admin's customer picker."""

    id: uuid.UUID
    name: str
    phone: str
    telegram_linked: bool
    # The account was erased: the code can no longer be used by anyone.
    is_deleted: bool


class AdminPromoCodeResponse(CamelModel):
    id: uuid.UUID
    code: str
    title: str
    description_html: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_enabled: bool
    assigned_user: AssignedUserResponse | None
    conditions: list[Condition]
    rewards: list[CodeReward]
    status: PromotionStatus
    # Live participations; for a personal code, more than zero means it was used.
    participants_count: int
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime
