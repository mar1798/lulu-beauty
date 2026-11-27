"""The names behind a promotion's targets: live products and existing categories only."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.orders.models import DiscountKind
from app.promotions.names import load_rule_names
from app.promotions.rules import (
    ConditionType,
    DiscountReward,
    PromoCodeReward,
    RewardType,
    SubtotalCondition,
    Target,
)
from tests.integration.factories import make_category, make_product


async def test_names_cover_the_nested_code_and_skip_a_deleted_product(
    db_session: AsyncSession,
) -> None:
    toner = await make_product(db_session, name="Тоник")
    gone = await make_product(db_session, name="Снят", deleted_at=datetime.now(UTC))
    serum = await make_product(db_session, name="Сыворотка")
    skincare = await make_category(db_session, name="Уход")

    conditions = [
        SubtotalCondition(
            type=ConditionType.SUBTOTAL,
            min_cents=100_000,
            target=Target(product_ids=[toner.id, gone.id], category_ids=[skincare.id]),
        )
    ]
    code = PromoCodeReward(
        type=RewardType.PROMO_CODE,
        valid_days=30,
        rewards=[
            DiscountReward(
                type=RewardType.DISCOUNT,
                kind=DiscountKind.PERCENT,
                value=10,
                target=Target(product_ids=[serum.id]),
            )
        ],
    )

    names = await load_rule_names(db_session, conditions, [code])

    assert {ref.name for ref in names.products.values()} == {"Тоник", "Сыворотка"}
    assert [ref.name for ref in names.categories.values()] == ["Уход"]
