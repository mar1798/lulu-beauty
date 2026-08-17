import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.db import async_session
from app.orders.models import Order, OrderItem, OrderStatus
from app.orders.schemas import MAX_ITEM_QUANTITY
from app.orders.service import (
    EmptyCartError,
    LastOrderItemError,
    NoActiveCycleError,
    OrderNotEditableError,
    OrderNotFoundError,
    OrderNotRestorableError,
    OrdersService,
    ProductNotFoundError,
    StatusNotAssignableError,
)
from tests.integration.factories import (
    make_category,
    make_cycle,
    make_product,
    make_product_image,
    make_user,
)


async def test_checkout_snapshots_items_and_clears_cart(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session, name="Rose Serum", price_cents=1500)
    await CartService(db_session).add_item(user.id, product.id, 3)

    order = await OrdersService(db_session).checkout(user.id, note="Ring the bell")

    assert order.cycle_id == cycle.id
    assert order.total_cents == 4500
    assert order.note == "Ring the bell"
    assert len(order.items) == 1
    assert order.items[0].product_name == "Rose Serum"
    assert order.items[0].product_price_cents == 1500
    assert order.items[0].quantity == 3

    remaining_items = (await db_session.execute(select(CartItem))).scalars().all()
    assert remaining_items == []


async def test_checkout_snapshot_survives_later_product_price_change(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1000)
    await CartService(db_session).add_item(user.id, product.id, 1)

    order = await OrdersService(db_session).checkout(user.id, note=None)

    product.price_cents = 9999
    await db_session.flush()

    reloaded = await OrdersService(db_session).get_for_user(user.id, order.id)
    assert reloaded.items[0].product_price_cents == 1000
    assert reloaded.total_cents == 1000


async def test_checkout_with_empty_cart_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)

    with pytest.raises(EmptyCartError):
        await OrdersService(db_session).checkout(user.id, note=None)


async def test_checkout_without_active_cycle_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)

    with pytest.raises(NoActiveCycleError):
        await OrdersService(db_session).checkout(user.id, note=None)


async def test_checkout_snapshots_slug_and_primary_image(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, slug="rose-serum")
    await make_product_image(db_session, product, url="secondary.jpg", sort_order=1)
    await make_product_image(db_session, product, url="primary.jpg", sort_order=2, is_primary=True)
    await CartService(db_session).add_item(user.id, product.id, 1)

    order = await OrdersService(db_session).checkout(user.id, note=None)

    assert order.items[0].product_slug == "rose-serum"
    assert order.items[0].product_image_url == "primary.jpg"


async def test_order_snapshot_survives_product_slug_and_image_changes(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, slug="original-slug")
    image = await make_product_image(db_session, product, url="original.jpg", is_primary=True)
    await CartService(db_session).add_item(user.id, product.id, 1)

    order = await OrdersService(db_session).checkout(user.id, note=None)

    product.slug = "renamed-slug"
    image.url = "replaced.jpg"
    await db_session.flush()

    reloaded = await OrdersService(db_session).get_for_user(user.id, order.id)
    assert reloaded.items[0].product_slug == "original-slug"
    assert reloaded.items[0].product_image_url == "original.jpg"


async def test_load_customers_batches_users_for_admin_listing(db_session: AsyncSession) -> None:
    first = await make_user(db_session, phone="+996700000001")
    second = await make_user(db_session, phone="+996700000002")
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)

    for user in (first, second):
        await CartService(db_session).add_item(user.id, product.id, 1)
        await service.checkout(user.id, note=None)

    orders = await service.list_admin(None)
    customers = await service.load_customers(orders)

    assert {customer.phone for customer in customers.values()} == {
        "+996700000001",
        "+996700000002",
    }


async def test_load_customers_on_empty_list_does_not_query(db_session: AsyncSession) -> None:
    assert await OrdersService(db_session).load_customers([]) == {}


async def test_load_item_tags_reads_the_live_catalog(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    category = await make_category(db_session, name="Тонеры")
    product = await make_product(
        db_session, brand="Round lab", volume_ml=500, category_id=category.id
    )
    service = OrdersService(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    order = await service.checkout(user.id, note=None)

    # A catalog edit after checkout: the labels only describe the product, so unlike the
    # name and the price they are expected to follow it.
    product.brand = "Round Lab"
    await db_session.flush()

    tags = await service.load_item_tags([order])

    assert tags[product.id].brand == "Round Lab"
    assert tags[product.id].category_name == "Тонеры"
    assert tags[product.id].volume_ml == 500


async def test_load_item_tags_survives_a_product_without_category_or_volume(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, brand=None)
    service = OrdersService(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    order = await service.checkout(user.id, note=None)

    tags = await service.load_item_tags([order])

    assert tags[product.id].brand is None
    assert tags[product.id].category_name is None
    assert tags[product.id].volume_ml is None


async def test_load_item_tags_on_empty_list_does_not_query(db_session: AsyncSession) -> None:
    assert await OrdersService(db_session).load_item_tags([]) == {}


async def test_list_admin_page_filters_by_status_and_paginates(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)

    orders = []
    for _ in range(3):
        await CartService(db_session).add_item(user.id, product.id, 1)
        orders.append(await service.checkout(user.id, note=None))

    await service.update_status(orders[0].id, OrderStatus.CONFIRMED)

    confirmed, total = await service.list_admin_page(None, OrderStatus.CONFIRMED, 1, 20)
    assert total == 1
    assert [order.id for order in confirmed] == [orders[0].id]

    first_page, total_all = await service.list_admin_page(None, None, 1, 2)
    assert total_all == 3
    assert len(first_page) == 2

    second_page, _ = await service.list_admin_page(None, None, 2, 2)
    assert len(second_page) == 1


async def test_list_admin_filters_by_cycle(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    cycle_a = await make_cycle(db_session, label="Cycle A")
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    order_a = await OrdersService(db_session).checkout(user.id, note=None)

    orders_in_a = await OrdersService(db_session).list_admin(cycle_a.id)
    assert [order.id for order in orders_in_a] == [order_a.id]

    other_cycle = await make_cycle(db_session, label="Cycle B")
    orders_in_other = await OrdersService(db_session).list_admin(other_cycle.id)
    assert orders_in_other == []


async def _order_with_items(
    db_session: AsyncSession, *, lines: int = 2, quantity: int = 1
) -> tuple[uuid.UUID, Order]:
    """A checked-out order in an open cycle — the starting point for every editing test."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    cart = CartService(db_session)
    for index in range(lines):
        product = await make_product(db_session, name=f"Product {index}", price_cents=1000)
        await cart.add_item(user.id, product.id, quantity)

    order = await OrdersService(db_session).checkout(user.id, note="original")
    return user.id, order


async def test_new_order_is_editable(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session)

    flags = await OrdersService(db_session).customer_flags([order])

    assert flags[order.id].is_editable is True
    # Nothing to restore: the order was never cancelled.
    assert flags[order.id].is_restorable is False


async def test_order_is_not_editable_once_owner_moved_it_off_pending(
    db_session: AsyncSession,
) -> None:
    _, order = await _order_with_items(db_session)
    order.status = OrderStatus.CONFIRMED
    await db_session.flush()

    flags = await OrdersService(db_session).customer_flags([order])

    assert flags[order.id].is_editable is False


async def test_order_is_not_editable_after_the_deadline(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)

    cycle.deadline_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.flush()

    flags = await OrdersService(db_session).customer_flags([order])

    assert flags[order.id].is_editable is False


async def test_set_item_quantity_recalculates_the_total(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=2)
    service = OrdersService(db_session)

    updated = await service.set_item_quantity(user_id, order.id, order.items[0].id, 4)

    assert updated.items[0].quantity == 4
    assert updated.total_cents == 5000


async def test_set_item_quantity_keeps_the_snapshot_price(db_session: AsyncSession) -> None:
    """Editing must not silently re-price the order against the current catalog."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1000)
    await CartService(db_session).add_item(user.id, product.id, 1)
    service = OrdersService(db_session)
    order = await service.checkout(user.id, note=None)

    product.price_cents = 9999
    await db_session.flush()

    updated = await service.set_item_quantity(user.id, order.id, order.items[0].id, 2)

    assert updated.items[0].product_price_cents == 1000
    assert updated.total_cents == 2000


async def test_add_item_appends_a_line_and_recalculates(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=1)
    product = await make_product(db_session, name="Forgotten Cream", price_cents=2500)
    await make_product_image(db_session, product, url="http://x/new.jpg", is_primary=True)
    service = OrdersService(db_session)

    updated = await service.add_item(user_id, order.id, product.id, 2)

    assert len(updated.items) == 2
    added = next(item for item in updated.items if item.product_id == product.id)
    assert added.product_name == "Forgotten Cream"
    assert added.product_slug == product.slug
    assert added.product_image_url == "http://x/new.jpg"
    assert added.product_price_cents == 2500
    assert added.quantity == 2
    assert updated.total_cents == 1000 + 5000


async def test_add_item_merges_into_the_line_that_is_already_there(
    db_session: AsyncSession,
) -> None:
    """One line per product, as at checkout — a second row would be the owner's problem."""
    user_id, order = await _order_with_items(db_session, lines=1, quantity=2)
    service = OrdersService(db_session)
    product_id = order.items[0].product_id
    assert product_id is not None

    updated = await service.add_item(user_id, order.id, product_id, 3)

    assert len(updated.items) == 1
    assert updated.items[0].quantity == 5
    assert updated.total_cents == 5000


async def test_add_item_prices_the_new_line_from_the_current_catalog(
    db_session: AsyncSession,
) -> None:
    """The old line keeps its checkout price; the new one joins at today's."""
    user_id, order = await _order_with_items(db_session, lines=1)
    later = await make_product(db_session, name="Later", price_cents=3000)
    service = OrdersService(db_session)

    updated = await service.add_item(user_id, order.id, later.id, 1)

    prices = {item.product_name: item.product_price_cents for item in updated.items}
    assert prices == {"Product 0": 1000, "Later": 3000}


async def test_add_item_clamps_the_merged_quantity_to_the_ceiling(
    db_session: AsyncSession,
) -> None:
    user_id, order = await _order_with_items(db_session, lines=1, quantity=998)
    service = OrdersService(db_session)
    product_id = order.items[0].product_id
    assert product_id is not None

    updated = await service.add_item(user_id, order.id, product_id, 5)

    assert updated.items[0].quantity == MAX_ITEM_QUANTITY


async def test_add_item_refuses_a_soft_deleted_product(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=1)
    gone = await make_product(db_session, name="Gone", deleted_at=datetime.now(UTC))

    with pytest.raises(ProductNotFoundError):
        await OrdersService(db_session).add_item(user_id, order.id, gone.id, 1)


async def test_add_item_refuses_a_product_that_never_existed(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=1)

    with pytest.raises(ProductNotFoundError):
        await OrdersService(db_session).add_item(user_id, order.id, uuid.uuid4(), 1)


async def test_remove_item_drops_the_line_and_recalculates(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=2)
    service = OrdersService(db_session)
    removed_id, kept_id = order.items[0].id, order.items[1].id

    updated = await service.remove_item(user_id, order.id, removed_id)

    assert [item.id for item in updated.items] == [kept_id]
    assert updated.total_cents == 1000


async def test_remove_last_item_is_refused(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=1)

    with pytest.raises(LastOrderItemError):
        await OrdersService(db_session).remove_item(user_id, order.id, order.items[0].id)


async def test_editing_someone_elses_order_is_a_not_found(db_session: AsyncSession) -> None:
    _, order = await _order_with_items(db_session)
    stranger = await make_user(db_session)

    with pytest.raises(OrderNotFoundError):
        await OrdersService(db_session).set_item_quantity(
            stranger.id, order.id, order.items[0].id, 2
        )


async def test_editing_a_confirmed_order_is_refused(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session)
    order.status = OrderStatus.CONFIRMED
    await db_session.flush()
    service = OrdersService(db_session)

    with pytest.raises(OrderNotEditableError):
        await service.set_item_quantity(user_id, order.id, order.items[0].id, 2)
    with pytest.raises(OrderNotEditableError):
        await service.update_note(user_id, order.id, "too late")
    with pytest.raises(OrderNotEditableError):
        await service.cancel(user_id, order.id)
    with pytest.raises(OrderNotEditableError):
        await service.add_item(user_id, order.id, uuid.uuid4(), 1)


async def test_update_note_replaces_it_and_accepts_clearing(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session)
    service = OrdersService(db_session)

    assert (await service.update_note(user_id, order.id, "call me")).note == "call me"
    assert (await service.update_note(user_id, order.id, None)).note is None


async def test_cancel_marks_the_order_and_closes_further_editing(
    db_session: AsyncSession,
) -> None:
    user_id, order = await _order_with_items(db_session)
    service = OrdersService(db_session)

    cancelled = await service.cancel(user_id, order.id)

    assert cancelled.status == OrderStatus.CANCELLED_BY_CUSTOMER
    # The order stays visible to the owner, but the customer can no longer touch it.
    assert (await service.customer_flags([cancelled]))[order.id].is_editable is False
    with pytest.raises(OrderNotEditableError):
        await service.cancel(user_id, order.id)


async def test_a_cancelled_order_is_restorable_while_the_cycle_collects(
    db_session: AsyncSession,
) -> None:
    user_id, order = await _order_with_items(db_session)
    service = OrdersService(db_session)

    cancelled = await service.cancel(user_id, order.id)

    flags = (await service.customer_flags([cancelled]))[order.id]
    assert flags.is_restorable is True
    assert flags.is_editable is False


async def test_restore_puts_the_order_back_with_its_lines_and_total(
    db_session: AsyncSession,
) -> None:
    user_id, order = await _order_with_items(db_session, lines=2)
    service = OrdersService(db_session)
    total_before = order.total_cents
    await service.cancel(user_id, order.id)

    restored = await service.restore(user_id, order.id)

    assert restored.status == OrderStatus.PENDING
    # Cancelling never touched the lines, so restoring has nothing to rebuild.
    assert len(restored.items) == 2
    assert restored.total_cents == total_before
    # And the order is editable again — restoring is the exact inverse of cancelling.
    assert (await service.customer_flags([restored]))[order.id].is_editable is True


async def test_restore_of_an_order_that_was_never_cancelled_is_refused(
    db_session: AsyncSession,
) -> None:
    user_id, order = await _order_with_items(db_session)

    with pytest.raises(OrderNotRestorableError):
        await OrdersService(db_session).restore(user_id, order.id)


async def test_restore_after_the_deadline_is_refused(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, product.id, 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    service = OrdersService(db_session)
    await service.cancel(user.id, order.id)

    cycle.deadline_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.flush()

    assert (await service.customer_flags([order]))[order.id].is_restorable is False
    with pytest.raises(OrderNotRestorableError):
        await service.restore(user.id, order.id)


async def test_restoring_someone_elses_order_is_a_not_found(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session)
    service = OrdersService(db_session)
    await service.cancel(user_id, order.id)
    stranger = await make_user(db_session)

    with pytest.raises(OrderNotFoundError):
        await service.restore(stranger.id, order.id)


async def test_a_finished_order_is_neither_editable_nor_restorable(
    db_session: AsyncSession,
) -> None:
    """COMPLETED is the owner's word about a real purchase — no way back from it."""
    _, order = await _order_with_items(db_session)
    order.status = OrderStatus.COMPLETED
    await db_session.flush()

    flags = (await OrdersService(db_session).customer_flags([order]))[order.id]

    assert flags.is_editable is False
    assert flags.is_restorable is False


async def test_admin_delete_removes_the_order_and_its_items(db_session: AsyncSession) -> None:
    user_id, order = await _order_with_items(db_session, lines=2)
    service = OrdersService(db_session)

    deleted = await service.delete(order.id)
    await db_session.flush()

    # Снято до удаления: после коммита читать уже нечего, а покупателю надо написать.
    assert deleted.order_id == order.id
    assert deleted.user_id == user_id
    assert deleted.status == order.status
    with pytest.raises(OrderNotFoundError):
        await service.get_for_user(user_id, order.id)
    leftover_items = (
        (await db_session.execute(select(OrderItem).where(OrderItem.order_id == order.id)))
        .scalars()
        .all()
    )
    assert leftover_items == []


async def test_admin_delete_of_a_missing_order_raises(db_session: AsyncSession) -> None:
    with pytest.raises(OrderNotFoundError):
        await OrdersService(db_session).delete(uuid.uuid4())


async def test_list_for_user_paginates_newest_first_and_reports_the_total(
    db_session: AsyncSession,
) -> None:
    """История заявок не ограничена ничем, кроме пагинации.

    Покупатель, заказывающий каждый сбор, иначе получал бы всю историю разом — и
    каждую заявку со всеми её позициями.
    """
    user = await make_user(db_session)
    stranger = await make_user(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)

    placed = []
    for index in range(5):
        cycle = await make_cycle(
            db_session, deadline_at=datetime.now(UTC) + timedelta(hours=index + 1)
        )
        await CartService(db_session).add_item(user.id, product.id, 1)
        order = await service.checkout(user.id, note=None)
        # Явные метки времени: заявки создаются в одной транзакции, и полагаться
        # на разрешение created_at для проверки порядка нельзя.
        order.created_at = datetime.now(UTC) - timedelta(days=5 - index)
        placed.append(order)
        cycle.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
        await db_session.flush()

    newest_first = list(reversed([order.id for order in placed]))

    first_page, total = await service.list_for_user(user.id, page=1, page_size=2)
    assert total == 5
    assert [order.id for order in first_page] == newest_first[:2]

    second_page, _ = await service.list_for_user(user.id, page=2, page_size=2)
    assert [order.id for order in second_page] == newest_first[2:4]

    last_page, _ = await service.list_for_user(user.id, page=3, page_size=2)
    assert [order.id for order in last_page] == newest_first[4:]

    # За пределами последней страницы — пусто, но общее число по-прежнему честное.
    beyond, beyond_total = await service.list_for_user(user.id, page=4, page_size=2)
    assert (beyond, beyond_total) == ([], 5)

    # Чужие заявки не попадают ни в страницу, ни в счётчик.
    assert await service.list_for_user(stranger.id, page=1, page_size=2) == ([], 0)


async def test_two_simultaneous_checkouts_produce_one_order(db_session: AsyncSession) -> None:
    """A double tap on "оформить" is two transactions over one cart.

    Both used to read the same lines and both wrote a full-price order out of them: the
    customer saw one list, the owner got two identical заявки and bought twice. The cart
    row is locked now, so the second transaction waits at the cart and only reaches the
    items once the winner has emptied them.

    Staged rather than merely concurrent: the two have to overlap in the one window that
    matters — the loser reading the cart while the winner is past its own read and not yet
    committed — and `asyncio.gather` alone does not guarantee landing in it.
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1500)
    await CartService(db_session).add_item(user.id, product.id, 2)
    await db_session.commit()

    loser_started = asyncio.Event()

    async def winner() -> str:
        async with async_session() as session:
            await OrdersService(session).checkout(user.id, note=None)
            # Holds the lock while the loser tries to take it.
            await loser_started.wait()
            await asyncio.sleep(0.3)
            await session.commit()
            return "ordered"

    async def loser() -> str:
        async with async_session() as session:
            loser_started.set()
            try:
                await OrdersService(session).checkout(user.id, note=None)
                await session.commit()
            except EmptyCartError:
                await session.rollback()
                return "empty"
            return "ordered"

    outcomes = await asyncio.gather(winner(), loser())

    assert outcomes == ["ordered", "empty"]
    orders = (await db_session.execute(select(Order).where(Order.user_id == user.id))).scalars()
    assert len(list(orders)) == 1


# ─── Catalog edits reaching pending orders ───────────────────────────────────────


async def _order_with(
    session: AsyncSession, *, price_cents: int, quantity: int = 2
) -> tuple[Order, uuid.UUID]:
    """A pending order holding one product, plus that product's id."""
    user = await make_user(session)
    await make_cycle(session)
    product = await make_product(session, name="Rose Serum", price_cents=price_cents)
    await CartService(session).add_item(user.id, product.id, quantity)
    order = await OrdersService(session).checkout(user.id, note=None)
    return order, product.id


async def test_reprice_product_updates_pending_orders(db_session: AsyncSession) -> None:
    order, product_id = await _order_with(db_session, price_cents=1000, quantity=2)

    changes = await OrdersService(db_session).reprice_product(product_id, 1500)

    assert order.items[0].product_price_cents == 1500
    assert order.total_cents == 3000
    assert len(changes) == 1
    assert changes[0].order_id == order.id
    assert changes[0].user_id == order.user_id
    assert changes[0].product_name == "Rose Serum"
    assert changes[0].old_price_cents == 1000
    assert changes[0].new_price_cents == 1500
    assert changes[0].total_cents == 3000


async def test_reprice_product_covers_every_pending_order_of_one_customer(
    db_session: AsyncSession,
) -> None:
    """One customer, several pending orders holding the product — a person orders in every
    cycle, and the price has to move in all of them, newest first."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, name="Rose Serum", price_cents=1000)
    orders = OrdersService(db_session)

    placed = []
    for index, quantity in enumerate((1, 2, 3)):
        await CartService(db_session).add_item(user.id, product.id, quantity)
        order = await orders.checkout(user.id, note=None)
        # created_at defaults to now(), which in Postgres is the *transaction* timestamp —
        # all three checkouts share it here, unlike three separate requests in production.
        order.created_at = datetime.now(UTC) + timedelta(minutes=index)
        placed.append(order)
    await db_session.flush()

    changes = await orders.reprice_product(product.id, 1500)

    assert [change.order_id for change in changes] == [order.id for order in reversed(placed)]
    assert [order.total_cents for order in placed] == [1500, 3000, 4500]


async def test_reprice_product_reports_nothing_when_price_is_unchanged(
    db_session: AsyncSession,
) -> None:
    """The router calls this on every price field that was *sent*, not every one that
    differs — a PATCH re-submitting the same number must not notify anyone."""
    _, product_id = await _order_with(db_session, price_cents=1000)

    assert await OrdersService(db_session).reprice_product(product_id, 1000) == []


async def test_reprice_product_leaves_confirmed_orders_alone(db_session: AsyncSession) -> None:
    """Past PENDING the owner has already bought against the list: the snapshot stands."""
    order, product_id = await _order_with(db_session, price_cents=1000, quantity=2)
    order.status = OrderStatus.CONFIRMED
    await db_session.flush()

    changes = await OrdersService(db_session).reprice_product(product_id, 1500)

    assert changes == []
    assert order.items[0].product_price_cents == 1000
    assert order.total_cents == 2000


async def test_drop_product_removes_the_line_and_recomputes_the_total(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    kept = await make_product(db_session, name="Toner", price_cents=500)
    dropped = await make_product(db_session, name="Rose Serum", price_cents=1000)
    cart = CartService(db_session)
    await cart.add_item(user.id, kept.id, 1)
    await cart.add_item(user.id, dropped.id, 2)
    order = await OrdersService(db_session).checkout(user.id, note=None)

    drops = await OrdersService(db_session).drop_product(dropped.id)

    assert [item.product_name for item in order.items] == ["Toner"]
    assert order.total_cents == 500
    assert order.status == OrderStatus.PENDING
    assert len(drops) == 1
    assert drops[0].product_name == "Rose Serum"
    assert drops[0].total_cents == 500
    assert drops[0].is_cancelled is False


async def test_drop_product_cancels_an_order_left_with_nothing(
    db_session: AsyncSession,
) -> None:
    """An empty order is not something either side can act on — it's cancelled instead."""
    order, product_id = await _order_with(db_session, price_cents=1000)

    drops = await OrdersService(db_session).drop_product(product_id)

    assert order.items == []
    assert order.status == OrderStatus.CANCELLED_BY_OWNER
    assert drops[0].is_cancelled is True

    # And it can't be walked back into an order with nothing in it.
    flags = await OrdersService(db_session).customer_flags([order])
    assert flags[order.id].is_restorable is False
    with pytest.raises(OrderNotRestorableError):
        await OrdersService(db_session).restore(order.user_id, order.id)


async def test_owner_cannot_mark_an_order_cancelled_by_the_customer(
    db_session: AsyncSession,
) -> None:
    """«Отменена покупателем» — утверждение о его действии; у владельца своя отмена."""
    order, _ = await _order_with(db_session, price_cents=1000)
    service = OrdersService(db_session)

    with pytest.raises(StatusNotAssignableError):
        await service.update_status(order.id, OrderStatus.CANCELLED_BY_CUSTOMER)

    updated, changed = await service.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert changed is True
    assert updated.status == OrderStatus.CANCELLED_BY_OWNER
    # Отмена владельца обратима, пока сбор открыт, — как и отмена покупателя.
    assert (await service.customer_flags([updated]))[order.id].is_restorable is True
