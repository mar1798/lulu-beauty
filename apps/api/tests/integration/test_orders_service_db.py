import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.orders.models import OrderStatus
from app.orders.service import EmptyCartError, NoActiveCycleError, OrdersService
from tests.integration.factories import (
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
