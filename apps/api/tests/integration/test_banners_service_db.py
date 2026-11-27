import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banners.models import BannerKind, BannerState, NewsBanner, PromotionBannerSetting
from app.banners.service import (
    BannerEndsBeforeStartError,
    BannerLinkInvalidError,
    BannerNotFoundError,
    BannerOrderMismatchError,
    BannersService,
    NewsDraft,
    TooManyNewsBannersError,
)
from app.common.limits import MAX_NEWS_BANNERS
from app.promotions.models import Promotion
from app.promotions.service import BannerVariant, PromotionNotFoundError, PromotionsService

NOW = datetime.now(UTC)
BANNER = "http://files/banner.webp"


async def _promotion(
    session: AsyncSession,
    slug: str,
    *,
    banner: str | None = BANNER,
    enabled: bool = True,
    starts_at: datetime = NOW - timedelta(days=1),
    ends_at: datetime | None = NOW + timedelta(days=1),
    deleted: bool = False,
    code: str | None = None,
    sort_order: int = 0,
    created_at: datetime | None = None,
) -> Promotion:
    promotion = Promotion(
        slug=slug,
        title=f"Акция {slug}",
        banner_mobile_url=banner,
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=enabled,
        deleted_at=NOW if deleted else None,
        code=code,
        sort_order=sort_order,
        rewards=[{"type": "GIFT", "gift": "CUSTOM", "title": "Подарок", "quantity": 1}],
    )
    if created_at is not None:
        promotion.created_at = created_at
    session.add(promotion)
    await session.flush()
    return promotion


def _draft(
    title: str = "Новость",
    *,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    is_enabled: bool = True,
    link_url: str | None = None,
) -> NewsDraft:
    return NewsDraft(
        title=title,
        text=None,
        link_url=link_url,
        cta_label=None,
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=is_enabled,
    )


async def _feed_keys(session: AsyncSession) -> list[str]:
    return [item.key for item in await BannersService(session).feed()]


async def test_a_running_promotion_with_a_banner_is_in_the_feed(db_session: AsyncSession) -> None:
    promotion = await _promotion(db_session, "running")
    assert await _feed_keys(db_session) == [f"promotion:{promotion.id}"]


async def test_promotions_that_do_not_belong_in_the_carousel(db_session: AsyncSession) -> None:
    await _promotion(db_session, "no-banner", banner=None)
    await _promotion(db_session, "off", enabled=False)
    await _promotion(db_session, "later", starts_at=NOW + timedelta(hours=1), ends_at=None)
    await _promotion(
        db_session, "over", ends_at=NOW - timedelta(hours=1), starts_at=NOW - timedelta(days=2)
    )
    await _promotion(db_session, "archived", deleted=True)
    await _promotion(db_session, "owner-code", code="LETO2026")
    assert await _feed_keys(db_session) == []


async def test_hiding_a_slide_does_not_stop_the_discount(db_session: AsyncSession) -> None:
    promotion = await _promotion(db_session, "running")
    item = await BannersService(db_session).set_promotion_shown(promotion.id, False)

    assert item.state is BannerState.HIDDEN and not item.is_shown
    assert await _feed_keys(db_session) == []
    active = await PromotionsService(db_session).list_active()
    assert [row.id for row in active] == [promotion.id]


async def test_a_promotion_without_a_settings_row_is_listed_and_shown(
    db_session: AsyncSession,
) -> None:
    promotion = await _promotion(db_session, "from-an-older-release")
    service = BannersService(db_session)

    [item] = await service.admin_items()
    assert item.state is BannerState.SHOWN and item.is_shown and item.position is None

    await service.set_promotion_shown(promotion.id, False)
    assert await db_session.get(PromotionBannerSetting, promotion.id) is not None
    again = await service.set_promotion_shown(promotion.id, True)
    assert again.is_shown
    rows = (await db_session.scalars(select(PromotionBannerSetting))).all()
    assert len(rows) == 1


async def test_a_promotion_switched_off_and_on_keeps_its_place_and_choice(
    db_session: AsyncSession,
) -> None:
    first = await _promotion(db_session, "first")
    second = await _promotion(db_session, "second")
    service = BannersService(db_session)
    await service.reorder([f"promotion:{second.id}", f"promotion:{first.id}"])
    await service.set_promotion_shown(second.id, False)

    await PromotionsService(db_session).set_enabled(second.id, False)
    off = await service.promotion_item(second.id)
    assert off.state is BannerState.PROMOTION_OFF and not off.is_shown and off.position == 0

    await PromotionsService(db_session).set_enabled(second.id, True)
    on = await service.promotion_item(second.id)
    assert on.state is BannerState.HIDDEN and on.position == 0


async def test_states_of_promotions(db_session: AsyncSession) -> None:
    await _promotion(db_session, "shown")
    await _promotion(db_session, "no-banner", banner=None)
    await _promotion(db_session, "off", enabled=False)
    await _promotion(db_session, "later", starts_at=NOW + timedelta(hours=1), ends_at=None)
    await _promotion(
        db_session, "over", starts_at=NOW - timedelta(days=2), ends_at=NOW - timedelta(hours=1)
    )
    await _promotion(db_session, "archived", deleted=True)
    await _promotion(db_session, "owner-code", code="LETO2026")

    states = {
        item.promotion.slug: item.state
        for item in await BannersService(db_session).admin_items()
        if item.promotion is not None
    }
    assert states == {
        "shown": BannerState.SHOWN,
        "no-banner": BannerState.NO_IMAGE,
        "off": BannerState.PROMOTION_OFF,
        "later": BannerState.SCHEDULED,
        "over": BannerState.FINISHED,
    }


async def test_the_feed_is_exactly_the_shown_items(db_session: AsyncSession) -> None:
    await _promotion(db_session, "a")
    hidden = await _promotion(db_session, "b")
    await _promotion(db_session, "c", banner=None)
    service = BannersService(db_session)
    await service.set_promotion_shown(hidden.id, False)
    await service.create_news(_draft("Есть"))
    await service.create_news(_draft("Нет", is_enabled=False))

    shown = [item.key for item in await service.admin_items() if item.state is BannerState.SHOWN]
    assert await _feed_keys(db_session) == shown


async def test_news_window(db_session: AsyncSession) -> None:
    service = BannersService(db_session)
    await service.create_news(_draft("future", starts_at=NOW + timedelta(hours=1)))
    inside = await service.create_news(
        _draft("inside", starts_at=NOW - timedelta(hours=1), ends_at=NOW + timedelta(hours=1))
    )
    await service.create_news(_draft("over", ends_at=NOW - timedelta(minutes=1)))
    exactly = NOW + timedelta(minutes=5)
    ending = await service.create_news(_draft("ending", ends_at=exactly))

    assert {item.key for item in await service.feed(NOW)} == {
        f"news:{inside.id}",
        f"news:{ending.id}",
    }
    # `ends_at` itself is already over: the window is [starts_at, ends_at).
    assert {item.key for item in await service.feed(exactly)} == {f"news:{inside.id}"}
    states = {item.news.title: item.state for item in await service.admin_items(NOW) if item.news}
    assert states["future"] is BannerState.SCHEDULED
    assert states["over"] is BannerState.FINISHED
    assert states["inside"] is BannerState.SHOWN


async def test_a_disabled_news_item_is_hidden(db_session: AsyncSession) -> None:
    service = BannersService(db_session)
    news = await service.create_news(_draft())
    await service.set_news_enabled(news.id, False)
    item = await service.news_item(news.id)
    assert item.state is BannerState.HIDDEN and not item.is_shown
    assert await _feed_keys(db_session) == []


async def test_new_items_come_first_then_the_placed_ones(db_session: AsyncSession) -> None:
    old = await _promotion(db_session, "old", created_at=NOW - timedelta(days=10))
    newer = await _promotion(db_session, "newer", created_at=NOW - timedelta(days=5))
    service = BannersService(db_session)
    await service.reorder([f"promotion:{old.id}", f"promotion:{newer.id}"])
    assert await _feed_keys(db_session) == [f"promotion:{old.id}", f"promotion:{newer.id}"]

    news = await service.create_news(_draft())
    fresh = await _promotion(db_session, "fresh")
    keys = await _feed_keys(db_session)
    # Both are unplaced, so they lead — the later-created one first.
    assert keys[:2] == [f"promotion:{fresh.id}", f"news:{news.id}"] or keys[:2] == [
        f"news:{news.id}",
        f"promotion:{fresh.id}",
    ]
    assert keys[2:] == [f"promotion:{old.id}", f"promotion:{newer.id}"]


async def test_unplaced_items_are_newest_first(db_session: AsyncSession) -> None:
    older = await _promotion(db_session, "older", created_at=NOW - timedelta(days=3))
    newer = await _promotion(db_session, "newer", created_at=NOW - timedelta(days=1))
    assert await _feed_keys(db_session) == [f"promotion:{newer.id}", f"promotion:{older.id}"]


async def test_reorder_places_everything_and_leaves_sort_order_alone(
    db_session: AsyncSession,
) -> None:
    first = await _promotion(db_session, "first", sort_order=1)
    second = await _promotion(db_session, "second", sort_order=2)
    news = await BannersService(db_session).create_news(_draft())
    service = BannersService(db_session)

    order = [f"promotion:{second.id}", f"news:{news.id}", f"promotion:{first.id}"]
    await service.reorder(order)
    assert [item.key for item in await service.admin_items()] == order
    assert await _feed_keys(db_session) == order
    await db_session.refresh(first)
    await db_session.refresh(second)
    assert (first.sort_order, second.sort_order) == (1, 2)


async def test_reorder_refuses_a_stale_list(db_session: AsyncSession) -> None:
    promotion = await _promotion(db_session, "only")
    news = await BannersService(db_session).create_news(_draft())
    service = BannersService(db_session)

    with pytest.raises(BannerOrderMismatchError):
        await service.reorder([f"promotion:{promotion.id}"])  # misses one
    with pytest.raises(BannerOrderMismatchError):
        await service.reorder(
            [f"promotion:{promotion.id}", f"news:{news.id}", f"news:{uuid.uuid4()}"]
        )  # one too many
    with pytest.raises(BannerOrderMismatchError):
        await service.reorder([f"promotion:{promotion.id}", f"news:{uuid.uuid4()}"])  # a stranger


async def test_hard_deleting_a_promotion_removes_its_settings(db_session: AsyncSession) -> None:
    promotion = await _promotion(db_session, "gone")
    await BannersService(db_session).set_promotion_shown(promotion.id, False)

    deletion = await PromotionsService(db_session).delete(promotion.id)
    assert deletion.deleted
    assert await db_session.get(PromotionBannerSetting, promotion.id) is None


async def test_an_archived_promotion_leaves_the_list(db_session: AsyncSession) -> None:
    promotion = await _promotion(db_session, "archived", deleted=True)
    service = BannersService(db_session)
    assert await service.admin_items() == []
    with pytest.raises(PromotionNotFoundError):
        await service.set_promotion_shown(promotion.id, False)


async def test_an_owner_code_is_not_a_banner(db_session: AsyncSession) -> None:
    code = await _promotion(db_session, "code", code="LETO2026")
    with pytest.raises(PromotionNotFoundError):
        await BannersService(db_session).set_promotion_shown(code.id, False)


async def test_deleting_news_returns_its_files(db_session: AsyncSession) -> None:
    service = BannersService(db_session)
    news = await service.create_news(_draft())
    await service.set_news_image(news.id, BannerVariant.MOBILE, "http://files/m.webp")
    await service.set_news_image(news.id, BannerVariant.DESKTOP, "http://files/d.webp")

    urls = await service.delete_news(news.id)
    assert sorted(urls) == ["http://files/d.webp", "http://files/m.webp"]
    assert await db_session.get(NewsBanner, news.id) is None
    with pytest.raises(BannerNotFoundError):
        await service.delete_news(news.id)


async def test_replacing_and_removing_a_picture_return_the_previous(
    db_session: AsyncSession,
) -> None:
    service = BannersService(db_session)
    news = await service.create_news(_draft())
    _, previous = await service.set_news_image(news.id, BannerVariant.MOBILE, "http://files/a.webp")
    assert previous is None
    _, previous = await service.set_news_image(news.id, BannerVariant.MOBILE, "http://files/b.webp")
    assert previous == "http://files/a.webp"
    news, previous = await service.remove_news_image(news.id, BannerVariant.MOBILE)
    assert previous == "http://files/b.webp" and news.image_mobile_url is None


async def test_the_news_limit(db_session: AsyncSession) -> None:
    service = BannersService(db_session)
    for number in range(MAX_NEWS_BANNERS):
        await service.create_news(_draft(f"n{number}", is_enabled=number % 2 == 0))
    with pytest.raises(TooManyNewsBannersError):
        await service.create_news(_draft("one too many"))


async def test_news_validation(db_session: AsyncSession) -> None:
    service = BannersService(db_session)
    with pytest.raises(BannerEndsBeforeStartError):
        await service.create_news(_draft(starts_at=NOW, ends_at=NOW))
    for link in ("http://example.com", "javascript:alert(1)", "//evil.example", "/a b"):
        with pytest.raises(BannerLinkInvalidError):
            await service.create_news(_draft(link_url=link))
    news = await service.create_news(_draft(link_url="/catalog?x=1"))
    with pytest.raises(BannerLinkInvalidError):
        await service.update_news(news.id, _draft(link_url="http://example.com"))
    updated = await service.update_news(news.id, _draft("Другое", link_url="https://example.com"))
    assert updated.title == "Другое" and updated.link_url == "https://example.com"


async def test_carousel_flags(db_session: AsyncSession) -> None:
    shown = await _promotion(db_session, "shown")
    hidden = await _promotion(db_session, "hidden")
    service = BannersService(db_session)
    await service.set_promotion_shown(hidden.id, False)
    flags = await service.carousel_flags([shown.id, hidden.id])
    assert flags == {hidden.id: False}


async def test_kinds_are_told_apart(db_session: AsyncSession) -> None:
    await _promotion(db_session, "p")
    await BannersService(db_session).create_news(_draft())
    kinds = {item.kind for item in await BannersService(db_session).admin_items()}
    assert kinds == {BannerKind.PROMOTION, BannerKind.NEWS}
