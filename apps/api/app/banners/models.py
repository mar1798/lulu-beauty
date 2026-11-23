import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


class BannerKind(enum.StrEnum):
    PROMOTION = "PROMOTION"
    NEWS = "NEWS"


class BannerState(enum.StrEnum):
    """What the admin list shows for a carousel item. Derived from the rows and the clock,
    never stored — like `PromotionStatus`."""

    # The promotion itself is switched off (which also switches its discount off).
    PROMOTION_OFF = "PROMOTION_OFF"
    FINISHED = "FINISHED"
    SCHEDULED = "SCHEDULED"
    # A promotion without a mobile banner: the carousel has nothing to draw for it.
    NO_IMAGE = "NO_IMAGE"
    # The owner switched the slide off in the banners section.
    HIDDEN = "HIDDEN"
    # The slide is in the carousel right now.
    SHOWN = "SHOWN"


class PromotionBannerSetting(TimestampMixin, Base):
    """What the owner decided about an automatic promotion's slide.

    The slide itself is not stored: its title, pictures, link and window are read from the
    promotion when the carousel is built, so editing the promotion cannot drift from it. A
    promotion without a row here means "shown, not yet placed" — which is also what a row
    created by an older release looks like.
    """

    __tablename__ = "promotion_banner_settings"

    promotion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True
    )
    show_in_carousel: Mapped[bool] = mapped_column(default=True, server_default=sql_text("true"))
    # NULL: not placed yet, so it goes first until the owner arranges the list.
    position: Mapped[int | None] = mapped_column(Integer)


class NewsBanner(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The owner's own slide: a picture, or a text card when there is no picture."""

    __tablename__ = "news_banners"
    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ck_news_banners_window"),)

    title: Mapped[str] = mapped_column(String(255))
    text: Mapped[str | None] = mapped_column(String(500))
    # A path on the site ("/catalog") or an https address; NULL: the slide is not a link.
    link_url: Mapped[str | None] = mapped_column(String(2048))
    cta_label: Mapped[str | None] = mapped_column(String(64))
    image_mobile_url: Mapped[str | None] = mapped_column(String(2048))
    image_desktop_url: Mapped[str | None] = mapped_column(String(2048))
    # The window is [starts_at, ends_at); a missing bound is open on that side.
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_enabled: Mapped[bool] = mapped_column(default=True, server_default=sql_text("true"))
    position: Mapped[int | None] = mapped_column(Integer)


def news_banner_state(news: NewsBanner, now: datetime) -> BannerState:
    if news.ends_at is not None and now >= news.ends_at:
        return BannerState.FINISHED
    if news.starts_at is not None and now < news.starts_at:
        return BannerState.SCHEDULED
    if not news.is_enabled:
        return BannerState.HIDDEN
    return BannerState.SHOWN
