"""The names behind a promotion's targets, for telling a customer what it is about.

Conditions and rewards store only ids, so "от 2000 сом на выбранные товары" is all a text
can say without a lookup. The bot's messages and the public promotion page name the
products and categories instead; this module collects the ids a set of rules refers to
(the nested promo code template included) and reads their names in two queries.

A product that has been soft-deleted, or a category that is gone, is simply missing from
the result: it no longer matches anything (see `engine.line_matches`), so it is not worth
naming either.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product
from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    AnyReward,
    DiscountReward,
    PromoCodeReward,
    Target,
)


@dataclass(frozen=True)
class NamedRef:
    id: uuid.UUID
    name: str
    slug: str


@dataclass(frozen=True)
class RuleNames:
    products: dict[uuid.UUID, NamedRef] = field(default_factory=dict)
    categories: dict[uuid.UUID, NamedRef] = field(default_factory=dict)


def _targets(
    conditions: Sequence[AnyCondition],
    rewards: Sequence[AnyReward] | Sequence[AnyCodeReward],
) -> list[Target]:
    found = [condition.target for condition in conditions if condition.target is not None]
    for reward in rewards:
        if isinstance(reward, DiscountReward) and reward.target is not None:
            found.append(reward.target)
        elif isinstance(reward, PromoCodeReward):
            found.extend(_targets(reward.conditions, reward.rewards))
    return found


async def load_rule_names(
    session: AsyncSession,
    conditions: Sequence[AnyCondition],
    rewards: Sequence[AnyReward] | Sequence[AnyCodeReward],
) -> RuleNames:
    """The live products and existing categories the rules name, by id."""
    targets = _targets(conditions, rewards)
    product_ids = {product_id for target in targets for product_id in target.product_ids}
    category_ids = {category_id for target in targets for category_id in target.category_ids}
    products: dict[uuid.UUID, NamedRef] = {}
    categories: dict[uuid.UUID, NamedRef] = {}
    if product_ids:
        rows = await session.execute(
            select(Product.id, Product.name, Product.slug).where(
                Product.id.in_(product_ids), Product.deleted_at.is_(None)
            )
        )
        products = {row.id: NamedRef(row.id, row.name, row.slug) for row in rows}
    if category_ids:
        rows = await session.execute(
            select(Category.id, Category.name, Category.slug).where(Category.id.in_(category_ids))
        )
        categories = {row.id: NamedRef(row.id, row.name, row.slug) for row in rows}
    return RuleNames(products=products, categories=categories)
