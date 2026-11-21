from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from app.promotions.owner_code_schemas import PromoCodeWriteRequest

NOW = datetime.now(UTC)
BODY: dict[str, Any] = {
    "title": "  Скидка 10%  ",
    "startsAt": NOW.isoformat(),
    "rewards": [{"type": "DISCOUNT", "kind": "PERCENT", "value": 10}],
}


def test_a_minimal_code_is_valid_and_open_ended() -> None:
    request = PromoCodeWriteRequest.model_validate(BODY)

    assert request.code is None
    assert request.ends_at is None
    assert request.assigned_user_id is None
    assert request.is_enabled is True


def test_the_title_is_stripped() -> None:
    assert PromoCodeWriteRequest.model_validate(BODY).title == "Скидка 10%"


def test_a_blank_title_is_refused() -> None:
    with pytest.raises(ValidationError):
        PromoCodeWriteRequest.model_validate({**BODY, "title": "   "})


def test_a_promo_code_reward_is_refused() -> None:
    reward = {"type": "PROMO_CODE", "validDays": 30, "rewards": BODY["rewards"], "conditions": []}
    with pytest.raises(ValidationError):
        PromoCodeWriteRequest.model_validate({**BODY, "rewards": [reward]})


def test_at_least_one_reward_is_required() -> None:
    with pytest.raises(ValidationError):
        PromoCodeWriteRequest.model_validate({**BODY, "rewards": []})


def test_an_end_date_and_a_code_are_accepted() -> None:
    request = PromoCodeWriteRequest.model_validate(
        {**BODY, "endsAt": (NOW + timedelta(days=3)).isoformat(), "code": "leto-2026"}
    )

    assert request.ends_at is not None
    assert request.code == "leto-2026"
