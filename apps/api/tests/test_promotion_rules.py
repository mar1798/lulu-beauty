import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from app.config import settings
from app.promotions.models import Promotion, PromotionStatus, promotion_status
from app.promotions.rules import (
    DEFAULT_GIFT_TITLE,
    DiscountReward,
    GiftReward,
    PromoCodeReward,
    PromotionRules,
    Target,
    dump_conditions,
    dump_rewards,
    load_conditions,
    load_rewards,
    promo_code_expiry,
    referenced_ids,
)
from app.promotions.schemas import PromotionWriteRequest

NOW = datetime(2026, 11, 19, 12, tzinfo=UTC)


def _request(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": "black-friday",
        "title": "Чёрная пятница",
        "startsAt": NOW.isoformat(),
        "endsAt": (NOW + timedelta(days=3)).isoformat(),
        "conditions": [{"type": "SUBTOTAL", "minCents": 200_000}],
        "rewards": [{"type": "GIFT", "gift": "CUSTOM"}],
    }
    body.update(overrides)
    return body


def test_a_request_parses_camel_case_rules() -> None:
    body = PromotionWriteRequest.model_validate(_request())
    assert body.conditions[0].min_cents == 200_000  # type: ignore[union-attr]
    gift = body.rewards[0]
    assert isinstance(gift, GiftReward)
    assert gift.title == DEFAULT_GIFT_TITLE
    assert gift.quantity == 1


def test_rules_round_trip_through_storage() -> None:
    body = PromotionWriteRequest.model_validate(
        _request(
            conditions=[
                {"type": "CONTAINS", "target": {"brands": ["Anua"]}, "mode": "ALL"},
                {"type": "QUANTITY", "minQuantity": 2},
            ],
            rewards=[
                {"type": "DISCOUNT", "kind": "PERCENT", "value": 10},
                {
                    "type": "PROMO_CODE",
                    "validDays": 30,
                    "rewards": [{"type": "DISCOUNT", "kind": "AMOUNT", "value": 50_000}],
                },
            ],
        )
    )
    stored_conditions = dump_conditions(list(body.conditions))
    stored_rewards = dump_rewards(list(body.rewards))

    # Stored snake_case, so the JSONB reads the way the Python does.
    assert stored_conditions[1] == {"type": "QUANTITY", "min_quantity": 2, "target": None}
    assert load_conditions(stored_conditions) == list(body.conditions)
    assert load_rewards(stored_rewards) == list(body.rewards)


def test_unknown_type_is_refused() -> None:
    with pytest.raises(ValidationError):
        PromotionWriteRequest.model_validate(_request(conditions=[{"type": "WEEKDAY"}]))


def test_a_promotion_needs_a_reward() -> None:
    with pytest.raises(ValidationError):
        PromotionWriteRequest.model_validate(_request(rewards=[]))


def test_percent_above_a_hundred_is_refused() -> None:
    with pytest.raises(ValidationError):
        DiscountReward.model_validate({"type": "DISCOUNT", "kind": "PERCENT", "value": 101})


def test_contains_needs_a_target() -> None:
    with pytest.raises(ValidationError):
        load_conditions([{"type": "CONTAINS", "target": {}}])


def test_product_gift_needs_a_variant_and_custom_must_not_have_one() -> None:
    with pytest.raises(ValidationError):
        GiftReward.model_validate({"type": "GIFT", "gift": "PRODUCT"})
    with pytest.raises(ValidationError):
        GiftReward.model_validate(
            {"type": "GIFT", "gift": "CUSTOM", "variantId": str(uuid.uuid4())}
        )


def test_gift_image_must_come_from_the_shop_storage() -> None:
    with pytest.raises(ValidationError):
        GiftReward.model_validate(
            {"type": "GIFT", "gift": "CUSTOM", "imageUrl": "https://evil.example/x.png"}
        )
    url = f"{settings.public_files_base_url}/box.webp"
    assert (
        GiftReward.model_validate({"type": "GIFT", "gift": "CUSTOM", "imageUrl": url}).image_url
        == url
    )


def test_only_one_promo_code_per_promotion() -> None:
    code = {
        "type": "PROMO_CODE",
        "validDays": 10,
        "rewards": [{"type": "GIFT", "gift": "CUSTOM"}],
    }
    with pytest.raises(ValidationError):
        PromotionWriteRequest.model_validate(_request(rewards=[code, code]))


def test_promo_code_cannot_give_a_promo_code() -> None:
    nested = {"type": "PROMO_CODE", "validDays": 1, "rewards": [{"type": "GIFT", "gift": "CUSTOM"}]}
    with pytest.raises(ValidationError):
        PromoCodeReward.model_validate({"type": "PROMO_CODE", "validDays": 10, "rewards": [nested]})


@pytest.mark.parametrize(
    "validity",
    [
        {},
        {"validDays": 10, "validFrom": NOW.isoformat()},
        {"validFrom": NOW.isoformat()},
        {"validFrom": NOW.isoformat(), "validUntil": NOW.isoformat()},
    ],
)
def test_promo_code_validity_is_days_or_both_dates(validity: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        PromoCodeReward.model_validate(
            {"type": "PROMO_CODE", "rewards": [{"type": "GIFT", "gift": "CUSTOM"}], **validity}
        )


def test_promo_code_expiry() -> None:
    by_days = PromoCodeReward.model_validate(
        {"type": "PROMO_CODE", "validDays": 30, "rewards": [{"type": "GIFT", "gift": "CUSTOM"}]}
    )
    assert promo_code_expiry(by_days, NOW) == (NOW, NOW + timedelta(days=30))

    until = NOW + timedelta(days=5)
    fixed = PromoCodeReward.model_validate(
        {
            "type": "PROMO_CODE",
            "validFrom": NOW.isoformat(),
            "validUntil": until.isoformat(),
            "rewards": [{"type": "GIFT", "gift": "CUSTOM"}],
        }
    )
    assert promo_code_expiry(fixed, NOW - timedelta(days=1)) == (NOW, until)


def test_target_dedupes_brands_by_case() -> None:
    assert Target(brands=["Anua", "anua ", " ", "COSRX"]).brands == ["Anua", "COSRX"]


def test_referenced_ids_walk_into_the_promo_code() -> None:
    product, category, variant = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    rules = PromotionRules.model_validate(
        {
            "conditions": [{"type": "CONTAINS", "target": {"productIds": [str(product)]}}],
            "rewards": [
                {
                    "type": "PROMO_CODE",
                    "validDays": 5,
                    "conditions": [
                        {
                            "type": "SUBTOTAL",
                            "minCents": 1,
                            "target": {"categoryIds": [str(category)]},
                        }
                    ],
                    "rewards": [{"type": "GIFT", "gift": "PRODUCT", "variantId": str(variant)}],
                }
            ],
        }
    )
    assert referenced_ids(list(rules.conditions), list(rules.rewards)) == (
        {product},
        {category},
        {variant},
    )


@pytest.mark.parametrize(
    ("enabled", "deleted", "starts", "ends", "expected"),
    [
        (True, None, -1, 1, PromotionStatus.ACTIVE),
        (True, None, 1, 2, PromotionStatus.SCHEDULED),
        (True, None, -2, 0, PromotionStatus.FINISHED),  # the end is exclusive
        (False, None, -1, 1, PromotionStatus.DISABLED),
        (True, NOW, -1, 1, PromotionStatus.ARCHIVED),
    ],
)
def test_status_is_derived(
    enabled: bool, deleted: datetime | None, starts: int, ends: int, expected: PromotionStatus
) -> None:
    promotion = Promotion(
        is_enabled=enabled,
        deleted_at=deleted,
        starts_at=NOW + timedelta(days=starts),
        ends_at=NOW + timedelta(days=ends),
    )
    assert promotion_status(promotion, NOW) is expected
