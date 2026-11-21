"""Which promotions a cart qualifies for — pure functions, no session, no ORM.

The cart preview, checkout and the recount of a PENDING order all ask the same question
about the same kind of input, so they all ask it here: a list of line snapshots and the
promotions to try. Choosing *which* promotions to try is the caller's job — the live ones
for a new order, plus the ones an order already holds while it stays PENDING (a promotion
that has ended keeps the orders it already has, see the plan in `docs/domain.md`). The
engine never looks at the clock.

The money a reward comes to is not counted here either: that is `app/orders/discounts.py`,
the one place the order arithmetic lives.

Conditions read the lines as they are before any discount — price × quantity — and gifts
are never lines, so a gift cannot help its own order over a threshold.
"""

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from app.promotions.rules import (
    AnyCodeReward,
    AnyCondition,
    AnyReward,
    ContainsCondition,
    ContainsMode,
    QuantityCondition,
    SubtotalCondition,
    Target,
    normalize_brand,
)


@dataclass(frozen=True)
class Line:
    """One cart or order line, as much of it as a promotion can ask about."""

    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    # The product's category and the section above it, if it has one: a target naming a
    # section takes in its subcategories, as the catalogue's own `category=` filter does.
    category_ids: frozenset[uuid.UUID]
    brand: str | None
    price_cents: int
    quantity: int
    # What the caller calls this line — an order line's id, a cart line's variant id. The
    # engine only hands it back (`orders.py` turns the lines a target matched into scopes).
    key: uuid.UUID | None = None

    @property
    def subtotal_cents(self) -> int:
        return self.price_cents * self.quantity


@dataclass(frozen=True)
class Offer:
    """A promotion or a promo code, as the engine tries it."""

    id: uuid.UUID
    title: str
    conditions: Sequence[AnyCondition]
    rewards: Sequence[AnyReward] | Sequence[AnyCodeReward]
    # Cart-wide discounts are taken in this order, each from what the previous one left.
    sort_order: int = 0


@dataclass(frozen=True)
class Shortfall:
    """An offer missing only money — «ещё 300 сом до подарка».

    Reported only when every other condition already holds: a hint that names a sum and
    then turns out to need a particular product too would be a promise the cart cannot
    keep by adding that sum.
    """

    offer: Offer
    missing_cents: int


@dataclass(frozen=True)
class Evaluation:
    # The offers the lines qualify for.
    applied: list[Offer] = field(default_factory=list)
    shortfalls: list[Shortfall] = field(default_factory=list)


def line_matches(line: Line, target: Target | None) -> bool:
    """Whether the line is one the target is about. No target, or an empty one, is all."""
    if target is None or target.is_empty:
        return True
    if line.product_id is not None and line.product_id in target.product_ids:
        return True
    if not line.category_ids.isdisjoint(target.category_ids):
        return True
    return line.brand is not None and normalize_brand(line.brand) in {
        normalize_brand(brand) for brand in target.brands
    }


def matching_lines(lines: Iterable[Line], target: Target | None) -> list[Line]:
    return [line for line in lines if line_matches(line, target)]


def _contains_all(lines: Sequence[Line], target: Target) -> bool:
    """Every entry of the target — each product, category, brand — has a line of its own."""
    products = {line.product_id for line in lines}
    categories = set().union(*(line.category_ids for line in lines)) if lines else set()
    brands = {normalize_brand(line.brand) for line in lines if line.brand is not None}
    return (
        all(product_id in products for product_id in target.product_ids)
        and all(category_id in categories for category_id in target.category_ids)
        and all(normalize_brand(brand) in brands for brand in target.brands)
    )


def subtotal_shortfall(lines: Sequence[Line], condition: SubtotalCondition) -> int:
    """How much more the matching lines need to cost; 0 once they reach the threshold."""
    reached = sum(line.subtotal_cents for line in matching_lines(lines, condition.target))
    return max(0, condition.min_cents - reached)


def condition_holds(lines: Sequence[Line], condition: AnyCondition) -> bool:
    lines = [line for line in lines if line.quantity > 0]
    if isinstance(condition, SubtotalCondition):
        return subtotal_shortfall(lines, condition) == 0
    if isinstance(condition, QuantityCondition):
        units = sum(line.quantity for line in matching_lines(lines, condition.target))
        return units >= condition.min_quantity
    assert isinstance(condition, ContainsCondition)
    if condition.mode is ContainsMode.ALL:
        return _contains_all(lines, condition.target)
    return any(line_matches(line, condition.target) for line in lines)


def qualifies(lines: Sequence[Line], offer: Offer) -> bool:
    """Every condition holds — they are joined by «и». No conditions is any non-empty cart."""
    if not any(line.quantity > 0 for line in lines):
        return False
    return all(condition_holds(lines, condition) for condition in offer.conditions)


def _shortfall(lines: Sequence[Line], offer: Offer) -> int | None:
    """The money still missing, when money is the only thing missing; None otherwise."""
    missing = 0
    for condition in offer.conditions:
        if isinstance(condition, SubtotalCondition):
            missing = max(missing, subtotal_shortfall(lines, condition))
        elif not condition_holds(lines, condition):
            return None
    return missing or None


def evaluate(
    lines: Sequence[Line],
    offers: Iterable[Offer],
    *,
    already_joined: frozenset[uuid.UUID] = frozenset(),
) -> Evaluation:
    """The offers the lines qualify for, and the ones a little more money would win.

    `already_joined` are offers this customer holds through *another* live order — «один
    раз на покупателя» — and are skipped outright, hints included. Both lists come back in
    `sort_order`, then by title, so the cart and the order show them the same way.
    """
    ordered = sorted(
        (offer for offer in offers if offer.id not in already_joined),
        key=lambda offer: (offer.sort_order, offer.title, str(offer.id)),
    )
    live = [line for line in lines if line.quantity > 0]
    applied: list[Offer] = []
    shortfalls: list[Shortfall] = []
    for offer in ordered:
        if qualifies(live, offer):
            applied.append(offer)
            continue
        if live:
            missing = _shortfall(live, offer)
            if missing is not None:
                shortfalls.append(Shortfall(offer=offer, missing_cents=missing))
    return Evaluation(applied=applied, shortfalls=shortfalls)
