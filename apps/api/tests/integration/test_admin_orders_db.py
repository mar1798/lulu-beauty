import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.cart.models import CartItem
from app.cart.service import CartService
from app.catalog.models import Product
from app.cycles.models import CycleStatus, OrderCycle
from app.orders.models import ADMIN_ORDER_WINDOW, PURCHASE_WINDOW, Order, OrderStatus
from app.orders.service import (
    CustomerNotFoundError,
    LastOrderItemError,
    NoCycleForOrderError,
    OrderChangedError,
    OrderCycleUnavailableError,
    OrderItemNotFoundError,
    OrderNotEditableError,
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


async def _placed(session: AsyncSession, status: OrderStatus = OrderStatus.PENDING) -> Order:
    """An order of two lines — «Balm» ×1 at 1000 and «Serum» ×2 at 2000 — in `status`."""
    user = await make_user(session)
    await make_cycle(session)
    balm = await make_product(session, name="Balm", price_cents=1000)
    serum = await make_product(session, name="Serum", price_cents=2000)
    order, _ = await OrdersService(session).create_for_customer(
        user.id,
        uuid.uuid4(),
        user.id,
        None,
        [(variant_id(balm), 1), (variant_id(serum), 2)],
        None,
    )
    order.status = status
    await session.flush()
    return order


def _quantities(order: Order) -> dict[str, int]:
    return {item.product_name: item.quantity for item in order.items}


@pytest.mark.parametrize(
    "status", [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT, OrderStatus.CONFIRMED]
)
async def test_edit_rewrites_the_lines_and_leaves_the_status(
    db_session: AsyncSession, status: OrderStatus
) -> None:
    order = await _placed(db_session, status)
    balm, serum = order.items
    cream = await make_product(db_session, name="Cream", price_cents=500)
    revision = order.revision

    edited, changed = await OrdersService(db_session).edit_by_admin(
        order.id, revision, {balm.id: 3}, [(variant_id(cream), 2)]
    )

    assert changed is True
    assert _quantities(edited) == {"Balm": 3, "Cream": 2}
    assert edited.total_cents == 3 * 1000 + 2 * 500
    assert edited.status is status
    assert edited.revision == revision + 1
    assert serum not in edited.items


async def test_edit_keeps_the_snapshot_price_of_a_kept_line(db_session: AsyncSession) -> None:
    """The price the order was taken at stays; only an added line is at today's price."""
    order = await _placed(db_session, OrderStatus.CONFIRMED)
    balm = order.items[0]
    product = await db_session.get(Product, balm.product_id)
    assert product is not None
    product.variants[0].price_cents = 9999
    await db_session.flush()

    edited, _ = await OrdersService(db_session).edit_by_admin(
        order.id, order.revision, {balm.id: 2}, []
    )

    assert edited.items[0].product_price_cents == 1000
    assert edited.total_cents == 2000


async def test_edit_keeps_a_line_whose_product_left_the_catalogue(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session, OrderStatus.CONFIRMED)
    balm, serum = order.items
    product = await db_session.get(Product, balm.product_id)
    assert product is not None
    product.deleted_at = datetime.now(UTC)
    await db_session.flush()

    edited, _ = await OrdersService(db_session).edit_by_admin(
        order.id, order.revision, {balm.id: 2, serum.id: 2}, []
    )

    assert _quantities(edited) == {"Balm": 2, "Serum": 2}


async def test_edit_merges_an_added_volume_into_its_kept_line(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    assert balm.variant_id is not None

    edited, _ = await OrdersService(db_session).edit_by_admin(
        order.id, order.revision, {balm.id: 1, serum.id: 2}, [(balm.variant_id, 2)]
    )

    assert _quantities(edited) == {"Balm": 3, "Serum": 2}
    assert len(edited.items) == 2


async def test_edit_that_changes_nothing_reports_no_change(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    revision = order.revision

    edited, changed = await OrdersService(db_session).edit_by_admin(
        order.id, revision, {balm.id: 1, serum.id: 2}, []
    )

    assert changed is False
    assert edited.revision == revision


@pytest.mark.parametrize(
    "status",
    [
        OrderStatus.READY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED_BY_CUSTOMER,
        OrderStatus.CANCELLED_BY_OWNER,
    ],
)
async def test_edit_refuses_an_order_past_payment_or_cancelled(
    db_session: AsyncSession, status: OrderStatus
) -> None:
    order = await _placed(db_session, status)

    with pytest.raises(OrderNotEditableError):
        await OrdersService(db_session).edit_by_admin(
            order.id, order.revision, {order.items[0].id: 5}, []
        )


async def test_edit_refuses_a_draft_built_on_lines_that_moved(db_session: AsyncSession) -> None:
    """The customer changed a quantity while the owner's window was open."""
    order = await _placed(db_session)
    balm, serum = order.items
    stale = order.revision
    await OrdersService(db_session).set_item_quantity(order.user_id, order.id, serum.id, 5)

    with pytest.raises(OrderChangedError):
        await OrdersService(db_session).edit_by_admin(order.id, stale, {balm.id: 1}, [])

    assert _quantities(order) == {"Balm": 1, "Serum": 5}


async def test_edit_refuses_a_line_of_another_order(db_session: AsyncSession) -> None:
    order = await _placed(db_session)

    with pytest.raises(OrderItemNotFoundError):
        await OrdersService(db_session).edit_by_admin(
            order.id, order.revision, {uuid.uuid4(): 1}, []
        )


async def test_edit_refuses_to_leave_the_order_empty(db_session: AsyncSession) -> None:
    order = await _placed(db_session)

    with pytest.raises(LastOrderItemError):
        await OrdersService(db_session).edit_by_admin(order.id, order.revision, {}, [])


async def test_edit_refuses_an_unavailable_volume_and_changes_nothing(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    sold_out = await make_product(db_session, name="Gone", in_stock=False)

    with pytest.raises(ProductNotFoundError):
        await OrdersService(db_session).edit_by_admin(
            order.id, order.revision, {balm.id: 1}, [(variant_id(sold_out), 1)]
        )

    assert _quantities(order) == {"Balm": 1, "Serum": 2}
