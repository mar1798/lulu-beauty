"""The owner's side of promotions: create, edit, switch on and off, delete, banners.

Like every service here it takes the session, mutates, and leaves the commit to the caller.
Files are the caller's too: a method that takes a banner off returns its address, and the
router discards the file after the commit (`storage.discard_files`).
"""

import enum
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import ColumnElement, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.catalog.models import Category, Product, ProductVariant
from app.catalog.rich_text import description_from_html
from app.catalog.service import UNIQUE_VIOLATION
from app.config import settings
from app.orders.models import Order
from app.promotions.models import OrderPromotion, PromoCode, Promotion, not_ended
from app.promotions.rules import (
    AnyCondition,
    AnyReward,
    PromoCodeReward,
    dump_conditions,
    dump_rewards,
    load_rewards,
    referenced_ids,
)

# SQLSTATE for foreign_key_violation: a participation arrived between the check and the
# delete.
_FOREIGN_KEY_VIOLATION = "23503"


class PromotionNotFoundError(Exception):
    pass


class PromotionSlugTakenError(Exception):
    pass


class PromotionEndsBeforeStartError(Exception):
    pass


class PromotionCodeWindowPastError(Exception):
    """A code template's fixed validity window has already ended: every code it issued would
    be born expired."""


class PromotionInvalidRulesError(Exception):
    """The rules name a product, category or variant the catalogue does not have live."""


def _day(moment: datetime | None) -> date | None:
    """The calendar day of a moment in the shop's timezone, which is how the dialog's
    date fields count."""
    return None if moment is None else moment.astimezone(ZoneInfo(settings.cycle_timezone)).date()


def _stored_windows(current: Promotion | None) -> set[tuple[date | None, date | None]]:
    """The fixed code windows a promotion already has stored, as shop-timezone days; none
    for a new one or an unreadable snapshot (which then simply gives no pass)."""
    if current is None:
        return set()
    try:
        rewards = load_rewards(current.rewards)
    except ValidationError:
        return set()
    return {
        (_day(reward.valid_from), _day(reward.valid_until))
        for reward in rewards
        if isinstance(reward, PromoCodeReward)
    }


class BannerVariant(enum.StrEnum):
    # Required for the carousel; shown on every screen when there is no desktop one.
    MOBILE = "mobile"
    DESKTOP = "desktop"


@dataclass(frozen=True)
class PromotionDraft:
    """Everything the form sends, already parsed — the service's own shape of the request."""

    slug: str
    title: str
    description_html: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_enabled: bool
    announce: bool
    sort_order: int
    conditions: Sequence[AnyCondition]
    rewards: Sequence[AnyReward]


@dataclass(frozen=True)
class Participant:
    participation: OrderPromotion
    order: Order
    user: User


@dataclass(frozen=True)
class Deletion:
    # False when the promotion had participants and was archived instead.
    deleted: bool
    # Banner files nothing points at any more — discarded by the caller after the commit.
    orphaned_urls: list[str]


class PromotionsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_all(self, *, include_deleted: bool = False) -> list[Promotion]:
        query = select(Promotion)
        if not include_deleted:
            query = query.where(Promotion.deleted_at.is_(None))
        query = query.order_by(
            Promotion.deleted_at.is_not(None),
            Promotion.sort_order,
            Promotion.starts_at.desc(),
            Promotion.id,
        )
        return list((await self._session.scalars(query)).all())

    @staticmethod
    def _running(now: datetime) -> tuple[ColumnElement[bool], ...]:
        return (
            Promotion.deleted_at.is_(None),
            Promotion.is_enabled.is_(True),
            Promotion.starts_at <= now,
            not_ended(now),
        )

    async def list_active(self, now: datetime | None = None) -> list[Promotion]:
        """Promotions running right now, in the owner's order — the carousel and the sitemap."""
        query = (
            select(Promotion)
            .where(*self._running(now or datetime.now(UTC)))
            .order_by(Promotion.sort_order, Promotion.starts_at.desc(), Promotion.id)
        )
        return list((await self._session.scalars(query)).all())

    async def get_active(self, slug: str, now: datetime | None = None) -> Promotion:
        promotion = await self._session.scalar(
            select(Promotion).where(
                Promotion.slug == slug, *self._running(now or datetime.now(UTC))
            )
        )
        if promotion is None:
            raise PromotionNotFoundError
        return promotion

    async def get(self, promotion_id: uuid.UUID) -> Promotion:
        promotion = await self._session.get(Promotion, promotion_id)
        if promotion is None:
            raise PromotionNotFoundError
        return promotion

    async def participant_counts(self, promotion_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, int]:
        """Live participations per promotion — released ones are history, not participants."""
        if not promotion_ids:
            return {}
        rows = await self._session.execute(
            select(OrderPromotion.promotion_id, func.count())
            .where(
                OrderPromotion.promotion_id.in_(promotion_ids),
                OrderPromotion.released_at.is_(None),
            )
            .group_by(OrderPromotion.promotion_id)
        )
        return {promotion_id: count for promotion_id, count in rows.tuples() if promotion_id}

    async def create(self, draft: PromotionDraft) -> Promotion:
        await self._check(draft, current=None)
        promotion = Promotion()
        self._apply(promotion, draft)
        await self._flush_slug(promotion)
        return promotion

    async def update(self, promotion_id: uuid.UUID, draft: PromotionDraft) -> Promotion:
        promotion = await self.get(promotion_id)
        await self._check(draft, current=promotion)
        self._apply(promotion, draft)
        await self._flush_slug(promotion)
        return promotion

    async def set_enabled(self, promotion_id: uuid.UUID, is_enabled: bool) -> Promotion:
        promotion = await self.get(promotion_id)
        promotion.is_enabled = is_enabled
        await self._session.flush()
        return promotion

    async def delete(self, promotion_id: uuid.UUID) -> Deletion:
        """Deletes a promotion nobody took part in; archives one somebody did.

        Somebody is any order that ever held it — released participations included — or
        any code it issued: those rows point at the promotion and are the record of it.
        """
        promotion = await self.get(promotion_id)
        if promotion.deleted_at is not None:
            return Deletion(deleted=False, orphaned_urls=[])
        if not await self._has_history(promotion_id):
            urls = [
                url
                for url in (promotion.banner_mobile_url, promotion.banner_desktop_url)
                if url is not None
            ]
            try:
                async with self._session.begin_nested():
                    await self._session.delete(promotion)
                    await self._session.flush()
            except IntegrityError as error:
                # A checkout joined it after the check above: archive it after all.
                if getattr(error.orig, "sqlstate", None) != _FOREIGN_KEY_VIOLATION:
                    raise
                promotion = await self.get(promotion_id)
            else:
                return Deletion(deleted=True, orphaned_urls=urls)
        promotion.deleted_at = datetime.now(UTC)
        await self._session.flush()
        return Deletion(deleted=False, orphaned_urls=[])

    async def set_banner(
        self, promotion_id: uuid.UUID, variant: BannerVariant, url: str
    ) -> tuple[Promotion, str | None]:
        """Puts a banner up; returns the promotion and the address of the one it replaced."""
        promotion = await self.get(promotion_id)
        previous = self._banner(promotion, variant)
        self._set_banner_url(promotion, variant, url)
        await self._session.flush()
        return promotion, previous

    async def remove_banner(
        self, promotion_id: uuid.UUID, variant: BannerVariant
    ) -> tuple[Promotion, str | None]:
        promotion = await self.get(promotion_id)
        previous = self._banner(promotion, variant)
        self._set_banner_url(promotion, variant, None)
        await self._session.flush()
        return promotion, previous

    async def participants(
        self, promotion_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> tuple[list[Participant], int]:
        """One page of participations, newest first, and how many there are in all.

        Paginated because nothing bounds it: "no cap on participants" means a popular
        promotion collects one row per customer, and the dialog would otherwise load
        every one of them to show the first screen.
        """
        await self.get(promotion_id)
        total = (
            await self._session.scalar(
                select(func.count())
                .select_from(OrderPromotion)
                .where(OrderPromotion.promotion_id == promotion_id)
            )
            or 0
        )
        rows = await self._session.execute(
            select(OrderPromotion, Order, User)
            .join(Order, Order.id == OrderPromotion.order_id)
            .join(User, User.id == OrderPromotion.user_id)
            .where(OrderPromotion.promotion_id == promotion_id)
            .order_by(OrderPromotion.created_at.desc(), OrderPromotion.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [
            Participant(participation=participation, order=order, user=user)
            for participation, order, user in rows.tuples()
        ], total

    # --- internals ----------------------------------------------------------------------

    async def _check(self, draft: PromotionDraft, *, current: Promotion | None) -> None:
        if draft.ends_at is not None and draft.ends_at <= draft.starts_at:
            raise PromotionEndsBeforeStartError
        if (current is None or current.slug != draft.slug) and await self._slug_taken(draft.slug):
            raise PromotionSlugTakenError
        # Only on write, like the references: a stored template whose window has since
        # passed must still load (`load_rewards` does not know the clock). On an update only
        # a window that is new or changed is refused, so an ended promotion's typo can still
        # be fixed: a window passes when the same pair of shop-timezone days is stored.
        now = datetime.now(UTC)
        stored = _stored_windows(current)
        for reward in draft.rewards:
            if (
                isinstance(reward, PromoCodeReward)
                and reward.valid_until is not None
                and reward.valid_until <= now
                and (_day(reward.valid_from), _day(reward.valid_until)) not in stored
            ):
                raise PromotionCodeWindowPastError
        await self._check_references(draft)

    async def _check_references(self, draft: PromotionDraft) -> None:
        """Every id the rules name is something the catalogue sells now.

        Only on write: a product withdrawn later quietly stops matching instead (see
        `promotions/rules.py`). A gift is checked as a variant still on sale, because a
        gift the owner cannot buy is a promise to the customer the shop cannot keep.
        """
        products, categories, variants = referenced_ids(list(draft.conditions), list(draft.rewards))
        if products:
            found = await self._session.scalar(
                select(func.count())
                .select_from(Product)
                .where(Product.id.in_(products), Product.deleted_at.is_(None))
            )
            if found != len(products):
                raise PromotionInvalidRulesError
        if categories:
            found = await self._session.scalar(
                select(func.count()).select_from(Category).where(Category.id.in_(categories))
            )
            if found != len(categories):
                raise PromotionInvalidRulesError
        if variants:
            found = await self._session.scalar(
                select(func.count())
                .select_from(ProductVariant)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(
                    ProductVariant.id.in_(variants),
                    ProductVariant.deleted_at.is_(None),
                    Product.deleted_at.is_(None),
                )
            )
            if found != len(variants):
                raise PromotionInvalidRulesError

    async def _slug_taken(self, slug: str) -> bool:
        # Archived promotions keep their slug: an old link must not start pointing at a
        # different offer.
        return bool(await self._session.scalar(select(exists().where(Promotion.slug == slug))))

    async def _flush_slug(self, promotion: Promotion) -> None:
        """Flushes, turning a lost race for the slug into the same error the check gives."""
        try:
            async with self._session.begin_nested():
                self._session.add(promotion)
                await self._session.flush()
        except IntegrityError as error:
            if getattr(error.orig, "sqlstate", None) != UNIQUE_VIOLATION:
                raise
            raise PromotionSlugTakenError from error

    async def _has_history(self, promotion_id: uuid.UUID) -> bool:
        joined = await self._session.scalar(
            select(exists().where(OrderPromotion.promotion_id == promotion_id))
        )
        issued = await self._session.scalar(
            select(exists().where(PromoCode.promotion_id == promotion_id))
        )
        return bool(joined or issued)

    @staticmethod
    def _apply(promotion: Promotion, draft: PromotionDraft) -> None:
        promotion.slug = draft.slug
        promotion.title = draft.title
        promotion.description_html = description_from_html(draft.description_html).html
        promotion.starts_at = draft.starts_at
        promotion.ends_at = draft.ends_at
        promotion.is_enabled = draft.is_enabled
        promotion.announce = draft.announce
        promotion.sort_order = draft.sort_order
        promotion.conditions = dump_conditions(list(draft.conditions))
        promotion.rewards = dump_rewards(list(draft.rewards))

    @staticmethod
    def _banner(promotion: Promotion, variant: BannerVariant) -> str | None:
        if variant is BannerVariant.MOBILE:
            return promotion.banner_mobile_url
        return promotion.banner_desktop_url

    @staticmethod
    def _set_banner_url(promotion: Promotion, variant: BannerVariant, url: str | None) -> None:
        if variant is BannerVariant.MOBILE:
            promotion.banner_mobile_url = url
        else:
            promotion.banner_desktop_url = url
