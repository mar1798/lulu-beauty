import uuid
from datetime import UTC, datetime

from app.auth.models import User
from app.cart.schemas import CartItemResponse, CartResponse
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderItem, OrderStatus
from app.telegram import messages


def _normalize(text: str) -> str:
    """ru-RU grouping uses U+00A0; tests compare against a plain space."""
    return text.replace(" ", " ")


def _order(
    *,
    status: OrderStatus = OrderStatus.PENDING,
    total_cents: int = 125_000,
    items: int = 1,
    note: str | None = None,
) -> Order:
    order = Order(
        id=uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000"),
        user_id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=status,
        total_cents=total_cents,
        note=note,
    )
    order.items = [
        OrderItem(
            product_name=f"Товар {index}",
            product_slug=f"tovar-{index}",
            product_image_url=None,
            product_price_cents=1000,
            quantity=1,
        )
        for index in range(items)
    ]
    return order


def test_format_price_matches_the_sites_price_atom() -> None:
    # packages/widgets/src/atoms/price says "1 250 сом" / "19,99 сом"; two renderings of
    # the same number in the same shop must not disagree.
    assert _normalize(messages.format_price(125_000)) == "1 250 сом"
    assert _normalize(messages.format_price(1900)) == "19 сом"
    assert _normalize(messages.format_price(1999)) == "19,99 сом"
    assert _normalize(messages.format_price(0)) == "0 сом"


def test_plural_covers_the_teens_exception() -> None:
    assert messages.plural(1, "позиция", "позиции", "позиций") == "позиция"
    assert messages.plural(3, "позиция", "позиции", "позиций") == "позиции"
    assert messages.plural(5, "позиция", "позиции", "позиций") == "позиций"
    # 11 ends in 1 and 12 ends in 2, but both take the "many" form.
    assert messages.plural(11, "позиция", "позиции", "позиций") == "позиций"
    assert messages.plural(12, "позиция", "позиции", "позиций") == "позиций"
    assert messages.plural(21, "позиция", "позиции", "позиций") == "позиция"


def test_cycle_title_falls_back_to_the_deadline_when_unlabelled() -> None:
    labelled = OrderCycle(deadline_at=datetime(2030, 6, 12, 14, tzinfo=UTC), label="Июнь")
    unlabelled = OrderCycle(deadline_at=datetime(2030, 6, 12, 14, tzinfo=UTC), label=None)

    assert messages.cycle_title(labelled) == "«Июнь»"
    assert "2030" in messages.cycle_title(unlabelled)


def test_order_status_changed_says_nothing_about_pending() -> None:
    """PENDING is the owner undoing a cancellation — news to nobody."""
    assert messages.order_status_changed(_order(status=OrderStatus.PENDING)) is None
    assert messages.order_status_changed(_order(status=OrderStatus.READY)) is not None


def test_new_order_for_owner_carries_customer_total_and_note() -> None:
    customer = User(phone="+996700123456", name="Айгуль")
    cycle = OrderCycle(deadline_at=datetime(2030, 6, 12, tzinfo=UTC), label="Июнь")

    text = _normalize(messages.new_order_for_owner(_order(note="без пробников"), customer, cycle))

    assert "Айгуль" in text
    assert "+996700123456" in text
    assert "«Июнь»" in text
    assert "1 250 сом" in text
    assert "без пробников" in text


def test_new_order_for_owner_survives_a_missing_customer_and_cycle() -> None:
    text = messages.new_order_for_owner(_order(), None, None)

    assert "—" in text


def test_my_orders_truncates_and_says_so() -> None:
    orders = [_order() for _ in range(messages.MAX_LISTED_ORDERS + 3)]

    text = messages.my_orders(orders)

    assert text.count("#a1b2c3d4") == messages.MAX_LISTED_ORDERS
    assert "ещё 3" in text


def test_my_orders_on_an_empty_list() -> None:
    assert messages.my_orders([]) == "У вас пока нет заявок."


def _cart(*, items: list[CartItemResponse], deadline: datetime | None) -> CartResponse:
    return CartResponse(
        cycle_id=uuid.uuid4() if deadline else None,
        cycle_deadline_at=deadline,
        items=items,
        total_cents=sum(item.line_total_cents for item in items),
    )


def test_my_cart_distinguishes_empty_cart_from_closed_shop() -> None:
    """Both are empty carts; only one of them is worth telling someone to check out."""
    between_cycles = messages.my_cart(_cart(items=[], deadline=None))
    open_but_empty = messages.my_cart(_cart(items=[], deadline=datetime(2030, 6, 12, tzinfo=UTC)))

    assert between_cycles != open_but_empty
    assert "закрыт" in between_cycles
    assert "пуста" in open_but_empty


def test_my_cart_lists_items_total_and_deadline() -> None:
    item = CartItemResponse(
        product_id=uuid.uuid4(),
        product_name="Крем для рук",
        product_slug="krem",
        product_image_url=None,
        product_price_cents=62_500,
        quantity=2,
        line_total_cents=125_000,
    )

    cart = _cart(items=[item], deadline=datetime(2030, 6, 12, tzinfo=UTC))
    text = _normalize(messages.my_cart(cart))

    assert "Крем для рук × 2" in text
    assert "1 250 сом" in text
    assert "12.06.2030" in text


def test_current_deadline_between_cycles_is_not_an_error() -> None:
    assert "закрыт" in messages.current_deadline(None)
