import uuid
from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.orders.models import Order
from app.promotions.models import OrderPromotion, Promotion, PromotionStatus, promotion_status
from app.promotions.rules import (
    AnyCondition,
    AnyReward,
    ConditionType,
    ContainsCondition,
    GiftKind,
    GiftReward,
    PromoCodeReward,
    RewardType,
    Target,
    dump_rewards,
    load_rewards,
)
from app.promotions.service import (
    BannerVariant,
    PromotionCodeWindowPastError,
    PromotionDraft,
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
    PromotionNotFoundError,
    PromotionSlugTakenError,
    PromotionsService,
)
from tests.integration.factories import (
    make_category,
    make_cycle,
    make_product,
    make_user,
    variant_id,
)

NOW = datetime.now(UTC)
MYSTERY = GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM)


def _draft(
    *,
    slug: str = "black-friday",
    conditions: Sequence[AnyCondition] = (),
    rewards: Sequence[AnyReward] = (MYSTERY,),
    starts_at: datetime = NOW - timedelta(days=1),
    ends_at: datetime | None = NOW + timedelta(days=1),
    description_html: str | None = None,
) -> PromotionDraft:
    return PromotionDraft(
        slug=slug,
        title="Чёрная пятница",
        description_html=description_html,
        starts_at=starts_at,
        ends_at=ends_at,
        is_enabled=True,
        announce=False,
        sort_order=0,
        conditions=list(conditions),
        rewards=list(rewards),
    )


async def _join(session: AsyncSession, promotion: Promotion) -> OrderPromotion:
    """An order taking part — what checkout will do from stage two on."""
    user = await make_user(session)
    cycle = await make_cycle(session)
    order = Order(user_id=user.id, cycle_id=cycle.id, total_cents=0)
    session.add(order)
    await session.flush()
    participation = OrderPromotion(
        order_id=order.id,
        user_id=user.id,
        promotion_id=promotion.id,
        title=promotion.title,
        rewards=promotion.rewards,
    )
    session.add(participation)
    await session.flush()
    return participation


async def test_create_stores_rules_and_cleans_the_description(db_session: AsyncSession) -> None:
    product = await make_product(db_session)
    draft = _draft(
        conditions=[
            ContainsCondition(type=ConditionType.CONTAINS, target=Target(product_ids=[product.id]))
        ],
        description_html="<p>Подарок<script>alert(1)</script></p>",
    )
    promotion = await PromotionsService(db_session).create(draft)
    await db_session.commit()

    stored = await db_session.get(Promotion, promotion.id)
    assert stored is not None
    assert stored.conditions[0]["target"]["product_ids"] == [str(product.id)]
    assert stored.rewards[0]["title"] == "Mystery box"
    assert stored.description_html is not None and "script" not in stored.description_html


async def test_slug_is_unique_even_against_the_archive(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    await _join(db_session, promotion)
    await service.delete(promotion.id)  # archived, it has a participant

    with pytest.raises(PromotionSlugTakenError):
        await service.create(_draft())


async def test_an_update_may_keep_its_own_slug(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    other = await service.create(_draft(slug="other"))

    await service.update(promotion.id, _draft())
    with pytest.raises(PromotionSlugTakenError):
        await service.update(other.id, _draft())


async def test_window_must_end_after_it_starts(db_session: AsyncSession) -> None:
    with pytest.raises(PromotionEndsBeforeStartError):
        await PromotionsService(db_session).create(_draft(ends_at=NOW - timedelta(days=1)))


def _code_window(valid_from: datetime, valid_until: datetime) -> PromoCodeReward:
    return PromoCodeReward(
        type=RewardType.PROMO_CODE,
        valid_from=valid_from,
        valid_until=valid_until,
        rewards=[MYSTERY],
    )


async def test_a_code_template_whose_window_has_ended_is_refused(
    db_session: AsyncSession,
) -> None:
    past = _code_window(NOW - timedelta(days=10), NOW - timedelta(days=1))
    future = _code_window(NOW - timedelta(days=1), NOW + timedelta(days=5))
    service = PromotionsService(db_session)

    with pytest.raises(PromotionCodeWindowPastError):
        await service.create(_draft(rewards=[past]))
    with pytest.raises(PromotionCodeWindowPastError):
        await service.create(_draft(rewards=[MYSTERY, past]))

    promotion = await service.create(_draft(rewards=[future]))
    with pytest.raises(PromotionCodeWindowPastError):
        await service.update(promotion.id, _draft(rewards=[past]))
    # Days, or a window that is still open, are fine on update too.
    await service.update(promotion.id, _draft(rewards=[future]))


async def test_an_unchanged_past_window_does_not_block_an_update(
    db_session: AsyncSession,
) -> None:
    service = PromotionsService(db_session)
    past = _code_window(NOW - timedelta(days=10), NOW - timedelta(days=1))
    promotion = await service.create(
        _draft(rewards=[_code_window(NOW - timedelta(days=1), NOW + timedelta(days=1))])
    )
    await db_session.execute(
        Promotion.__table__.update()  # type: ignore[attr-defined]
        .where(Promotion.id == promotion.id)
        .values(rewards=dump_rewards([past]))
    )
    await db_session.flush()
    await db_session.refresh(promotion)

    # The same window, another title: saved.
    updated = await service.update(
        promotion.id, replace(_draft(rewards=[past]), title="Исправлено")
    )
    assert updated.title == "Исправлено"
    # A different past window is a change, and refused.
    other = _code_window(NOW - timedelta(days=20), NOW - timedelta(days=2))
    with pytest.raises(PromotionCodeWindowPastError):
        await service.update(promotion.id, _draft(rewards=[other]))


async def test_a_stored_window_with_other_times_counts_as_unchanged_by_day(
    db_session: AsyncSession,
) -> None:
    """The dialog writes 00:00 / 23:59 in the shop's timezone; a window stored with other
    times, on the same days, is not a change when the form sends it back."""
    service = PromotionsService(db_session)
    bishkek = ZoneInfo("Asia/Bishkek")
    day = (NOW - timedelta(days=10)).astimezone(bishkek).replace(hour=0, minute=0, second=0)
    stored = _code_window(day.replace(hour=9, minute=30), day.replace(hour=14, minute=15))
    sent = _code_window(day, day.replace(hour=23, minute=59))
    promotion = await service.create(
        _draft(rewards=[_code_window(NOW - timedelta(days=1), NOW + timedelta(days=1))])
    )
    await db_session.execute(
        Promotion.__table__.update()  # type: ignore[attr-defined]
        .where(Promotion.id == promotion.id)
        .values(rewards=dump_rewards([stored]))
    )
    await db_session.flush()
    await db_session.refresh(promotion)

    updated = await service.update(promotion.id, replace(_draft(rewards=[sent]), title="Опечатка"))
    assert updated.title == "Опечатка"
    next_day = _code_window(day + timedelta(days=1), day + timedelta(days=1, hours=23))
    with pytest.raises(PromotionCodeWindowPastError):
        await service.update(promotion.id, _draft(rewards=[next_day]))


async def test_a_stored_past_window_still_reads(db_session: AsyncSession) -> None:
    """The check is a write-time one: a template that ran out since is read as before."""
    service = PromotionsService(db_session)
    promotion = await service.create(
        _draft(rewards=[_code_window(NOW - timedelta(days=1), NOW + timedelta(days=1))])
    )
    past = _code_window(NOW - timedelta(days=10), NOW - timedelta(days=1))
    await db_session.execute(
        Promotion.__table__.update()  # type: ignore[attr-defined]
        .where(Promotion.id == promotion.id)
        .values(rewards=dump_rewards([past]))
    )
    await db_session.flush()
    await db_session.refresh(promotion)

    stored = await service.get(promotion.id)
    [reward] = load_rewards(stored.rewards)
    assert isinstance(reward, PromoCodeReward) and reward.valid_until is not None
    assert reward.valid_until < datetime.now(UTC)
    assert [p.id for p in await service.list_all()] == [promotion.id]


async def test_rules_must_name_what_the_catalogue_sells(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    gone = await make_product(db_session, deleted_at=NOW)
    live = await make_product(db_session)
    category = await make_category(db_session)

    def contains(target: Target) -> list[AnyCondition]:
        return [ContainsCondition(type=ConditionType.CONTAINS, target=target)]

    with pytest.raises(PromotionInvalidRulesError):
        await service.create(_draft(conditions=contains(Target(product_ids=[gone.id]))))
    with pytest.raises(PromotionInvalidRulesError):
        await service.create(_draft(conditions=contains(Target(category_ids=[uuid.uuid4()]))))
    with pytest.raises(PromotionInvalidRulesError):
        await service.create(
            _draft(
                rewards=[
                    GiftReward(
                        type=RewardType.GIFT, gift=GiftKind.PRODUCT, variant_id=variant_id(gone)
                    )
                ]
            )
        )

    promotion = await service.create(
        _draft(
            conditions=contains(Target(product_ids=[live.id], category_ids=[category.id])),
            rewards=[
                GiftReward(type=RewardType.GIFT, gift=GiftKind.PRODUCT, variant_id=variant_id(live))
            ],
        )
    )
    assert promotion.id is not None


async def test_delete_without_participants_removes_the_row(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    await service.set_banner(promotion.id, BannerVariant.MOBILE, "http://files/m.webp")

    deletion = await service.delete(promotion.id)
    await db_session.commit()

    assert deletion.deleted
    assert deletion.orphaned_urls == ["http://files/m.webp"]
    assert await db_session.get(Promotion, promotion.id) is None


async def test_delete_with_participants_archives(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    participation = await _join(db_session, promotion)
    participation.released_at = NOW  # history still counts

    deletion = await service.delete(promotion.id)
    await db_session.commit()

    assert not deletion.deleted and deletion.orphaned_urls == []
    archived = await db_session.get(Promotion, promotion.id)
    assert archived is not None and archived.deleted_at is not None
    assert [p.id for p in await service.list_all()] == []
    assert [p.id for p in await service.list_all(include_deleted=True)] == [promotion.id]


async def test_banner_replacement_hands_back_the_old_address(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())

    _, first = await service.set_banner(promotion.id, BannerVariant.DESKTOP, "http://files/a.webp")
    _, second = await service.set_banner(promotion.id, BannerVariant.DESKTOP, "http://files/b.webp")
    updated, removed = await service.remove_banner(promotion.id, BannerVariant.DESKTOP)

    assert (first, second, removed) == (None, "http://files/a.webp", "http://files/b.webp")
    assert updated.banner_desktop_url is None and updated.banner_mobile_url is None


async def test_participant_counts_skip_released(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    await _join(db_session, promotion)
    released = await _join(db_session, promotion)
    released.released_at = NOW
    await db_session.flush()

    assert await service.participant_counts([promotion.id]) == {promotion.id: 1}
    participants, total = await service.participants(promotion.id)
    assert (len(participants), total) == (2, 2)


async def test_participants_are_paginated(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    promotion = await service.create(_draft())
    for _ in range(3):
        await _join(db_session, promotion)

    first, total = await service.participants(promotion.id, page=1, page_size=2)
    second, _ = await service.participants(promotion.id, page=2, page_size=2)

    assert total == 3
    assert (len(first), len(second)) == (2, 1)
    assert not {row.participation.id for row in first} & {row.participation.id for row in second}


async def test_once_per_customer_is_held_by_the_database(db_session: AsyncSession) -> None:
    promotion = await PromotionsService(db_session).create(_draft())
    first = await _join(db_session, promotion)
    cycle = await make_cycle(db_session)
    second_order = Order(user_id=first.user_id, cycle_id=cycle.id, total_cents=0)
    db_session.add(second_order)
    await db_session.flush()

    duplicate = OrderPromotion(
        order_id=second_order.id,
        user_id=first.user_id,
        promotion_id=promotion.id,
        title="x",
        rewards=[],
    )
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(duplicate)
            await db_session.flush()

    # Released, the customer may join again.
    first.released_at = NOW
    await db_session.flush()
    again = OrderPromotion(
        order_id=second_order.id,
        user_id=first.user_id,
        promotion_id=promotion.id,
        title="x",
        rewards=[],
    )
    db_session.add(again)
    await db_session.flush()
    live = await db_session.scalars(
        select(OrderPromotion).where(OrderPromotion.released_at.is_(None))
    )
    assert [row.id for row in live] == [again.id]


async def test_an_open_ended_promotion_runs_and_never_finishes(
    db_session: AsyncSession,
) -> None:
    service = PromotionsService(db_session)
    forever = await service.create(_draft(slug="forever", ends_at=None))

    assert forever.ends_at is None
    assert [p.slug for p in await service.list_active()] == ["forever"]
    far = NOW + timedelta(days=365 * 50)
    assert promotion_status(forever, far) == PromotionStatus.ACTIVE
    assert [p.slug for p in await service.list_active(far)] == ["forever"]


async def test_only_running_promotions_are_public(db_session: AsyncSession) -> None:
    service = PromotionsService(db_session)
    running = await service.create(_draft(slug="running"))
    await service.create(
        _draft(slug="later", starts_at=NOW + timedelta(days=1), ends_at=NOW + timedelta(days=2))
    )
    await service.create(
        _draft(slug="over", starts_at=NOW - timedelta(days=3), ends_at=NOW - timedelta(days=2))
    )
    off = await service.create(_draft(slug="off"))
    await service.set_enabled(off.id, False)

    assert [p.slug for p in await service.list_active()] == ["running"]
    assert (await service.get_active("running")).id == running.id
    for slug in ("later", "over", "off", "missing"):
        with pytest.raises(PromotionNotFoundError):
            await service.get_active(slug)
