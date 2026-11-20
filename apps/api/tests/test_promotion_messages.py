"""Texts of the promotion and promo code notifications."""

import uuid
from datetime import UTC, datetime, timedelta

from app.cycles.models import OrderCycle
from app.orders.models import DiscountKind, Order, OrderItem, OrderStatus
from app.promotions.models import OrderGift, OrderPromotion, PromoCode, Promotion
from app.promotions.rules import (
    ConditionType,
    DiscountReward,
    GiftKind,
    GiftReward,
    RewardType,
    SubtotalCondition,
    dump_conditions,
    dump_rewards,
)
from app.telegram import keyboards, messages

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def _percent(value: int) -> DiscountReward:
    return DiscountReward(type=RewardType.DISCOUNT, kind=DiscountKind.PERCENT, value=value)


def _gift(title: str = "Mystery box", quantity: int = 1) -> GiftReward:
    return GiftReward(type=RewardType.GIFT, gift=GiftKind.CUSTOM, title=title, quantity=quantity)


def _order() -> Order:
    order = Order(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=OrderStatus.PENDING,
        total_cents=90_000,
        note=None,
    )
    order.items = [
        OrderItem(
            product_name="Крем",
            product_slug="krem",
            product_image_url=None,
            product_price_cents=100_000,
            quantity=1,
        )
    ]
    order.promotions = []
    order.gifts = []
    return order


def _join(order: Order, title: str, rewards: list[DiscountReward | GiftReward]) -> OrderPromotion:
    participation = OrderPromotion(
        id=uuid.uuid4(),
        order_id=order.id,
        user_id=order.user_id,
        promotion_id=uuid.uuid4(),
        title=title,
        rewards=dump_rewards(rewards),
        released_at=None,
    )
    order.promotions.append(participation)
    return participation


def _code(*, valid_from: datetime | None = None) -> PromoCode:
    return PromoCode(
        id=uuid.uuid4(),
        code="K7M2QXPA",
        user_id=uuid.uuid4(),
        promotion_id=uuid.uuid4(),
        conditions=dump_conditions(
            [SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=200_000)]
        ),
        rewards=dump_rewards([_percent(15)]),
        valid_from=valid_from or NOW - timedelta(days=1),
        expires_at=NOW + timedelta(days=3),
    )


def test_a_customer_is_told_which_promotions_the_order_joined() -> None:
    order = _order()
    participation = _join(order, "Осенняя акция", [_percent(10), _gift("Бокс", 1)])
    order.gifts.append(
        OrderGift(
            id=uuid.uuid4(),
            order_id=order.id,
            order_promotion_id=participation.id,
            kind=GiftKind.CUSTOM,
            title="Бокс",
            quantity=2,
        )
    )

    lines = messages.promotion_lines(order)

    assert len(lines) == 1
    assert "«Осенняя акция»" in lines[0]
    assert "скидка 10%" in lines[0]
    # The gift comes from the order's own rows (what actually goes out), once.
    assert lines[0].count("Бокс") == 1 and "Бокс × 2" in lines[0]


def test_a_released_participation_is_not_mentioned() -> None:
    order = _order()
    _join(order, "Старая", [_percent(5)]).released_at = NOW
    assert messages.promotion_lines(order) == []


def test_a_code_used_on_the_order_is_mentioned_as_applied() -> None:
    order = _order()
    participation = _join(order, "Промокод K7M2QXPA", [_percent(15)])
    participation.promotion_id = None
    participation.promo_code_id = uuid.uuid4()

    lines = messages.promotion_lines(order)

    assert lines == ["🎟 Применён промокод K7M2QXPA: скидка 15%"]


def test_the_order_created_for_a_customer_carries_the_promotion_lines_escaped() -> None:
    order = _order()
    _join(order, "<b>Акция</b>", [_percent(10)])
    cycle = OrderCycle(id=order.cycle_id, deadline_at=NOW + timedelta(days=2))

    text = messages.order_created_for_customer(order, cycle, is_open=True)

    assert "&lt;b&gt;Акция&lt;/b&gt;" in text
    assert "<b>Акция</b>" not in text


def test_the_owner_is_reminded_to_pack_the_gifts() -> None:
    order = _order()
    participation = _join(order, "Акция", [_gift()])
    order.gifts = [
        OrderGift(
            id=uuid.uuid4(),
            order_id=order.id,
            order_promotion_id=participation.id,
            kind=GiftKind.CUSTOM,
            title="Бокс",
            quantity=3,
        )
    ]

    text = messages.new_order_for_owner(order, None, None)

    assert "Подарки - не забыть положить" in text
    assert "• Бокс × 3" in text


def test_an_order_without_gifts_has_no_gift_block_for_the_owner() -> None:
    assert "Подарки" not in messages.new_order_for_owner(_order(), None, None)


def _promotion(*, title: str = "Осенняя акция") -> Promotion:
    return Promotion(
        id=uuid.uuid4(),
        slug="osen",
        title=title,
        starts_at=NOW,
        ends_at=NOW + timedelta(days=7),
        conditions=dump_conditions(
            [SubtotalCondition(type=ConditionType.SUBTOTAL, min_cents=200_000)]
        ),
        rewards=dump_rewards([_percent(10), _gift("Бокс")]),
    )


def test_the_start_announcement_says_what_terms_and_until_when() -> None:
    text = messages.promotion_started(_promotion())

    assert "«Осенняя акция»" in text
    assert "скидка 10%" in text and "подарок Бокс" in text
    assert "покупка от 2" in text  # 2 000 сом, however the grouping space is written
    assert "27.11.2026" in text


def test_the_start_announcement_button_points_at_the_promotion_page() -> None:
    markup = keyboards.promotion_link("osen/кино")
    if markup is None:  # the configured site is not publicly addressable in this environment
        return
    button = markup.inline_keyboard[0][0]
    target = button.url or (button.web_app.url if button.web_app else "")
    assert "/promotions/osen%2F%D0%BA%D0%B8%D0%BD%D0%BE" in target


def test_the_code_message_has_the_code_terms_and_expiry_and_escapes_the_title() -> None:
    text = messages.promo_code_issued(_code(), "<i>Акция</i>", now=NOW)

    assert "<code>K7M2QXPA</code>" in text
    assert "&lt;i&gt;Акция&lt;/i&gt;" in text and "<i>" not in text
    assert "скидка 15%" in text
    assert "Действует до 23.11.2026" in text


def test_a_code_that_is_not_valid_yet_says_from_when() -> None:
    text = messages.promo_code_issued(_code(valid_from=NOW + timedelta(days=1)), "Акция", now=NOW)
    assert "Действует с 21.11.2026" in text and "до 23.11.2026" in text


def test_the_expiry_reminder_names_the_code_and_the_date() -> None:
    text = messages.promo_code_expiring(_code(), "Акция")

    assert "K7M2QXPA" in text and "скоро сгорит" in text
    assert "Действует до 23.11.2026" in text


def test_no_em_dash_in_the_new_copy() -> None:
    order = _order()
    _join(order, "Акция", [_percent(10)])
    texts = [
        messages.promotion_started(_promotion()),
        messages.promo_code_issued(_code(), "Акция", now=NOW),
        messages.promo_code_expiring(_code(), "Акция"),
        *messages.promotion_lines(order),
    ]
    assert all("—" not in text for text in texts)
