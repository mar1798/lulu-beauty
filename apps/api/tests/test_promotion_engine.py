import uuid

from app.orders.models import DiscountKind
from app.promotions.engine import Line, Offer, evaluate, line_matches, qualifies
from app.promotions.rules import (
    ConditionType,
    ContainsCondition,
    ContainsMode,
    DiscountReward,
    GiftKind,
    GiftReward,
    QuantityCondition,
    RewardType,
    SubtotalCondition,
    Target,
)

SERUM = uuid.uuid4()
CREAM = uuid.uuid4()
SKINCARE = uuid.uuid4()  # a section
SERUMS = uuid.uuid4()  # a subcategory of it
MAKEUP = uuid.uuid4()

GIFT = GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM)
TEN_PERCENT = DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=10)


def _line(
    *,
    price: int = 100_000,
    quantity: int = 1,
    product_id: uuid.UUID | None = None,
    categories: frozenset[uuid.UUID] = frozenset(),
    brand: str | None = None,
) -> Line:
    return Line(
        product_id=product_id or uuid.uuid4(),
        variant_id=uuid.uuid4(),
        category_ids=categories,
        brand=brand,
        price_cents=price,
        quantity=quantity,
    )


def _offer(*conditions: object, title: str = "Акция", sort_order: int = 0) -> Offer:
    return Offer(
        id=uuid.uuid4(),
        title=title,
        conditions=list(conditions),  # type: ignore[arg-type]
        rewards=[GIFT],
        sort_order=sort_order,
    )


def _subtotal(min_cents: int, target: Target | None = None) -> SubtotalCondition:
    return SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=min_cents, target=target)


def test_no_conditions_is_any_non_empty_cart() -> None:
    offer = _offer()
    assert qualifies([_line()], offer)
    assert not qualifies([], offer)
    assert not qualifies([_line(quantity=0)], offer)


def test_subtotal_counts_price_times_quantity() -> None:
    offer = _offer(_subtotal(200_000))
    assert not qualifies([_line(price=150_000)], offer)
    assert qualifies([_line(price=100_000, quantity=2)], offer)


def test_subtotal_with_target_counts_only_matching_lines() -> None:
    offer = _offer(_subtotal(200_000, Target(brands=["Anua"])))
    lines = [_line(price=150_000, brand="anua "), _line(price=100_000, brand="COSRX")]
    assert not qualifies(lines, offer)
    assert qualifies([*lines, _line(price=50_000, brand="ANUA")], offer)


def test_quantity_counts_units_not_lines() -> None:
    offer = _offer(QuantityCondition(type=ConditionType.QUANTITY, min_quantity=3))
    assert not qualifies([_line(quantity=2)], offer)
    assert qualifies([_line(quantity=2), _line(quantity=1)], offer)


def test_a_section_takes_in_its_subcategories() -> None:
    line = _line(categories=frozenset({SERUMS, SKINCARE}))
    assert line_matches(line, Target(category_ids=[SKINCARE]))
    assert not line_matches(line, Target(category_ids=[MAKEUP]))


def test_empty_target_matches_everything() -> None:
    assert line_matches(_line(), None)
    assert line_matches(_line(), Target())


def test_contains_any_and_all() -> None:
    target = Target(product_ids=[SERUM, CREAM])
    any_offer = _offer(ContainsCondition(type=ConditionType.CONTAINS, target=target))
    all_offer = _offer(
        ContainsCondition(type=ConditionType.CONTAINS, target=target, mode=ContainsMode.ALL)
    )
    only_serum = [_line(product_id=SERUM)]
    both = [_line(product_id=SERUM), _line(product_id=CREAM)]

    assert qualifies(only_serum, any_offer)
    assert not qualifies(only_serum, all_offer)
    assert qualifies(both, all_offer)


def test_contains_all_needs_every_entry_kind() -> None:
    target = Target(product_ids=[SERUM], brands=["Anua"])
    offer = _offer(
        ContainsCondition(type=ConditionType.CONTAINS, target=target, mode=ContainsMode.ALL)
    )
    assert not qualifies([_line(product_id=SERUM, brand="COSRX")], offer)
    assert qualifies([_line(product_id=SERUM), _line(brand="anua")], offer)


def test_conditions_are_joined_by_and() -> None:
    offer = _offer(
        _subtotal(200_000),
        ContainsCondition(type=ConditionType.CONTAINS, target=Target(product_ids=[SERUM])),
    )
    assert not qualifies([_line(price=300_000)], offer)
    assert not qualifies([_line(product_id=SERUM, price=100_000)], offer)
    assert qualifies([_line(product_id=SERUM, price=300_000)], offer)


def test_every_qualifying_offer_applies_in_sort_order() -> None:
    late = _offer(title="Б", sort_order=2)
    early = _offer(title="А", sort_order=1)
    missed = _offer(_subtotal(1_000_000))

    result = evaluate([_line()], [late, missed, early])

    assert result.applied == [early, late]


def test_already_joined_offers_are_skipped_entirely() -> None:
    joined = _offer()
    near = _offer(_subtotal(200_000))
    result = evaluate([_line()], [joined, near], already_joined=frozenset({joined.id, near.id}))
    assert result.applied == []
    assert result.shortfalls == []


def _quantity(min_quantity: int, target: Target | None = None) -> QuantityCondition:
    return QuantityCondition(type=ConditionType.QUANTITY, min_quantity=min_quantity, target=target)


def test_shortfall_names_the_money_still_missing() -> None:
    offer = _offer(_subtotal(200_000), _subtotal(250_000))
    result = evaluate([_line(price=180_000)], [offer])

    assert result.applied == []
    assert [(s.offer, s.missing_cents, s.missing_quantity) for s in result.shortfalls] == [
        (offer, 70_000, 0)
    ]


def test_shortfall_names_the_units_still_missing() -> None:
    offer = _offer(_quantity(3))
    result = evaluate([_line(quantity=1)], [offer])

    assert [(s.missing_cents, s.missing_quantity) for s in result.shortfalls] == [(0, 2)]


def test_shortfall_names_money_and_units_together() -> None:
    offer = _offer(_subtotal(300_000), _quantity(3))
    result = evaluate([_line(price=100_000, quantity=2)], [offer])

    assert [(s.missing_cents, s.missing_quantity) for s in result.shortfalls] == [(100_000, 1)]


def test_no_shortfall_when_something_besides_money_is_missing() -> None:
    offer = _offer(
        _subtotal(200_000),
        ContainsCondition(type=ConditionType.CONTAINS, target=Target(product_ids=[SERUM])),
    )
    assert evaluate([_line(price=100_000)], [offer]).shortfalls == []


def test_no_shortfall_for_a_promotion_about_chosen_products() -> None:
    by_money = _offer(_subtotal(250_000, Target(brands=["Anua"])))
    by_units = _offer(_quantity(3, Target(product_ids=[SERUM])))
    # Even with the product already in the cart: the hint is only for whole-cart thresholds.
    with_contains = _offer(
        _subtotal(300_000),
        ContainsCondition(type=ConditionType.CONTAINS, target=Target(product_ids=[SERUM])),
    )
    lines = [_line(price=100_000, product_id=SERUM, brand="Anua")]

    assert evaluate(lines, [by_money, by_units, with_contains]).shortfalls == []


def test_no_shortfall_for_an_empty_cart() -> None:
    assert evaluate([], [_offer(_subtotal(100))]).shortfalls == []


def test_rewards_ride_along_untouched() -> None:
    offer = Offer(id=uuid.uuid4(), title="Скидка", conditions=[], rewards=[TEN_PERCENT])
    assert evaluate([_line()], [offer]).applied[0].rewards == [TEN_PERCENT]
