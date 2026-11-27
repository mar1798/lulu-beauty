"""A promotion's conditions and rewards: typed lists stored as JSONB.

The admin builds a promotion out of rows — "покупка от 2000 сом", "подарок Mystery box" —
and each row is one of a handful of shapes. They are pydantic discriminated unions on
`type`, checked on the way in (the admin's request) and again on the way out (a row read
from `promotions.conditions` / `.rewards`), so the engine never meets a shape it does not
know. Stored snake_case (`dump_*`), sent camelCase (the `CamelModel` aliases).

A reference to something the catalogue no longer has — a deleted product, a dropped
category — is not an error on read: the target simply matches nothing any more. Only a
write checks that the ids exist (`PromotionsService`), because only then is there an admin
to tell.
"""

import enum
import uuid
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal, Self

from pydantic import (
    AwareDatetime,
    Field,
    TypeAdapter,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.common.limits import (
    MAX_GIFT_QUANTITY,
    MAX_PRICE_CENTS,
    MAX_PROMO_CODE_VALID_DAYS,
    MAX_PROMOTION_CONDITIONS,
    MAX_PROMOTION_REWARDS,
    MAX_PROMOTION_TARGET_ENTRIES,
)
from app.common.schemas import CamelModel
from app.config import settings
from app.orders.models import MAX_DISCOUNT_PERCENT, DiscountKind

# What a custom gift is called when the admin leaves the name as it comes: the box the
# customer opens to find out.
DEFAULT_GIFT_TITLE = "Mystery box"


def normalize_brand(brand: str) -> str:
    """Brands are compared the way `/brands` collapses them: by case, without edge spaces."""
    return brand.strip().casefold()


class Target(CamelModel):
    """Which cart lines a condition or a discount is about.

    A line matches when it fits **any** of the three lists — the product itself, its
    category (or the section above it), or its brand. All three empty is the whole cart.
    """

    product_ids: list[uuid.UUID] = Field(
        default_factory=list, max_length=MAX_PROMOTION_TARGET_ENTRIES
    )
    category_ids: list[uuid.UUID] = Field(
        default_factory=list, max_length=MAX_PROMOTION_TARGET_ENTRIES
    )
    brands: list[Annotated[str, Field(min_length=1, max_length=255)]] = Field(
        default_factory=list, max_length=MAX_PROMOTION_TARGET_ENTRIES
    )

    @field_validator("product_ids", "category_ids")
    @classmethod
    def _dedupe_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        return list(dict.fromkeys(value))

    @field_validator("brands")
    @classmethod
    def _dedupe_brands(cls, value: list[str]) -> list[str]:
        seen: dict[str, str] = {}
        for brand in value:
            stripped = brand.strip()
            if stripped:
                seen.setdefault(normalize_brand(stripped), stripped)
        return list(seen.values())

    @property
    def is_empty(self) -> bool:
        return not (self.product_ids or self.category_ids or self.brands)


# --- Conditions -------------------------------------------------------------------------


class ConditionType(enum.StrEnum):
    SUBTOTAL = "SUBTOTAL"
    QUANTITY = "QUANTITY"
    CONTAINS = "CONTAINS"


class ContainsMode(enum.StrEnum):
    # At least one line fits the target.
    ANY = "ANY"
    # Every entry of the target — each product, each category, each brand — has a line.
    ALL = "ALL"


class SubtotalCondition(CamelModel):
    """«Покупка от N сом»: price × quantity of the matching lines, before any discount."""

    type: Literal[ConditionType.SUBTOTAL]
    min_cents: int = Field(gt=0, le=MAX_PRICE_CENTS)
    target: Target | None = None


class QuantityCondition(CamelModel):
    """«От N товаров»: units of the matching lines, not lines."""

    type: Literal[ConditionType.QUANTITY]
    min_quantity: int = Field(gt=0, le=10_000)
    target: Target | None = None


class ContainsCondition(CamelModel):
    """«Покупка конкретных товаров» — the cart holds them, in any quantity."""

    type: Literal[ConditionType.CONTAINS]
    target: Target
    mode: ContainsMode = ContainsMode.ANY

    @model_validator(mode="after")
    def _target_not_empty(self) -> Self:
        if self.target.is_empty:
            raise ValueError("условие «содержит» должно назвать товары, категории или бренды")
        return self


Condition = Annotated[
    SubtotalCondition | QuantityCondition | ContainsCondition, Field(discriminator="type")
]


# --- Rewards ----------------------------------------------------------------------------


class RewardType(enum.StrEnum):
    DISCOUNT = "DISCOUNT"
    GIFT = "GIFT"
    PROMO_CODE = "PROMO_CODE"


class GiftKind(enum.StrEnum):
    # A name and a picture, contents undisclosed — "Mystery box" by default.
    CUSTOM = "CUSTOM"
    # A volume from the catalogue, free.
    PRODUCT = "PRODUCT"


class DiscountReward(CamelModel):
    """Money off: the whole cart without a target, the matching lines with one."""

    type: Literal[RewardType.DISCOUNT]
    kind: DiscountKind
    value: int = Field(gt=0, le=MAX_PRICE_CENTS)
    target: Target | None = None

    @model_validator(mode="after")
    def _percent_in_range(self) -> Self:
        if self.kind is DiscountKind.PERCENT and self.value > MAX_DISCOUNT_PERCENT:
            raise ValueError(f"скидка в процентах - от 1 до {MAX_DISCOUNT_PERCENT}")
        return self

    @property
    def is_on_items(self) -> bool:
        return self.target is not None and not self.target.is_empty


class GiftReward(CamelModel):
    type: Literal[RewardType.GIFT]
    gift: GiftKind
    title: str = Field(default=DEFAULT_GIFT_TITLE, min_length=1, max_length=255)
    # Only an address this API's storage gave out: the site renders it as an image, and a
    # free-form URL would be an arbitrary third-party host the CSP does not allow anyway.
    image_url: str | None = Field(default=None, max_length=2048)
    variant_id: uuid.UUID | None = None
    quantity: int = Field(default=1, gt=0, le=MAX_GIFT_QUANTITY)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("у подарка должно быть название")
        return stripped

    @field_validator("image_url")
    @classmethod
    def _own_storage_only(cls, value: str | None, info: ValidationInfo) -> str | None:
        # A write-time rule only. Stored rules and snapshots are read with the `trusted`
        # context (`load_*`): the base URL may change after a gift was saved, and stored
        # data must stay readable then.
        if value is None or (info.context or {}).get("trusted"):
            return value
        if not value.startswith(f"{settings.public_files_base_url.rstrip('/')}/"):
            raise ValueError("картинка подарка должна быть загружена в магазин")
        return value

    @model_validator(mode="after")
    def _variant_matches_kind(self) -> Self:
        if self.gift is GiftKind.PRODUCT and self.variant_id is None:
            raise ValueError("подарок-товар должен указать вариант")
        if self.gift is GiftKind.CUSTOM and self.variant_id is not None:
            raise ValueError("свободный подарок не ссылается на товар")
        return self


# What a promo code may give: a code that hands out another code would be a chain with
# no end, so the template's rewards stop at money and gifts.
CodeReward = Annotated[DiscountReward | GiftReward, Field(discriminator="type")]


class PromoCodeReward(CamelModel):
    """A personal one-off code, issued once the order that earned it is paid for.

    Valid either for `valid_days` from the moment it is issued, or between two fixed dates.
    It carries its own conditions and rewards, copied into the code when it is issued, so
    editing the promotion later does not change codes already handed out.
    """

    type: Literal[RewardType.PROMO_CODE]
    valid_days: int | None = Field(default=None, gt=0, le=MAX_PROMO_CODE_VALID_DAYS)
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    conditions: list[Condition] = Field(default_factory=list, max_length=MAX_PROMOTION_CONDITIONS)
    rewards: list[CodeReward] = Field(min_length=1, max_length=MAX_PROMOTION_REWARDS)

    @model_validator(mode="after")
    def _one_validity(self) -> Self:
        fixed = self.valid_from is not None or self.valid_until is not None
        if self.valid_days is not None and fixed:
            raise ValueError("срок промокода - либо дни, либо даты, не оба сразу")
        if self.valid_days is None:
            if self.valid_from is None or self.valid_until is None:
                raise ValueError("у промокода должен быть срок: дни или обе даты")
            if self.valid_until <= self.valid_from:
                raise ValueError("промокод должен заканчиваться позже, чем начинается")
        return self


Reward = Annotated[DiscountReward | GiftReward | PromoCodeReward, Field(discriminator="type")]


class PromotionRules(CamelModel):
    """A promotion's two lists together, with the checks that span them."""

    conditions: list[Condition] = Field(default_factory=list, max_length=MAX_PROMOTION_CONDITIONS)
    rewards: list[Reward] = Field(min_length=1, max_length=MAX_PROMOTION_REWARDS)

    @model_validator(mode="after")
    def _one_code_per_promotion(self) -> Self:
        # A customer holds at most one code per promotion (`promo_codes` is unique on it),
        # so a second PROMO_CODE row could never be issued.
        codes = sum(1 for reward in self.rewards if reward.type is RewardType.PROMO_CODE)
        if codes > 1:
            raise ValueError("в акции может быть только один промокод")
        return self


_conditions_adapter: TypeAdapter[list[Condition]] = TypeAdapter(list[Condition])
_rewards_adapter: TypeAdapter[list[Reward]] = TypeAdapter(list[Reward])
_code_rewards_adapter: TypeAdapter[list[CodeReward]] = TypeAdapter(list[CodeReward])

# Validation context for reading what is already stored: skips the write-time-only checks.
# Responses with rewards: build from load_* instances, not raw dicts (no trusted context there).
_TRUSTED = {"trusted": True}

AnyCondition = SubtotalCondition | QuantityCondition | ContainsCondition
AnyReward = DiscountReward | GiftReward | PromoCodeReward
AnyCodeReward = DiscountReward | GiftReward


def load_conditions(raw: Any) -> list[AnyCondition]:
    return _conditions_adapter.validate_python(raw or [], context=_TRUSTED)


def load_rewards(raw: Any) -> list[AnyReward]:
    return _rewards_adapter.validate_python(raw or [], context=_TRUSTED)


def load_code_rewards(raw: Any) -> list[AnyCodeReward]:
    return _code_rewards_adapter.validate_python(raw or [], context=_TRUSTED)


def dump_conditions(conditions: list[AnyCondition]) -> list[dict[str, Any]]:
    return [condition.model_dump(mode="json") for condition in conditions]


def dump_rewards(rewards: list[AnyReward] | list[AnyCodeReward]) -> list[dict[str, Any]]:
    return [reward.model_dump(mode="json") for reward in rewards]


def referenced_ids(
    conditions: list[AnyCondition], rewards: list[AnyReward]
) -> tuple[set[uuid.UUID], set[uuid.UUID], set[uuid.UUID]]:
    """Every product, category and variant the rules name, nested promo codes included."""
    products: set[uuid.UUID] = set()
    categories: set[uuid.UUID] = set()
    variants: set[uuid.UUID] = set()

    def visit_target(target: Target | None) -> None:
        if target is not None:
            products.update(target.product_ids)
            categories.update(target.category_ids)

    def visit(cs: list[AnyCondition], rs: list[AnyReward] | list[AnyCodeReward]) -> None:
        for condition in cs:
            visit_target(condition.target)
        for reward in rs:
            if isinstance(reward, DiscountReward):
                visit_target(reward.target)
            elif isinstance(reward, GiftReward):
                if reward.variant_id is not None:
                    variants.add(reward.variant_id)
            else:
                visit(list(reward.conditions), list(reward.rewards))

    visit(conditions, rewards)
    return products, categories, variants


def promo_code_expiry(reward: PromoCodeReward, issued_at: datetime) -> tuple[datetime, datetime]:
    """When a code issued at `issued_at` from this template starts and stops being valid."""
    if reward.valid_days is not None:
        return issued_at, issued_at + timedelta(days=reward.valid_days)
    assert reward.valid_from is not None and reward.valid_until is not None
    return reward.valid_from, reward.valid_until
