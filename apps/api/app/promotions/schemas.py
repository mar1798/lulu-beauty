import uuid
from datetime import datetime
from typing import Self

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.catalog.schemas import SLUG_PATTERN, require_description_length
from app.common.limits import (
    MAX_DESCRIPTION_HTML_LENGTH,
    MAX_PROMOTION_CONDITIONS,
    MAX_PROMOTION_REWARDS,
)
from app.common.schemas import CamelModel
from app.promotions.models import PromotionStatus
from app.promotions.rules import Condition, PromotionRules, Reward


class PromotionWriteRequest(CamelModel):
    """`POST /admin/promotions` and `PUT /admin/promotions/{id}` — the whole promotion.

    A PUT rather than a PATCH: the form always holds every field, and the two lists are
    replaced whole anyway. The banners are not here — they are files, uploaded on their own.
    """

    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    title: str = Field(min_length=1, max_length=255)
    description_html: str | None = Field(default=None, max_length=MAX_DESCRIPTION_HTML_LENGTH)
    starts_at: AwareDatetime
    # Omitted or null: open-ended, runs until disabled or archived.
    ends_at: AwareDatetime | None = None
    is_enabled: bool = True
    announce: bool = False
    sort_order: int = Field(default=0, ge=0, le=10_000)
    conditions: list[Condition] = Field(default_factory=list, max_length=MAX_PROMOTION_CONDITIONS)
    rewards: list[Reward] = Field(min_length=1, max_length=MAX_PROMOTION_REWARDS)

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

    @model_validator(mode="after")
    def _rules_hold_together(self) -> Self:
        # The checks that span both lists live on `PromotionRules`; run them here too, so
        # a request breaking one is a 422 naming the field, like any other.
        PromotionRules(conditions=self.conditions, rewards=self.rewards)
        return self


class GiftImageResponse(CamelModel):
    """The address of an uploaded gift picture, to put into a `GIFT` reward's `imageUrl`."""

    url: str


class PromotionEnabledRequest(CamelModel):
    is_enabled: bool


class PromotionDeletionResponse(CamelModel):
    """What a delete did: removed the row, or archived it because somebody had taken part."""

    deleted: bool


class PromotionResponse(CamelModel):
    id: uuid.UUID
    slug: str
    title: str
    description_html: str | None
    banner_mobile_url: str | None
    banner_desktop_url: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_enabled: bool
    announce: bool
    announced_at: datetime | None
    sort_order: int
    conditions: list[Condition]
    rewards: list[Reward]
    status: PromotionStatus
    # Live participations — orders not cancelled or released from it.
    participants_count: int
    # The owner's switch in the banners section; the discount works either way.
    show_in_carousel: bool = True
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NamedRefResponse(CamelModel):
    """A product or category a promotion's rules name, so the page can say which."""

    id: uuid.UUID
    name: str
    slug: str


class PublicPromotionResponse(CamelModel):
    """What the storefront sees of a running promotion: no flags, no counters, no history.

    `products` and `categories` are the names behind the ids in the rules (the promised
    promo code's included); a soft-deleted product or a gone category is not listed.
    """

    id: uuid.UUID
    slug: str
    title: str
    description_html: str | None
    banner_mobile_url: str | None
    banner_desktop_url: str | None
    starts_at: datetime
    ends_at: datetime | None
    conditions: list[Condition]
    rewards: list[Reward]
    products: list[NamedRefResponse] = []
    categories: list[NamedRefResponse] = []


class PromotionParticipantResponse(CamelModel):
    """One order's part in the promotion, for the admin's «Участники» list."""

    order_promotion_id: uuid.UUID
    order_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    order_status: str
    order_total_cents: int
    rewards: list[Reward]
    released_at: datetime | None
    created_at: datetime
