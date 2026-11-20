"""What the API says about promo codes."""

import uuid
from datetime import datetime

from pydantic import Field, ValidationError

from app.common.schemas import CamelModel
from app.promotions.codes import PromoCodeView, code_status
from app.promotions.models import PromoCode
from app.promotions.order_schemas import CartPromotionsResponse, GiftResponse
from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    CodeReward,
    Condition,
    load_code_rewards,
    load_conditions,
)


class OrderPromoCodeResponse(CamelModel):
    """A code as an order shows it: the one it holds, or one it earned."""

    id: uuid.UUID
    code: str
    # EXPIRED is derived from `expiresAt` against the clock at the moment of the answer.
    status: PromoCodeView
    # What it gives and what the order must hold for it — the snapshot taken at issue.
    conditions: list[Condition]
    rewards: list[CodeReward]
    valid_from: datetime
    expires_at: datetime


class PromoCodeResponse(OrderPromoCodeResponse):
    """A code on the customer's «Промокоды» page."""

    promotion_title: str | None
    source_order_id: uuid.UUID | None
    # The order that holds it (RESERVED) or used it (USED).
    used_order_id: uuid.UUID | None
    created_at: datetime


class PromoCodeCheckRequest(CamelModel):
    # Generous: what was typed is normalized and looked up, and anything that is not a
    # code answers «не найден» like any other wrong string.
    code: str = Field(max_length=64)


class PromoCodeCheckResponse(CamelModel):
    """A code that would work on the current cart, and what the cart would come to with it."""

    code: OrderPromoCodeResponse
    # What the code alone takes off, in money; a code that only gives a gift: 0.
    discount_cents: int
    gifts: list[GiftResponse]
    # The cart's price × quantity, and the same after every promotion and this code.
    cart_total_cents: int
    payable_cents: int
    # The cart's promotions with the code counted in — the totals `checkout` would write.
    promotions: CartPromotionsResponse


def _safe_rules(code: PromoCode) -> tuple[list[AnyCondition], list[AnyCodeReward]]:
    """The snapshot parsed; empty lists for a row that no longer parses, not a 500."""
    try:
        return load_conditions(code.conditions), load_code_rewards(code.rewards)
    except ValidationError:
        return [], []


def order_promo_code_response(code: PromoCode, now: datetime) -> OrderPromoCodeResponse:
    conditions, rewards = _safe_rules(code)
    return OrderPromoCodeResponse(
        id=code.id,
        code=code.code,
        status=code_status(code, now),
        conditions=conditions,
        rewards=rewards,
        valid_from=code.valid_from,
        expires_at=code.expires_at,
    )


def promo_code_response(
    code: PromoCode, promotion_title: str | None, now: datetime
) -> PromoCodeResponse:
    conditions, rewards = _safe_rules(code)
    return PromoCodeResponse(
        id=code.id,
        code=code.code,
        status=code_status(code, now),
        conditions=conditions,
        rewards=rewards,
        valid_from=code.valid_from,
        expires_at=code.expires_at,
        promotion_title=promotion_title,
        source_order_id=code.source_order_id,
        used_order_id=code.used_order_id,
        created_at=code.created_at,
    )
