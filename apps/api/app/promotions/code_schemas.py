"""What the API says about promo codes."""

import uuid
from datetime import datetime

from pydantic import Field, ValidationError

from app.common.schemas import CamelModel
from app.promotions.codes import OwnerCodeUse, PromoCodeView, code_status
from app.promotions.models import PromoCode, Promotion
from app.promotions.order_schemas import CartPromotionsResponse, GiftResponse
from app.promotions.orders import code_of_title
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
    # Null: an owner's code with no end date.
    expires_at: datetime | None


class PromoCodeResponse(OrderPromoCodeResponse):
    """A code on the customer's «Промокоды» page."""

    promotion_title: str | None
    # True: an owner's personal code, whose `promotion_title` is the code's own title and
    # not the name of a promotion that issued it.
    is_owner_code: bool
    # The owner's note for a personal code, sanitised HTML; null for an issued code.
    description_html: str | None
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


def _safe_rules(code: PromoCode | Promotion) -> tuple[list[AnyCondition], list[AnyCodeReward]]:
    """The snapshot parsed; empty lists for a row that no longer parses, not a 500."""
    try:
        return load_conditions(code.conditions), load_code_rewards(code.rewards)
    except ValidationError:
        return [], []


def owner_promo_code_response(promotion: Promotion) -> OrderPromoCodeResponse:
    """An owner's code as the cart check shows it: it is only ever answered while usable."""
    assert promotion.code is not None
    conditions, rewards = _safe_rules(promotion)
    return OrderPromoCodeResponse(
        id=promotion.id,
        code=promotion.code,
        status=PromoCodeView.ACTIVE,
        conditions=conditions,
        rewards=rewards,
        valid_from=promotion.starts_at,
        expires_at=promotion.ends_at,
    )


def personal_promo_code_response(
    promotion: Promotion,
    now: datetime,
    *,
    used_order_id: uuid.UUID | None,
    used_order_paid: bool,
) -> PromoCodeResponse:
    """A personal owner code on the customer's «Промокоды» page.

    A live participation makes it RESERVED (its order is not paid yet) or USED (it is);
    without one, a window that has ended makes it EXPIRED.
    """
    assert promotion.code is not None
    conditions, rewards = _safe_rules(promotion)
    if used_order_id is not None:
        view = PromoCodeView.USED if used_order_paid else PromoCodeView.RESERVED
    elif promotion.ends_at is not None and now >= promotion.ends_at:
        view = PromoCodeView.EXPIRED
    else:
        view = PromoCodeView.ACTIVE
    return PromoCodeResponse(
        id=promotion.id,
        code=promotion.code,
        status=view,
        conditions=conditions,
        rewards=rewards,
        valid_from=promotion.starts_at,
        expires_at=promotion.ends_at,
        promotion_title=promotion.title,
        is_owner_code=True,
        description_html=promotion.description_html,
        source_order_id=None,
        used_order_id=used_order_id,
        created_at=promotion.created_at,
    )


def order_owner_code_response(use: OwnerCodeUse, *, is_paid: bool) -> OrderPromoCodeResponse:
    """The owner's code an order holds. The string and the rewards are the order's snapshot;
    the conditions are the code's own, as they are what keeps it on a PENDING order."""
    conditions, _ = _safe_rules(use.promotion)
    try:
        rewards = load_code_rewards(use.participation.rewards)
    except ValidationError:
        rewards = []
    return OrderPromoCodeResponse(
        id=use.promotion.id,
        code=code_of_title(use.participation.title),
        status=PromoCodeView.USED if is_paid else PromoCodeView.RESERVED,
        conditions=conditions,
        rewards=rewards,
        valid_from=use.promotion.starts_at,
        expires_at=use.promotion.ends_at,
    )


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
        is_owner_code=False,
        description_html=None,
        source_order_id=code.source_order_id,
        used_order_id=code.used_order_id,
        created_at=code.created_at,
    )
