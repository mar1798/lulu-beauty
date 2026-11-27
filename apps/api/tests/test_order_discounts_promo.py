"""The promotions' layer in `app/orders/discounts.py`: the fixed order of operations.

Manual line discounts, then promotions' line discounts, then the owner's order discount,
then the promotions' cart-wide discounts in `sort_order` — each from what the last left.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from app.orders.discounts import (
    PromoDiscount,
    PromoLayer,
    order_layers,
    order_totals,
    promo_item_discounts,
    promo_order_discounts,
)
from app.orders.models import DiscountKind, Order, OrderItem
from app.promotions.models import OrderPromotion

PERCENT = DiscountKind.PERCENT
AMOUNT = DiscountKind.AMOUNT


def _order(*lines: tuple[int, int]) -> Order:
    order = Order(id=uuid.uuid4(), total_cents=0)
    order.items = [
        OrderItem(
            id=uuid.uuid4(), product_name="Item", product_price_cents=price, quantity=quantity
        )
        for price, quantity in lines
    ]
    return order


def _reward(kind: DiscountKind, value: int) -> dict[str, Any]:
    return {"type": "DISCOUNT", "kind": kind.value, "value": value, "target": None}


def _join(
    order: Order,
    rewards: list[dict[str, Any]],
    *,
    sort_order: int = 0,
    scopes: dict[str, list[str]] | None = None,
    released: bool = False,
) -> OrderPromotion:
    participation = OrderPromotion(
        id=uuid.uuid4(),
        order_id=order.id,
        user_id=uuid.uuid4(),
        promotion_id=uuid.uuid4(),
        title="Акция",
        rewards=rewards,
        sort_order=sort_order,
        item_scopes=scopes,
        released_at=datetime.now(UTC) if released else None,
    )
    order.promotions = [*order.promotions, participation]
    return participation


def test_without_promotions_the_totals_are_what_they_were() -> None:
    totals = order_totals(_order((10_000, 2)))

    assert totals.total_cents == 20_000
    assert totals.promo_items_discount_cents == 0
    assert totals.promo_order_discount_cents == 0


def test_a_cart_wide_promotion_comes_off_the_whole_order() -> None:
    order = _order((10_000, 2), (5_000, 1))
    participation = _join(order, [_reward(PERCENT, 10)])

    totals = order_totals(order)

    assert totals.promo_order_discount_cents == 2_500
    assert totals.promo_items_discount_cents == 0
    assert totals.total_cents == 22_500
    assert totals.promo_by_layer == {participation.id: 2_500}


def test_a_line_targeted_promotion_comes_off_only_its_lines() -> None:
    order = _order((10_000, 1), (5_000, 1))
    first = str(order.items[0].id)
    _join(order, [_reward(PERCENT, 50)], scopes={"0": [first]})

    totals = order_totals(order)

    assert totals.promo_items_discount_cents == 5_000
    assert totals.total_cents == 10_000


def test_the_four_steps_each_take_from_what_the_last_left() -> None:
    """100 сом line with 20% by the owner, then 50% by a promotion on it, then the owner's
    10% on the order, then a promotion's 10 сом off the cart."""
    order = _order((10_000, 1), (10_000, 1))
    line = order.items[0]
    line.discount_kind = PERCENT
    line.discount_value = 20
    _join(order, [_reward(PERCENT, 50)], sort_order=0, scopes={"0": [str(line.id)]})
    order.discount_kind = PERCENT
    order.discount_value = 10
    _join(order, [_reward(AMOUNT, 1_000)], sort_order=1)

    totals = order_totals(order)

    # 1. owner's line discount: 10 000 - 2 000 = 8 000 left on the first line.
    assert totals.items_discount_cents == 2_000
    # 2. promotion: 50% of 8 000.
    assert totals.promo_items_discount_cents == 4_000
    # 3. owner's order discount: 10% of (4 000 + 10 000), not of the full price.
    assert totals.order_discount_cents == 1_400
    # 4. cart-wide promotion: 1 000 off the 12 600 that is left.
    assert totals.promo_order_discount_cents == 1_000
    assert totals.total_cents == 11_600
    assert totals.after_items_cents == 14_000


def test_cart_wide_promotions_are_taken_in_sort_order_each_from_the_remainder() -> None:
    order = _order((10_000, 1))
    # Written in the wrong order on purpose: sort_order decides, not the row order.
    late = _join(order, [_reward(PERCENT, 50)], sort_order=2)
    early = _join(order, [_reward(AMOUNT, 4_000)], sort_order=1)

    totals = order_totals(order)

    # 4 000 off first, then half of the 6 000 left. The other way round would be 5 000 + 4 000.
    assert totals.promo_by_layer == {early.id: 4_000, late.id: 3_000}
    assert totals.total_cents == 3_000


def test_the_total_never_goes_below_zero() -> None:
    order = _order((1_000, 1))
    _join(order, [_reward(AMOUNT, 5_000)], sort_order=0)
    _join(order, [_reward(PERCENT, 100)], sort_order=1)

    totals = order_totals(order)

    assert totals.total_cents == 0
    assert totals.promo_order_discount_cents == 1_000


def test_line_discounts_never_take_more_than_the_line_has() -> None:
    order = _order((1_000, 1), (9_000, 1))
    order.items[0].discount_kind = AMOUNT
    order.items[0].discount_value = 800
    first = str(order.items[0].id)
    _join(order, [_reward(AMOUNT, 5_000)], scopes={"0": [first]})

    totals = order_totals(order)

    # Only the 200 the owner's discount left on the line.
    assert totals.promo_items_discount_cents == 200
    assert totals.total_cents == 9_000


def test_a_released_promotion_counts_for_nothing() -> None:
    order = _order((10_000, 1))
    _join(order, [_reward(PERCENT, 50)], released=True)

    assert order_totals(order).total_cents == 10_000
    assert order_layers(order) == []


def test_gift_rewards_have_no_money_in_them() -> None:
    order = _order((10_000, 1))
    _join(order, [{"type": "GIFT", "gift": "CUSTOM", "title": "Mystery box", "quantity": 1}])

    assert order_layers(order) == []
    assert order_totals(order).total_cents == 10_000


def test_a_target_that_matches_nothing_takes_nothing_instead_of_going_cart_wide() -> None:
    order = _order((10_000, 1))
    _join(order, [_reward(PERCENT, 50)], scopes={"0": []})

    assert order_totals(order).total_cents == 10_000


def test_a_scope_naming_a_line_that_left_matches_nothing() -> None:
    order = _order((10_000, 1))
    _join(order, [_reward(PERCENT, 50)], scopes={"0": [str(uuid.uuid4())]})

    assert order_totals(order).total_cents == 10_000


def test_item_discounts_spread_in_cents_and_sum_exactly() -> None:
    keys = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    layer = PromoLayer(
        key=uuid.uuid4(),
        sort_order=0,
        discounts=(PromoDiscount(AMOUNT, 10_000, frozenset(keys)),),
    )

    taken, left = promo_item_discounts(keys, [3_333, 3_333, 3_334], [layer])

    assert taken[layer.key] == 10_000
    assert sum(left) == 0
    assert all(cents >= 0 for cents in left)


def test_item_discounts_take_the_lines_in_order_of_their_promotions() -> None:
    key = uuid.uuid4()
    first = PromoLayer(uuid.uuid4(), 0, (PromoDiscount(PERCENT, 50, frozenset({key})),))
    second = PromoLayer(uuid.uuid4(), 1, (PromoDiscount(PERCENT, 50, frozenset({key})),))

    taken, left = promo_item_discounts([key], [10_000], [second, first])

    assert taken == {first.key: 5_000, second.key: 2_500}
    assert left == [2_500]


def test_order_discounts_report_what_is_left_to_pay() -> None:
    layer = PromoLayer(uuid.uuid4(), 0, (PromoDiscount(AMOUNT, 3_000),))

    taken, left = promo_order_discounts(10_000, [layer])

    assert taken == {layer.key: 3_000}
    assert left == 7_000
