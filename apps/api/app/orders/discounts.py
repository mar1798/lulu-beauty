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

The order of operations is fixed: each line's own discount comes off its price × quantity,
and the order's discount comes off what the lines add up to after that. Neither ever takes
more than what it is taken from.

A discount set before anchors existed has none (NULL) and is counted against the current
sum, as it was when it was given.
"""

from dataclasses import dataclass

from app.orders.models import DiscountKind, Order, OrderItem

# Percent discounts, and discounts scaled down with the sum, are rounded to whole units of
# the currency: prices in the shop are whole сом, and 10% of 1 255 сом read as "125,50"
# would be the only kopecks anyone sees. Rounded half up — the doubt goes the customer's way.
_UNIT = 100

MAX_DISCOUNT_PERCENT = 100


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
class OrderTotals:
    # Price × quantity over every line, before any discount.
    subtotal_cents: int
    # Every line's own discount, summed.
    items_discount_cents: int
    # The order's own discount, taken off what was left after the lines'.
    order_discount_cents: int
    # What the customer pays — `Order.total_cents`.
    total_cents: int

    @property
    def after_items_cents(self) -> int:
        """What the order's own discount is taken from."""
        return self.subtotal_cents - self.items_discount_cents

    @property
    def discount_cents(self) -> int:
        return self.items_discount_cents + self.order_discount_cents


def order_totals(order: Order) -> OrderTotals:
    subtotal = sum(line_subtotal_cents(item) for item in order.items)
    items_discount = sum(line_discount_cents(item) for item in order.items)
    after_items = subtotal - items_discount
    order_discount = anchored_discount_cents(
        order.discount_kind, order.discount_value, order.discount_base_cents, after_items
    )
    return OrderTotals(
        subtotal_cents=subtotal,
        items_discount_cents=items_discount,
        order_discount_cents=order_discount,
        total_cents=after_items - order_discount,
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
    after_items = sum(line_subtotal_cents(item) - line_discount_cents(item) for item in order.items)
    order.discount_base_cents = after_items


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
