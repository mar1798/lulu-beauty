"""What an admin's discounts come to in money.

A discount is stored the way the admin set it — a kind and a value — together with its
*anchor*: the sum it was taken from at the moment an admin last looked at it
(`discount_base_cents`). It is turned into cents here, every time the order's total is
computed (`OrdersService._recalculate_total`). Kept apart from the service so the arithmetic
is one pure function that every reader agrees on: the stored total, the API response and the
bot's messages all count the same way.

The anchor is what keeps the discount the admin's. Only giving a discount moves it
(`anchor_discounts`, called by `set_discount`); a reprice or a dropped product do not.
Against the anchor, a discount can shrink but never grow:

- the sum it is taken from is as large as at the anchor or larger — the discount is what it
  was at the anchor, not a share of the new sum;
- the sum is smaller — the discount shrinks in the same proportion (an amount of 2000 on
  3000 is two thirds, and stays two thirds of the 500 left, instead of swallowing it whole).

An amount that has shrunk is written back as the money it now comes to (`settle_amounts`,
on every recount), so the stored value is always what the customer gets. Without that, the
next admin action would re-anchor the old, larger number against the smaller sum and hand
the shrunk part back — up to making the line or the order free.

An edit of the composition — the customer's or an admin's — does not shrink anything: it
takes the discounts it touches off altogether (`clear_discount` in the service) — the
order's on any change, a line's when that line is changed — and the website warns before
it does.

This module is the only place the arithmetic lives. The website shows the sum a discount
would come to by asking the API (`POST /admin/orders/{id}/discount/preview`), not by
counting it again.

The order of operations is fixed, and every step takes from what the one before left:

1. the owner's discounts on lines, each off its own price × quantity;
2. the promotions' discounts on particular lines (`PromoDiscount.line_keys`), in the
   promotions' `sort_order`;
3. the owner's discount on the order, off the sum of the lines as they now stand;
4. the promotions' cart-wide discounts, one after another in `sort_order`.

No step ever takes more than what it is taken from, so the total is never below zero. The
promotions' discounts carry no anchor: they are recounted from the order as it is, for as
long as the order holds them (`app/promotions/orders.py` decides which it holds — while
PENDING; from the bill on the set is frozen). The cart preview counts the same layers
through `promo_item_discounts` and `promo_order_discounts`, so a cart and the order made of
it agree.

A discount set before anchors existed has none (NULL) and is counted against the current
sum, as it was when it was given.
"""

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.orders.models import DiscountKind, Order, OrderItem

# Percent discounts, and discounts scaled down with the sum, are rounded to whole units of
# the currency: prices in the shop are whole сом, and 10% of 1 255 сом read as "125,50"
# would be the only kopecks anyone sees. Rounded half up — the doubt goes the customer's way.
_UNIT = 100


def _round_units(numerator: int, denominator: int) -> int:
    """numerator / denominator in cents, rounded half up to whole units."""
    return (numerator + denominator * _UNIT // 2) // (denominator * _UNIT) * _UNIT


def discount_cents(kind: DiscountKind | None, value: int | None, base_cents: int) -> int:
    """How much a discount of this kind and value takes off `base_cents`, unanchored."""
    if kind is None or value is None or base_cents <= 0:
        return 0
    cents = _round_units(base_cents * value, 100) if kind is DiscountKind.PERCENT else value
    return max(0, min(cents, base_cents))


def anchored_discount_cents(
    kind: DiscountKind | None, value: int | None, anchor_cents: int | None, base_cents: int
) -> int:
    """The discount against `base_cents`, given it was set when the sum was `anchor_cents`."""
    if anchor_cents is None or anchor_cents <= 0:
        return discount_cents(kind, value, base_cents)
    given = discount_cents(kind, value, anchor_cents)
    if base_cents >= anchor_cents:
        return min(given, base_cents)
    return max(0, min(_round_units(given * base_cents, anchor_cents), base_cents))


def line_subtotal_cents(item: OrderItem) -> int:
    return item.product_price_cents * item.quantity


def line_discount_cents(item: OrderItem) -> int:
    return anchored_discount_cents(
        item.discount_kind,
        item.discount_value,
        item.discount_base_cents,
        line_subtotal_cents(item),
    )


@dataclass(frozen=True)
class PromoDiscount:
    """One `DISCOUNT` reward of a promotion, as the arithmetic needs it."""

    kind: DiscountKind
    value: int
    # The lines it is about — keys the caller chose (an order line's id, a cart line's
    # variant id). None is the whole cart; an empty set is a target nothing matches.
    line_keys: frozenset[uuid.UUID] | None = None


@dataclass(frozen=True)
class PromoLayer:
    """What one promotion (or promo code) takes off, ready to be counted."""

    key: uuid.UUID
    # Cart-wide discounts are taken in this order, each from what the previous one left.
    sort_order: int
    discounts: tuple[PromoDiscount, ...]


def _spread(amount: int, remaining: list[int], indices: Sequence[int]) -> None:
    """Take `amount` off `remaining` at these positions, in proportion to what each has left.

    Whole cents, the rounding leftovers going to the first lines with room — so the sum
    taken is exactly `amount` and no line goes below zero.
    """
    base = sum(remaining[i] for i in indices)
    if amount <= 0 or base <= 0:
        return
    shares = {i: amount * remaining[i] // base for i in indices}
    leftover = amount - sum(shares.values())
    for i in indices:
        if leftover <= 0:
            break
        extra = min(leftover, remaining[i] - shares[i])
        shares[i] += extra
        leftover -= extra
    for i, share in shares.items():
        remaining[i] -= share


def promo_item_discounts(
    keys: Sequence[uuid.UUID | None], remaining: Sequence[int], layers: Sequence[PromoLayer]
) -> tuple[dict[uuid.UUID, int], list[int]]:
    """Step 2: the promotions' discounts on particular lines.

    `keys` name the lines (a line not yet saved has none and no discount can aim at it) and
    `remaining` is what each has left after the owner's own line discounts. Each discount is
    taken from what is left after the promotions before it. Returns what each layer took,
    and what each line has left.
    """
    left = list(remaining)
    taken: dict[uuid.UUID, int] = {}
    for layer in sorted(layers, key=lambda layer: layer.sort_order):
        for discount in layer.discounts:
            if discount.line_keys is None:
                continue
            indices = [i for i, key in enumerate(keys) if key in discount.line_keys]
            amount = discount_cents(discount.kind, discount.value, sum(left[i] for i in indices))
            _spread(amount, left, indices)
            taken[layer.key] = taken.get(layer.key, 0) + amount
    return taken, left


def promo_order_discounts(
    base_cents: int, layers: Sequence[PromoLayer]
) -> tuple[dict[uuid.UUID, int], int]:
    """Step 4: the promotions' cart-wide discounts, one after another in `sort_order`.

    Returns what each layer took, and what is left to pay.
    """
    left = max(0, base_cents)
    taken: dict[uuid.UUID, int] = {}
    for layer in sorted(layers, key=lambda layer: layer.sort_order):
        for discount in layer.discounts:
            if discount.line_keys is not None:
                continue
            amount = discount_cents(discount.kind, discount.value, left)
            left -= amount
            taken[layer.key] = taken.get(layer.key, 0) + amount
    return taken, left


def order_layers(order: Order) -> list[PromoLayer]:
    """The promotions an order holds right now, as discount layers.

    Live participations only (`released_at` unset). The rewards are the snapshot the order
    took, and `item_scopes` says which lines each line-targeted discount landed on — the
    catalogue is not asked here, so the same order always counts the same. A reward with no
    scope is cart-wide; a scope may name lines that have since gone, which simply match
    nothing.
    """
    layers: list[PromoLayer] = []
    for participation in order.promotions:
        if participation.released_at is not None:
            continue
        scopes = participation.item_scopes or {}
        discounts: list[PromoDiscount] = []
        for index, reward in enumerate(participation.rewards):
            if reward.get("type") != "DISCOUNT":
                continue
            scope = scopes.get(str(index))
            discounts.append(
                PromoDiscount(
                    kind=DiscountKind(reward["kind"]),
                    value=int(reward["value"]),
                    line_keys=None if scope is None else frozenset(uuid.UUID(k) for k in scope),
                )
            )
        if discounts:
            layers.append(
                PromoLayer(
                    key=participation.id,
                    sort_order=participation.sort_order,
                    discounts=tuple(discounts),
                )
            )
    return layers


@dataclass(frozen=True)
class OrderTotals:
    # Price × quantity over every line, before any discount.
    subtotal_cents: int
    # Every line's own discount, summed — the owner's.
    items_discount_cents: int
    # The order's own discount, taken off what was left after the lines'. The owner's.
    order_discount_cents: int
    # What the customer pays — `Order.total_cents`.
    total_cents: int
    # The promotions' discounts on particular lines (step 2), summed.
    promo_items_discount_cents: int = 0
    # The promotions' cart-wide discounts (step 4), summed.
    promo_order_discount_cents: int = 0
    # What each promotion (`OrderPromotion.id`) took off in all, for showing next to it.
    promo_by_layer: Mapping[uuid.UUID, int] = field(default_factory=dict)

    @property
    def after_items_cents(self) -> int:
        """What the order's own discount is taken from: after the lines' discounts, the
        owner's and the promotions'."""
        return self.subtotal_cents - self.items_discount_cents - self.promo_items_discount_cents

    @property
    def discount_cents(self) -> int:
        return self.items_discount_cents + self.order_discount_cents

    @property
    def promo_discount_cents(self) -> int:
        return self.promo_items_discount_cents + self.promo_order_discount_cents


def order_totals(order: Order, layers: Sequence[PromoLayer] | None = None) -> OrderTotals:
    """The order counted in the fixed order of operations (see the module docstring).

    `layers` are the promotions to count; left out, the ones the order holds.
    """
    layers = order_layers(order) if layers is None else layers
    subtotal = sum(line_subtotal_cents(item) for item in order.items)
    items_discount = sum(line_discount_cents(item) for item in order.items)
    by_layer, after_promo = promo_item_discounts(
        [item.id for item in order.items],
        [line_subtotal_cents(item) - line_discount_cents(item) for item in order.items],
        layers,
    )
    promo_items = sum(by_layer.values())
    after_items = sum(after_promo)
    order_discount = anchored_discount_cents(
        order.discount_kind, order.discount_value, order.discount_base_cents, after_items
    )
    order_by_layer, total = promo_order_discounts(after_items - order_discount, layers)
    for key, cents in order_by_layer.items():
        by_layer[key] = by_layer.get(key, 0) + cents
    return OrderTotals(
        subtotal_cents=subtotal,
        items_discount_cents=items_discount,
        order_discount_cents=order_discount,
        total_cents=total,
        promo_items_discount_cents=promo_items,
        promo_order_discount_cents=sum(order_by_layer.values()),
        promo_by_layer=by_layer,
    )


def anchor_discounts(order: Order) -> None:
    """Re-take every discount on the order against the sums as they are now.

    Giving a discount is the admin looking at the order as it stands, so what they leave
    in place means what it says against it: a percent is a percent of the current lines.
    Lines first, then the order's discount against what they leave.
    """
    for item in order.items:
        item.discount_base_cents = (
            line_subtotal_cents(item) if item.discount_kind is not None else None
        )
    if order.discount_kind is None:
        order.discount_base_cents = None
        return
    order.discount_base_cents = order_totals(order).after_items_cents


def clear_discount(holder: Order | OrderItem) -> None:
    """Take a line's or the order's discount off, note and anchor with it."""
    holder.discount_kind = None
    holder.discount_value = None
    holder.discount_note = None
    holder.discount_base_cents = None


def settle_amounts(order: Order) -> None:
    """Write every amount the sums have shrunk back as the money it now comes to.

    Run on every recount, so an `AMOUNT` discount's stored value never exceeds what it takes
    off: an admin action that re-anchors it then keeps it at that, instead of growing it back
    to the number first typed. One that has shrunk to nothing is taken off. Percents are left
    alone — a percent re-taken against the current sum is still the same share of it.
    Lines first, then the order's discount against what they leave.
    """
    for item in order.items:
        if item.discount_kind is not DiscountKind.AMOUNT or item.discount_value is None:
            continue
        taken = line_discount_cents(item)
        if taken == 0:
            clear_discount(item)
        elif taken < item.discount_value:
            item.discount_value = taken
            item.discount_base_cents = line_subtotal_cents(item)
    if order.discount_kind is not DiscountKind.AMOUNT or order.discount_value is None:
        return
    totals = order_totals(order)
    if totals.order_discount_cents == 0:
        clear_discount(order)
    elif totals.order_discount_cents < order.discount_value:
        order.discount_value = totals.order_discount_cents
        order.discount_base_cents = totals.after_items_cents
