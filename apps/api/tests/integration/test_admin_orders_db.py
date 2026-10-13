import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.cart.models import CartItem
from app.cart.service import CartService
from app.cycles.models import CycleStatus, OrderCycle
from app.orders.models import ADMIN_ORDER_WINDOW, PURCHASE_WINDOW, Order, OrderStatus
from app.orders.service import (
    CustomerNotFoundError,
    NoCycleForOrderError,
    OrderCycleUnavailableError,
    OrdersService,
    ProductNotFoundError,
)
from app.users.service import UsersService
from tests.integration.factories import make_cycle, make_product, make_user, variant_id


async def _closed_cycle(
    session: AsyncSession, closed_ago: timedelta, label: str = "Closed"
) -> OrderCycle:
    closed_at = datetime.now(UTC) - closed_ago
    cycle = await make_cycle(session, deadline_at=closed_at, label=label, status=CycleStatus.CLOSED)
    cycle.closed_at = closed_at
    await session.flush()
    return cycle


def test_the_window_stays_inside_the_purchase_window() -> None:
    """Past PURCHASE_WINDOW a fresh order would greet its customer as a delayed one."""
    assert ADMIN_ORDER_WINDOW <= PURCHASE_WINDOW


async def test_cycles_offer_the_open_one_first_then_recently_closed(
    db_session: AsyncSession,
) -> None:
    older = await _closed_cycle(db_session, timedelta(days=2), "Older")
    recent = await _closed_cycle(db_session, timedelta(hours=5), "Recent")
    await _closed_cycle(db_session, ADMIN_ORDER_WINDOW + timedelta(hours=1), "Too old")
    open_cycle = await make_cycle(db_session, label="Open")

    targets = await OrdersService(db_session).admin_order_cycles()

    assert [target.cycle.id for target in targets] == [open_cycle.id, recent.id, older.id]
    assert [target.is_open for target in targets] == [True, False, False]


async def test_a_cycle_closed_early_counts_from_closed_at(db_session: AsyncSession) -> None:
    """Closed by the owner a week before its deadline — still within the window."""
    cycle = await make_cycle(
        db_session, deadline_at=datetime.now(UTC) + timedelta(days=7), status=CycleStatus.CLOSED
    )
    cycle.closed_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()

    targets = await OrdersService(db_session).admin_order_cycles()

    assert [(target.cycle.id, target.is_open) for target in targets] == [(cycle.id, False)]


async def test_cycles_name_the_customers_open_orders_in_them(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    other = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)
    lines = [(variant_id(product), 1)]
    first, _ = await service.create_for_customer(
        admin.id, uuid.uuid4(), customer.id, None, lines, None
    )
    cancelled, _ = await service.create_for_customer(
        admin.id, uuid.uuid4(), customer.id, None, lines, None
    )
    cancelled.status = OrderStatus.CANCELLED_BY_OWNER
    await service.create_for_customer(admin.id, uuid.uuid4(), other.id, None, lines, None)
    await db_session.flush()

    [target] = await service.admin_order_cycles(customer.id)

    assert target.cycle.id == cycle.id
    assert target.customer_order_ids == [first.id]


async def test_creates_a_pending_order_at_catalogue_prices(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    cycle = await make_cycle(db_session)
    serum = await make_product(
        db_session, name="Serum", variants=[(30, 1500, True), (50, 2200, True)]
    )
    cream = await make_product(db_session, name="Cream", price_cents=900)
    # The customer's own cart is theirs, and stays as it was.
    await CartService(db_session).add_item(customer.id, variant_id(cream), 1)

    order, _ = await OrdersService(db_session).create_for_customer(
        admin.id,
        uuid.uuid4(),
        customer.id,
        None,
        [(variant_id(serum, 50), 1), (variant_id(cream), 2), (variant_id(serum, 50), 2)],
        "Позвонить",
    )

    assert order.cycle_id == cycle.id
    assert order.user_id == customer.id
    assert order.created_by_id == admin.id
    assert order.status is OrderStatus.PENDING
    assert order.note == "Позвонить"
    assert [(item.product_name, item.product_volume_ml, item.quantity) for item in order.items] == [
        ("Serum", 50, 3),
        ("Cream", None, 2),
    ]
    assert order.total_cents == 2200 * 3 + 900 * 2
    assert len((await db_session.execute(select(CartItem))).scalars().all()) == 1


async def test_goes_into_a_recently_closed_cycle_when_nothing_is_open(
    db_session: AsyncSession,
) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    closed = await _closed_cycle(db_session, timedelta(days=1))
    product = await make_product(db_session)

    service = OrdersService(db_session)
    order, _ = await service.create_for_customer(
        admin.id, uuid.uuid4(), customer.id, None, [(variant_id(product), 1)], None
    )

    assert order.cycle_id == closed.id
    # Cancellable, not editable — the same order a customer would have in that cycle.
    flags = (await service.customer_flags([order]))[order.id]
    assert (flags.is_editable, flags.is_cancellable) == (False, True)


async def test_the_owner_may_pick_the_closed_cycle_over_the_open_one(
    db_session: AsyncSession,
) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    closed = await _closed_cycle(db_session, timedelta(days=1))
    await make_cycle(db_session)
    product = await make_product(db_session)

    order, _ = await OrdersService(db_session).create_for_customer(
        admin.id, uuid.uuid4(), customer.id, closed.id, [(variant_id(product), 1)], None
    )

    assert order.cycle_id == closed.id


async def test_refuses_a_cycle_closed_too_long_ago(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    old = await _closed_cycle(db_session, ADMIN_ORDER_WINDOW + timedelta(hours=1))
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)

    with pytest.raises(OrderCycleUnavailableError):
        await service.create_for_customer(
            admin.id, uuid.uuid4(), customer.id, old.id, [(variant_id(product), 1)], None
        )


async def test_refuses_when_no_cycle_fits(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    await _closed_cycle(db_session, ADMIN_ORDER_WINDOW + timedelta(hours=1))
    product = await make_product(db_session)

    with pytest.raises(NoCycleForOrderError):
        await OrdersService(db_session).create_for_customer(
            admin.id, uuid.uuid4(), customer.id, None, [(variant_id(product), 1)], None
        )


async def test_refuses_an_erased_customer(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await UsersService(db_session).delete_account(customer.id)

    with pytest.raises(CustomerNotFoundError):
        await OrdersService(db_session).create_for_customer(
            admin.id, uuid.uuid4(), customer.id, None, [(variant_id(product), 1)], None
        )


@pytest.mark.parametrize("unavailable", ["out_of_stock", "deleted"])
async def test_refuses_the_whole_order_over_one_unavailable_line(
    db_session: AsyncSession, unavailable: str
) -> None:
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    await make_cycle(db_session)
    fine = await make_product(db_session, name="Fine")
    gone = await make_product(
        db_session,
        name="Gone",
        in_stock=unavailable != "out_of_stock",
        deleted_at=datetime.now(UTC) if unavailable == "deleted" else None,
    )

    with pytest.raises(ProductNotFoundError):
        await OrdersService(db_session).create_for_customer(
            admin.id,
            uuid.uuid4(),
            customer.id,
            None,
            [(variant_id(fine), 1), (gone.variants[0].id, 1)],
            None,
        )


async def test_creators_are_loaded_for_admin_orders_only(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, role=Role.ADMIN, name="Админ")
    customer = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(customer.id, variant_id(product), 1)
    service = OrdersService(db_session)
    own = await service.checkout(customer.id, None)
    placed, _ = await service.create_for_customer(
        admin.id, uuid.uuid4(), customer.id, None, [(variant_id(product), 1)], None
    )

    assert await service.load_creators([own]) == {}
    creators = await service.load_creators([own, placed])
    assert {user_id: user.name for user_id, user in creators.items()} == {admin.id: "Админ"}


async def test_a_repeated_request_returns_the_order_it_already_made(
    db_session: AsyncSession,
) -> None:
    """A double click or a resend: one order, and the second call says it made none."""
    admin = await make_user(db_session, role=Role.ADMIN)
    customer = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = OrdersService(db_session)
    request_id = uuid.uuid4()
    lines = [(variant_id(product), 1)]

    first, created = await service.create_for_customer(
        admin.id, request_id, customer.id, None, lines, None
    )
    again, created_again = await service.create_for_customer(
        admin.id, request_id, customer.id, None, lines, None
    )

    assert (created, created_again) == (True, False)
    assert again.id == first.id
    assert len((await db_session.execute(select(Order))).scalars().all()) == 1
