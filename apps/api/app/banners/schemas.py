import re
import uuid
from datetime import datetime

from pydantic import AwareDatetime, Field, field_validator

from app.banners.models import BannerKind, BannerState
from app.common.limits import (
    MAX_NEWS_CTA_LENGTH,
    MAX_NEWS_TEXT_LENGTH,
    MAX_NEWS_TITLE_LENGTH,
)
from app.common.schemas import CamelModel
from app.promotions.models import PromotionStatus

# "promotion:<uuid>" or "news:<uuid>" — what the order request names its items by.
_KEY_PATTERN = re.compile(
    r"^(promotion|news):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def _blank_to_none(value: str | None) -> str | None:
    """A form sends an empty field as "": for an optional text that means "none"."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class NewsBannerWriteRequest(CamelModel):
    """`POST /admin/banners/news` and `PUT /admin/banners/news/{id}` — the whole news item.

    The pictures are not here: they are files, uploaded on their own after the item exists.
    """

    title: str = Field(min_length=1, max_length=MAX_NEWS_TITLE_LENGTH)
    text: str | None = Field(default=None, max_length=MAX_NEWS_TEXT_LENGTH)
    link_url: str | None = Field(default=None, max_length=2048)
    cta_label: str | None = Field(default=None, max_length=MAX_NEWS_CTA_LENGTH)
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    is_enabled: bool = True

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("заголовок не может быть пустым")
        return stripped

    @field_validator("text", "link_url", "cta_label")
    @classmethod
    def _optional_text(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class BannerShownRequest(CamelModel):
    is_shown: bool


class NewsBannerEnabledRequest(CamelModel):
    is_enabled: bool


class BannerOrderRequest(CamelModel):
    """The whole list of keys in the new order — the same set `GET /admin/banners` returned."""

    keys: list[str] = Field(max_length=1000)

    @field_validator("keys")
    @classmethod
    def _keys_are_well_formed(cls, value: list[str]) -> list[str]:
        if any(_KEY_PATTERN.match(key) is None for key in value):
            raise ValueError("некорректный ключ баннера")
        if len(set(value)) != len(value):
            raise ValueError("ключи не должны повторяться")
        return value


class BannerSlideResponse(CamelModel):
    """One slide as the storefront draws it."""

    key: str
    kind: BannerKind
    title: str
    text: str | None
    image_mobile_url: str | None
    image_desktop_url: str | None
    promotion_slug: str | None
    link_url: str | None
    cta_label: str | None


class NewsBannerDetailResponse(CamelModel):
    """The news item's own fields, for the admin form."""

    title: str
    text: str | None
    link_url: str | None
    cta_label: str | None
    image_mobile_url: str | None
    image_desktop_url: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_enabled: bool


class AdminBannerItemResponse(CamelModel):
    key: str
    # The promotion's or the news item's id.
    id: uuid.UUID
    kind: BannerKind
    state: BannerState
    # The owner's choice: "show in the carousel" for a promotion, `isEnabled` for a news item.
    is_shown: bool
    position: int | None
    slide: BannerSlideResponse
    promotion_id: uuid.UUID | None
    promotion_status: PromotionStatus | None
    starts_at: datetime | None
    ends_at: datetime | None
    news: NewsBannerDetailResponse | None
    created_at: datetime


__all__ = [
    "AdminBannerItemResponse",
    "BannerOrderRequest",
    "BannerShownRequest",
    "BannerSlideResponse",
    "NewsBannerDetailResponse",
    "NewsBannerEnabledRequest",
    "NewsBannerWriteRequest",
]
