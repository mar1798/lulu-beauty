"""Adds three demo promotions, one per kind of reward (development only).

- a discount: «скидка 10% от 3000 сом»;
- a gift: «Mystery box за 3 средства по уходу за лицом»;
- a promo code: «300 сом на следующую заявку» after paying for one from 2000 сом.

They run from the start of today (shop timezone) for 30 days and are never announced.
Idempotent by slug: a promotion that already exists is left untouched. Goes through
`PromotionsService.create`, so the rules are checked exactly like the admin form's.

Run with: uv run python -m app.scripts.seed_promotions
"""

import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.catalog.models import Category
from app.config import settings
from app.db import async_session
from app.orders.models import DiscountKind
from app.promotions.models import Promotion
from app.promotions.rules import (
    AnyCondition,
    AnyReward,
    ConditionType,
    DiscountReward,
    GiftKind,
    GiftReward,
    PromoCodeReward,
    QuantityCondition,
    RewardType,
    SubtotalCondition,
    Target,
)
from app.promotions.service import PromotionDraft, PromotionsService

DURATION_DAYS = 30
# The «Уход за лицом» section (its subcategories count too). Without it the gift
# promotion counts any three units.
SKIN_CARE_SLUG = "uhod-za-kozhey"


def _drafts(starts_at: datetime, skin_care: Category | None) -> list[PromotionDraft]:
    ends_at = starts_at + timedelta(days=DURATION_DAYS)
    skin_target = Target(category_ids=[skin_care.id]) if skin_care is not None else None

    def draft(
        slug: str,
        title: str,
        description: str,
        sort_order: int,
        conditions: list[AnyCondition],
        rewards: list[AnyReward],
    ) -> PromotionDraft:
        return PromotionDraft(
            slug=slug,
            title=title,
            description_html=f"<p>{description}</p>",
            starts_at=starts_at,
            ends_at=ends_at,
            is_enabled=True,
            announce=False,
            sort_order=sort_order,
            conditions=conditions,
            rewards=rewards,
        )

    return [
        draft(
            "skidka-10-ot-3000",
            "Скидка 10% от 3000 сом",
            "Соберите заявку от 3000 сом - скидка 10% на всю заявку.",
            0,
            [SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=300_000)],
            [DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=10)],
        ),
        draft(
            "mystery-box-ukhod-za-litsom",
            "Mystery box за уход за лицом",
            "Три средства по уходу за лицом в заявке - Mystery box в подарок.",
            1,
            [QuantityCondition(type=ConditionType.QUANTITY, min_quantity=3, target=skin_target)],
            [GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, quantity=1)],
        ),
        draft(
            "promokod-na-sleduyushchuyu-zayavku",
            "300 сом на следующую заявку",
            "Оплатите заявку от 2000 сом - получите промокод на 300 сом. "
            "Он действует 30 дней на заявку от 1500 сом.",
            2,
            [SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=200_000)],
            [
                PromoCodeReward(
                    type=RewardType.PROMO_CODE,
                    valid_days=30,
                    conditions=[SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=150_000)],
                    rewards=[
                        DiscountReward(
                            type=RewardType.DISCOUNT, kind=DiscountKind.AMOUNT, value=30_000
                        )
                    ],
                )
            ],
        ),
    ]


async def seed_promotions() -> None:
    tz = ZoneInfo(settings.cycle_timezone)
    starts_at = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)

    async with async_session() as session:
        skin_care = await session.scalar(select(Category).where(Category.slug == SKIN_CARE_SLUG))
        taken = set(await session.scalars(select(Promotion.slug)))

        service = PromotionsService(session)
        created = 0
        for promotion in _drafts(starts_at, skin_care):
            if promotion.slug in taken:
                continue
            await service.create(promotion)
            created += 1

        await session.commit()

    print(f"Создано акций: {created}")


def main() -> None:
    asyncio.run(seed_promotions())


if __name__ == "__main__":
    main()
