import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import CartItem
from app.cart.service import CartService
from app.orders.service import EmptyCartError, NoActiveCycleError, OrdersService
from tests.integration.factories import make_cycle, make_product, make_user


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
