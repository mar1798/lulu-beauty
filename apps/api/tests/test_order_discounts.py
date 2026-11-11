import uuid

import pytest
from pydantic import ValidationError

from app.orders.discounts import anchored_discount_cents, discount_cents, order_totals
from app.orders.models import DiscountKind, Order, OrderItem
from app.orders.schemas import AdminOrderDiscount, AdminOrderDiscountRequest


def _order(*lines: tuple[int, int]) -> Order:
    order = Order(id=uuid.uuid4(), total_cents=0)
    order.items = [
        OrderItem(product_name="Item", product_price_cents=price, quantity=quantity)
        for price, quantity in lines
    ]
    return order


def test_no_discount_takes_nothing() -> None:
    assert discount_cents(None, None, 10_000) == 0


def test_percent_rounds_to_whole_units_half_up() -> None:
    # 10% of 1 255 сом is 125,5 — the customer gets 126.
    assert discount_cents(DiscountKind.PERCENT, 10, 125_500) == 12_600
    assert discount_cents(DiscountKind.PERCENT, 10, 125_400) == 12_500


def test_a_hundred_percent_is_the_whole_base() -> None:
    assert discount_cents(DiscountKind.PERCENT, 100, 125_550) == 125_550


def test_an_amount_is_capped_at_its_base() -> None:
    """Lines that shrank after the discount was set never push the sum below zero."""
    assert discount_cents(DiscountKind.AMOUNT, 50_000, 30_000) == 30_000


def test_order_discount_comes_off_what_the_lines_leave() -> None:
    order = _order((10_000, 2), (5_000, 1))
    order.items[0].discount_kind = DiscountKind.AMOUNT
    order.items[0].discount_value = 5_000
    order.discount_kind = DiscountKind.PERCENT
    order.discount_value = 10

    totals = order_totals(order)

    assert totals.subtotal_cents == 25_000
    assert totals.items_discount_cents == 5_000
    # 10% of 200 сом, not of 250.
    assert totals.order_discount_cents == 2_000
    assert totals.total_cents == 18_000
    assert totals.discount_cents == 7_000


def test_an_unanchored_percent_follows_the_price() -> None:
    """Discounts saved before anchors existed are counted as they were."""
    order = _order((10_000, 1))
    order.items[0].discount_kind = DiscountKind.PERCENT
    order.items[0].discount_value = 20
    assert order_totals(order).total_cents == 8_000

    order.items[0].product_price_cents = 20_000
    assert order_totals(order).total_cents == 16_000


def test_an_anchored_discount_never_grows() -> None:
    # 50% given on 1000 is 500, whatever the sum grows to.
    assert anchored_discount_cents(DiscountKind.PERCENT, 50, 100_000, 1_000_000) == 50_000


def test_an_anchored_discount_shrinks_in_proportion() -> None:
    # 2000 of 3000 is two thirds; of the 500 left that is 333,33 — 333 whole сом.
    assert anchored_discount_cents(DiscountKind.AMOUNT, 200_000, 300_000, 50_000) == 33_300


def test_request_refuses_a_percent_over_a_hundred() -> None:
    with pytest.raises(ValidationError):
        AdminOrderDiscount(kind=DiscountKind.PERCENT, value=101)


def test_request_refuses_a_zero_discount() -> None:
    with pytest.raises(ValidationError):
        AdminOrderDiscount(kind=DiscountKind.AMOUNT, value=0)


def test_a_blank_note_is_no_note() -> None:
    assert AdminOrderDiscount(kind=DiscountKind.PERCENT, value=5, note="   ").note is None


def test_request_reads_camel_case_and_null_removes() -> None:
    request = AdminOrderDiscountRequest.model_validate(
        {"revision": 3, "itemId": None, "discount": None}
    )
    assert (request.revision, request.item_id, request.discount) == (3, None, None)
