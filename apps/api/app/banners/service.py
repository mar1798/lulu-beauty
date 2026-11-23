"""The catalogue carousel: the feed the storefront reads and the owner's side of it.

Two kinds of slide share one order. A promotion's slide is *derived* from the promotion when
read — title, pictures, link and window are the promotion's own — and the owner stores only
a decision about it (`PromotionBannerSetting`). A news item is a row of its own.

Like every service here it takes the session, mutates, and leaves the commit to the caller.
Files are the caller's too: a method that takes a picture off returns its address, and the
router discards the file after the commit (`storage.discard_files`).
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.banners.links import is_valid_banner_link
from app.banners.models import (
    BannerKind,
    BannerState,
    NewsBanner,
    PromotionBannerSetting,
    news_banner_state,
)
from app.common.limits import MAX_NEWS_BANNERS
from app.promotions.models import (
    Promotion,
    PromotionStatus,
    automatic,
    promotion_status,
    running_promotion_filters,
)
from app.promotions.service import BannerVariant, PromotionNotFoundError, PromotionsService

# Key of the transaction-scoped advisory lock that serialises `create_news` (the limit check).
NEWS_CREATE_LOCK = 0x4E455753


class BannerNotFoundError(Exception):
    pass


class BannerOrderMismatchError(Exception):
    """The submitted keys are not the set the list holds now — it changed under the owner."""


class BannerEndsBeforeStartError(Exception):
    pass


class BannerLinkInvalidError(Exception):
    pass


class TooManyNewsBannersError(Exception):
    pass


@dataclass(frozen=True)
class NewsDraft:
    """Everything the news form sends, already parsed."""

    title: str
    text: str | None
    link_url: str | None
    cta_label: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_enabled: bool


@dataclass(frozen=True)
class BannerItem:
    """One row of the owner's list: a promotion or a news item, with its derived state."""

    kind: BannerKind
    state: BannerState
    # The owner's choice — `show_in_carousel` for a promotion, `is_enabled` for news.
    is_shown: bool
    position: int | None
    created_at: datetime
    promotion: Promotion | None = None
    news: NewsBanner | None = None

    @property
    def id(self) -> uuid.UUID:
        entity = self.promotion or self.news
        assert entity is not None
        return entity.id

    @property
    def key(self) -> str:
        return banner_key(self.kind, self.id)


def banner_key(kind: BannerKind, item_id: uuid.UUID) -> str:
    return f"{'promotion' if kind is BannerKind.PROMOTION else 'news'}:{item_id}"


def _promotion_state(
    promotion: Promotion, setting: PromotionBannerSetting | None, now: datetime
) -> BannerState:
    if not promotion.is_enabled:
        return BannerState.PROMOTION_OFF
    if promotion.ends_at is not None and now >= promotion.ends_at:
        return BannerState.FINISHED
    if now < promotion.starts_at:
        return BannerState.SCHEDULED
    if promotion.banner_mobile_url is None:
        return BannerState.NO_IMAGE
    if setting is not None and not setting.show_in_carousel:
        return BannerState.HIDDEN
    return BannerState.SHOWN


def _promotion_item(
    promotion: Promotion, setting: PromotionBannerSetting | None, now: datetime
) -> BannerItem:
    return BannerItem(
        kind=BannerKind.PROMOTION,
        state=_promotion_state(promotion, setting, now),
        is_shown=setting.show_in_carousel if setting is not None else True,
        position=setting.position if setting is not None else None,
        created_at=promotion.created_at,
        promotion=promotion,
    )


def _news_item(news: NewsBanner, now: datetime) -> BannerItem:
    return BannerItem(
        kind=BannerKind.NEWS,
        state=news_banner_state(news, now),
        is_shown=news.is_enabled,
        position=news.position,
        created_at=news.created_at,
        news=news,
    )


def arrange(items: Sequence[BannerItem]) -> list[BannerItem]:
    """The carousel's order: the not-yet-placed first (newest first), then by position.

    Ties on a position fall back to the newest, then to the id, so the order never wobbles
    between two reads. Sorted in three stable passes, last key most significant.
    """
    result = list(items)
    result.sort(key=lambda item: item.id)
    result.sort(key=lambda item: item.created_at, reverse=True)
    result.sort(key=lambda item: (item.position is not None, item.position or 0))
    return result


class BannersService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---- the storefront ------------------------------------------------------------------

    async def feed(self, now: datetime | None = None) -> list[BannerItem]:
        """The slides in the carousel right now, in order."""
        moment = now or datetime.now(UTC)
        promotion_rows = await self._session.execute(
            select(Promotion, PromotionBannerSetting)
            .outerjoin(PromotionBannerSetting, PromotionBannerSetting.promotion_id == Promotion.id)
            .where(
                *running_promotion_filters(moment),
                Promotion.banner_mobile_url.is_not(None),
                func.coalesce(PromotionBannerSetting.show_in_carousel, True).is_(True),
            )
        )
        items = [
            _promotion_item(promotion, setting, moment)
            for promotion, setting in promotion_rows.tuples()
        ]
        news = await self._session.scalars(
            select(NewsBanner).where(
                NewsBanner.is_enabled.is_(True),
                or_(NewsBanner.starts_at.is_(None), NewsBanner.starts_at <= moment),
                or_(NewsBanner.ends_at.is_(None), NewsBanner.ends_at > moment),
            )
        )
        items.extend(_news_item(row, moment) for row in news)
        return arrange(items)

    # ---- the owner's list ----------------------------------------------------------------

    async def admin_items(self, now: datetime | None = None) -> list[BannerItem]:
        """Every automatic, not archived promotion and every news item, in feed order."""
        moment = now or datetime.now(UTC)
        rows = await self._session.execute(
            select(Promotion, PromotionBannerSetting)
            .outerjoin(PromotionBannerSetting, PromotionBannerSetting.promotion_id == Promotion.id)
            .where(automatic(), Promotion.deleted_at.is_(None))
            .execution_options(populate_existing=True)
        )
        items = [
            _promotion_item(promotion, setting, moment) for promotion, setting in rows.tuples()
        ]
        news = await self._session.scalars(
            select(NewsBanner).execution_options(populate_existing=True)
        )
        items.extend(_news_item(row, moment) for row in news)
        return arrange(items)

    async def carousel_flags(self, promotion_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, bool]:
        """`show_in_carousel` per promotion; one without a row is shown."""
        if not promotion_ids:
            return {}
        rows = await self._session.execute(
            select(PromotionBannerSetting.promotion_id, PromotionBannerSetting.show_in_carousel)
            .where(PromotionBannerSetting.promotion_id.in_(promotion_ids))
            .execution_options(populate_existing=True)
        )
        return {promotion_id: shown for promotion_id, shown in rows.tuples()}

    async def promotion_item(self, promotion_id: uuid.UUID) -> BannerItem:
        for item in await self.admin_items():
            if item.promotion is not None and item.promotion.id == promotion_id:
                return item
        raise PromotionNotFoundError

    async def news_item(self, news_id: uuid.UUID) -> BannerItem:
        return _news_item(await self._get_news(news_id), datetime.now(UTC))

    async def set_promotion_shown(self, promotion_id: uuid.UUID, is_shown: bool) -> BannerItem:
        """The owner's "show in the carousel" switch. The promotion itself — and so its
        discount — is untouched; the row is created on the first decision."""
        promotion = await PromotionsService(self._session).get(promotion_id)
        if promotion.deleted_at is not None:
            raise PromotionNotFoundError
        await self._session.execute(
            insert(PromotionBannerSetting)
            .values(promotion_id=promotion_id, show_in_carousel=is_shown)
            .on_conflict_do_update(
                index_elements=[PromotionBannerSetting.promotion_id],
                set_={"show_in_carousel": is_shown, "updated_at": func.now()},
            )
        )
        return await self.promotion_item(promotion_id)

    async def reorder(self, keys: Sequence[str]) -> None:
        """Places the whole list. `keys` must be exactly the set the list holds now."""
        items = await self.admin_items()
        if set(keys) != {item.key for item in items} or len(keys) != len(items):
            raise BannerOrderMismatchError
        by_key = {item.key: item for item in items}
        promotion_rows: list[dict[str, object]] = []
        for position, key in enumerate(keys):
            item = by_key[key]
            if item.news is not None:
                item.news.position = position
            else:
                promotion_rows.append(
                    {
                        "promotion_id": item.id,
                        "show_in_carousel": item.is_shown,
                        "position": position,
                    }
                )
        if promotion_rows:
            statement = insert(PromotionBannerSetting).values(promotion_rows)
            await self._session.execute(
                statement.on_conflict_do_update(
                    index_elements=[PromotionBannerSetting.promotion_id],
                    set_={"position": statement.excluded.position, "updated_at": func.now()},
                )
            )
        await self._session.flush()

    # ---- news ----------------------------------------------------------------------------

    async def create_news(self, draft: NewsDraft) -> NewsBanner:
        self._check(draft)
        # Serialise creators for the length of the transaction: count and INSERT are two steps.
        await self._session.execute(select(func.pg_advisory_xact_lock(NEWS_CREATE_LOCK)))
        count = await self._session.scalar(select(func.count()).select_from(NewsBanner))
        if (count or 0) >= MAX_NEWS_BANNERS:
            raise TooManyNewsBannersError
        news = NewsBanner()
        self._apply(news, draft)
        self._session.add(news)
        await self._session.flush()
        return news

    async def update_news(self, news_id: uuid.UUID, draft: NewsDraft) -> NewsBanner:
        news = await self._get_news(news_id)
        self._check(draft)
        self._apply(news, draft)
        await self._session.flush()
        return news

    async def set_news_enabled(self, news_id: uuid.UUID, is_enabled: bool) -> NewsBanner:
        news = await self._get_news(news_id)
        news.is_enabled = is_enabled
        await self._session.flush()
        return news

    async def delete_news(self, news_id: uuid.UUID) -> list[str]:
        """Deletes the item; returns the pictures nothing points at any more."""
        news = await self._get_news(news_id)
        urls = [url for url in (news.image_mobile_url, news.image_desktop_url) if url is not None]
        await self._session.delete(news)
        await self._session.flush()
        return urls

    async def set_news_image(
        self, news_id: uuid.UUID, variant: BannerVariant, url: str
    ) -> tuple[NewsBanner, str | None]:
        """Puts a picture up; returns the item and the address of the one it replaced."""
        news = await self._get_news(news_id)
        previous = self._image(news, variant)
        self._set_image(news, variant, url)
        await self._session.flush()
        return news, previous

    async def remove_news_image(
        self, news_id: uuid.UUID, variant: BannerVariant
    ) -> tuple[NewsBanner, str | None]:
        news = await self._get_news(news_id)
        previous = self._image(news, variant)
        self._set_image(news, variant, None)
        await self._session.flush()
        return news, previous

    async def get_news(self, news_id: uuid.UUID) -> NewsBanner:
        return await self._get_news(news_id)

    # ---- internals -----------------------------------------------------------------------

    async def _get_news(self, news_id: uuid.UUID) -> NewsBanner:
        news = await self._session.get(NewsBanner, news_id)
        if news is None:
            raise BannerNotFoundError
        return news

    @staticmethod
    def _check(draft: NewsDraft) -> None:
        if (
            draft.starts_at is not None
            and draft.ends_at is not None
            and draft.ends_at <= draft.starts_at
        ):
            raise BannerEndsBeforeStartError
        if draft.link_url is not None and not is_valid_banner_link(draft.link_url):
            raise BannerLinkInvalidError

    @staticmethod
    def _apply(news: NewsBanner, draft: NewsDraft) -> None:
        news.title = draft.title
        news.text = draft.text
        news.link_url = draft.link_url
        news.cta_label = draft.cta_label
        news.starts_at = draft.starts_at
        news.ends_at = draft.ends_at
        news.is_enabled = draft.is_enabled

    @staticmethod
    def _image(news: NewsBanner, variant: BannerVariant) -> str | None:
        if variant is BannerVariant.MOBILE:
            return news.image_mobile_url
        return news.image_desktop_url

    @staticmethod
    def _set_image(news: NewsBanner, variant: BannerVariant, url: str | None) -> None:
        if variant is BannerVariant.MOBILE:
            news.image_mobile_url = url
        else:
            news.image_desktop_url = url


def promotion_status_of(item: BannerItem, now: datetime) -> PromotionStatus | None:
    return promotion_status(item.promotion, now) if item.promotion is not None else None
