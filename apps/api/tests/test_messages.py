import uuid
from datetime import UTC, datetime

from app.auth.models import User
from app.cart.schemas import CartItemResponse, CartResponse
from app.catalog.schemas import ProductResponse
from app.common.limits import MAX_WISHLIST_ITEMS
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderItem, OrderStatus
from app.orders.service import OrderItemDrop, OrderPriceChange
from app.telegram import messages
from app.wishlist.schemas import WishlistItemResponse, WishlistResponse


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


def test_order_deleted_stays_silent_on_what_was_already_finished() -> None:
    """Выданную заявку человек забрал, отменённую — списал; и то и другое он уже
    перестал ждать, а вот исчезнувшая PENDING без объяснения выглядит потерей."""
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")

    assert messages.order_deleted(order_id, OrderStatus.COMPLETED) is None
    assert messages.order_deleted(order_id, OrderStatus.CANCELLED_BY_CUSTOMER) is None
    for status in (OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.READY):
        text = messages.order_deleted(order_id, status)
        assert text is not None
        assert "#a1b2c3d4" in text


def test_order_item_repriced_names_both_prices_and_the_new_total() -> None:
    """Одна новая цена ни о чём не говорит: человек помнит сумму заявки, а не цену
    строки, и «стало 1 400» без «было 1 200» ему не с чем сравнить."""
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")

    text = messages.order_item_repriced(order_id, "Rose Serum", 120_000, 140_000, 280_000)

    assert "#a1b2c3d4" in text
    assert "Rose Serum" in text
    assert "выросла" in text
    assert messages.format_price(120_000) in text
    assert messages.format_price(140_000) in text
    assert messages.format_price(280_000) in text
    assert "снизилась" in messages.order_item_repriced(order_id, "X", 140_000, 120_000, 240_000)


def _price_change(order_id: uuid.UUID, total_cents: int) -> OrderPriceChange:
    return OrderPriceChange(
        order_id=order_id,
        user_id=uuid.uuid4(),
        product_name="Rose Serum",
        old_price_cents=120_000,
        new_price_cents=140_000,
        total_cents=total_cents,
    )


def test_orders_repriced_keeps_the_single_order_wording() -> None:
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")

    assert messages.orders_repriced([_price_change(order_id, 280_000)]) == (
        messages.order_item_repriced(order_id, "Rose Serum", 120_000, 140_000, 280_000)
    )


def test_orders_repriced_names_every_affected_order_in_one_text() -> None:
    """Товар лежит в нескольких неподтверждённых заявках одного человека — это норма, и
    новость про каждую обязана дойти. Telegram принимает примерно одно сообщение в
    секунду на чат, поэтому это одно сообщение, а не по одному на заявку."""
    first = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")
    second = uuid.UUID("b2c3d4e5-0000-0000-0000-000000000000")

    text = messages.orders_repriced(
        [_price_change(first, 280_000), _price_change(second, 420_000)]
    )

    assert "#a1b2c3d4" in text
    assert "#b2c3d4e5" in text
    assert messages.format_price(280_000) in text
    assert messages.format_price(420_000) in text
    assert text.count("выросла") == 2


def _drop(order_id: uuid.UUID, *, is_cancelled: bool, name: str = "Rose Serum") -> OrderItemDrop:
    return OrderItemDrop(
        order_id=order_id,
        user_id=uuid.uuid4(),
        product_name=name,
        total_cents=50_000,
        is_cancelled=is_cancelled,
    )


def test_orders_items_dropped_keeps_the_single_order_wording() -> None:
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")

    assert messages.orders_items_dropped([_drop(order_id, is_cancelled=False)]) == (
        messages.order_item_removed(order_id, "Rose Serum", 50_000)
    )
    assert messages.orders_items_dropped([_drop(order_id, is_cancelled=True)]) == (
        messages.order_cancelled_last_item_removed(order_id, "Rose Serum")
    )


def test_orders_items_dropped_folds_several_orders_into_one_text() -> None:
    """И несколько строк одной заявки — в одну строчку сообщения: заявка лишилась товаров
    один раз, а не по разу на товар."""
    first = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")
    second = uuid.UUID("b2c3d4e5-0000-0000-0000-000000000000")

    text = messages.orders_items_dropped(
        [
            _drop(first, is_cancelled=False, name="Rose Serum"),
            _drop(first, is_cancelled=False, name="Toner"),
            _drop(second, is_cancelled=True, name="Rose Serum"),
        ]
    )

    assert "2 ваших заявки" in text
    assert text.count("#a1b2c3d4") == 1
    assert "Rose Serum, Toner" in text
    assert "отменена" in text
    assert len(text.splitlines()) == 3


def test_order_item_removed_is_not_the_cancellation_text() -> None:
    """Убрать одну строку из трёх и отменить заявку целиком — разные новости, и «сумма
    заявки теперь 0» вместо второй из них не описывает случившегося."""
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")

    removed = messages.order_item_removed(order_id, "Rose Serum", 50_000)
    cancelled = messages.order_cancelled_last_item_removed(order_id, "Rose Serum")

    assert messages.format_price(50_000) in removed
    assert "отменена" not in removed
    assert "отменена" in cancelled
    assert "Rose Serum" in cancelled


def test_cart_last_chance_is_not_the_day_ahead_reminder_again() -> None:
    deadline = datetime(2030, 6, 12, 14, tzinfo=UTC)

    first = messages.cart_reminder("«Июнь»", deadline)
    last = messages.cart_last_chance("«Июнь»", deadline)

    assert first != last
    assert "Последний шанс" in last
    # Обе даты — в локальной зоне магазина, а не в UTC.
    assert messages.format_deadline(deadline) in last


def test_cart_moved_to_wishlist_counts_in_russian_and_owns_up_to_the_overflow() -> None:
    saved_only = messages.cart_moved_to_wishlist("«Июнь»", saved=2, dropped=0)
    with_overflow = messages.cart_moved_to_wishlist("«Июнь»", saved=1, dropped=5)

    assert "2 товара" in saved_only
    assert "избранном" in saved_only
    # Молчать о том, что часть корзины не влезла, — значит соврать про «сохранили».
    assert "не поместилось" not in saved_only
    assert "1 товар " in with_overflow
    assert f"5 товаров не поместилось — в избранном уже {MAX_WISHLIST_ITEMS}" in with_overflow


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


def _wishlist(names: list[str]) -> WishlistResponse:
    return WishlistResponse(
        items=[
            WishlistItemResponse(
                product=ProductResponse(
                    id=uuid.uuid4(),
                    name=name,
                    slug=f"slug-{index}",
                    description=None,
                    brand=None,
                    price_cents=125_000,
                    volume_ml=None,
                    category_id=None,
                    in_stock=True,
                    images=[],
                    deleted_at=None,
                ),
                added_at=datetime(2030, 6, 1, tzinfo=UTC),
            )
            for index, name in enumerate(names)
        ]
    )


def test_my_wishlist_empty_says_how_things_get_there() -> None:
    """Nobody arrives at an empty wishlist knowing how to fill it — the heart on a
    product card is the only way in, and it isn't in this chat."""
    text = messages.my_wishlist(_wishlist([]))

    assert "♥" in text


def test_my_wishlist_lists_products_with_prices() -> None:
    text = _normalize(messages.my_wishlist(_wishlist(["Крем для рук"])))

    assert "Крем для рук" in text
    assert "1 250 сом" in text


def test_my_wishlist_truncates_like_every_other_list_here() -> None:
    """A wishlist holds up to MAX_WISHLIST_ITEMS; a chat message that printed all of
    them would be scrolled past rather than read."""
    names = [f"Товар {index}" for index in range(messages.MAX_LISTED_WISHLIST_ITEMS + 3)]

    text = messages.my_wishlist(_wishlist(names))

    assert "ещё 3" in text
    assert names[-1] not in text


def test_current_deadline_between_cycles_is_not_an_error() -> None:
    assert "закрыт" in messages.current_deadline(None)


def test_cycle_deadline_changed_names_both_dates_and_the_direction() -> None:
    """Без прежнего срока сообщение неотличимо от обычного напоминания, а без
    направления («раньше»/«позже») человек не понимает, стало ли у него меньше времени."""
    cycle = OrderCycle(deadline_at=datetime(2030, 6, 10, 17, tzinfo=UTC), label="Июнь")

    text = messages.cycle_deadline_changed(cycle, datetime(2030, 6, 12, 17, tzinfo=UTC))

    assert "раньше" in text
    assert "10.06.2030" in text
    assert "12.06.2030" in text


def test_cycle_deadline_changed_does_not_hurry_a_postponed_cycle() -> None:
    cycle = OrderCycle(deadline_at=datetime(2030, 6, 14, 17, tzinfo=UTC), label="Июнь")

    text = messages.cycle_deadline_changed(cycle, datetime(2030, 6, 12, 17, tzinfo=UTC))

    assert "позже" in text
    assert "Успейте" not in text


def test_cycle_closed_for_customer_says_the_order_can_no_longer_be_changed() -> None:
    """Именно это и перестаёт работать на сайте в момент закрытия — иначе человек
    упирается в недоступные кнопки и считает их поломкой."""
    cycle = OrderCycle(deadline_at=datetime(2030, 6, 12, tzinfo=UTC), label="Июнь")

    text = messages.cycle_closed_for_customer(cycle)

    assert "«Июнь»" in text
    assert "нельзя" in text
