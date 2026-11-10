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
from app.orders.models import (
    ADMIN_ORDER_WINDOW,
    PURCHASE_WINDOW,
    DiscountKind,
    Order,
    OrderStatus,
)
from app.orders.service import (
    CustomerNotFoundError,
    DiscountExceedsTotalError,
    DiscountRoundsToZeroError,
    LastOrderItemError,
    NoCycleForOrderError,
    OrderChangedError,
    OrderCycleUnavailableError,
    OrderHasReceiptError,
    OrderItemNotFoundError,
    OrderNotDiscountableError,
    OrderNotEditableError,
    OrdersService,
    ProductNotFoundError,
)
from app.payments.models import PaymentReceipt, ReceiptKind
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


# --- Discounts ------------------------------------------------------------------------
# `_placed` is «Balm» ×1 at 1000 and «Serum» ×2 at 2000: 5000 in all.


@pytest.mark.parametrize("status", [OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT])
async def test_discount_on_a_line_lowers_the_total_and_leaves_the_status(
    db_session: AsyncSession, status: OrderStatus
) -> None:
    order = await _placed(db_session, status)
    serum = order.items[1]
    revision = order.revision

    discounted, change = await OrdersService(db_session).set_discount(
        order.id, revision, serum.id, (DiscountKind.PERCENT, 10), "Помятая коробка"
    )

    assert change is not None and change.previous_total_cents == 5000
    assert discounted.total_cents == 5000 - 400
    assert discounted.status is status
    assert discounted.revision == revision + 1
    assert serum.discount_note == "Помятая коробка"


async def test_discount_on_the_order_comes_after_the_lines(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, order.items[0].id, (DiscountKind.AMOUNT, 1000), None
    )

    order, change = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 50), "Акция"
    )

    assert change is not None and change.previous_total_cents == 4000
    assert order.total_cents == 2000
    assert order.discount_note == "Акция"


async def test_setting_the_same_discount_again_is_no_change(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.AMOUNT, 500), "Акция"
    )
    revision = order.revision

    order, change = await service.set_discount(
        order.id, revision, None, (DiscountKind.AMOUNT, 500), "Акция"
    )

    assert change is None
    assert order.revision == revision


async def test_removing_a_discount_restores_the_total(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.AMOUNT, 500), "Акция"
    )

    order, change = await service.set_discount(order.id, order.revision, None, None, None)

    assert change is not None and change.previous_total_cents == 4500 and change.kind is None
    assert order.total_cents == 5000
    assert (order.discount_kind, order.discount_value, order.discount_note) == (None, None, None)


async def test_removing_a_discount_that_is_not_there_is_no_change(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)

    _, change = await OrdersService(db_session).set_discount(
        order.id, order.revision, None, None, None
    )

    assert change is None


@pytest.mark.parametrize(
    "status",
    [
        OrderStatus.CONFIRMED,
        OrderStatus.READY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED_BY_OWNER,
        OrderStatus.CANCELLED_BY_CUSTOMER,
    ],
)
async def test_discount_refuses_an_order_past_payment_or_cancelled(
    db_session: AsyncSession, status: OrderStatus
) -> None:
    order = await _placed(db_session, status)

    with pytest.raises(OrderNotDiscountableError):
        await OrdersService(db_session).set_discount(
            order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
        )


async def test_discount_refuses_a_stale_revision(db_session: AsyncSession) -> None:
    order = await _placed(db_session)

    with pytest.raises(OrderChangedError):
        await OrdersService(db_session).set_discount(
            order.id, order.revision - 1, None, (DiscountKind.PERCENT, 10), None
        )


async def test_discount_refuses_a_line_of_another_order(db_session: AsyncSession) -> None:
    order = await _placed(db_session)

    with pytest.raises(OrderItemNotFoundError):
        await OrdersService(db_session).set_discount(
            order.id, order.revision, uuid.uuid4(), (DiscountKind.PERCENT, 10), None
        )


async def test_discount_refuses_an_amount_over_the_line(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    balm = order.items[0]

    with pytest.raises(DiscountExceedsTotalError):
        await OrdersService(db_session).set_discount(
            order.id, order.revision, balm.id, (DiscountKind.AMOUNT, 1001), None
        )
    assert order.total_cents == 5000


async def test_discount_refuses_an_amount_over_what_the_lines_leave(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, order.items[1].id, (DiscountKind.PERCENT, 100), None
    )

    with pytest.raises(DiscountExceedsTotalError):
        await service.set_discount(
            order.id, order.revision, None, (DiscountKind.AMOUNT, 1001), None
        )


async def test_a_line_discount_survives_an_edit_and_follows_the_quantity(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.PERCENT, 50), None
    )

    edited, _ = await service.edit_by_admin(order.id, order.revision, {balm.id: 1, serum.id: 4}, [])

    # Serum ×4 at 2000 is 8000, half of it off.
    assert edited.total_cents == 1000 + 4000


async def test_a_reprice_upwards_does_not_grow_a_discount(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    balm = order.items[0]
    service = OrdersService(db_session)
    await service.set_discount(order.id, order.revision, None, (DiscountKind.PERCENT, 10), None)
    assert balm.variant_id is not None

    await service.reprice_variant(balm.variant_id, 2000)

    # 2000 + 4000 = 6000; the 500 given against 5000 stays 500.
    assert order.total_cents == 5500


async def test_a_customer_adding_a_line_takes_the_order_discount_off(
    db_session: AsyncSession,
) -> None:
    """The discount was given on what the order held, not on what the customer adds next."""
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 50), "Акция"
    )
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.AMOUNT, 1000), None
    )
    cream = await make_product(db_session, name="Cream", price_cents=10_000)

    order = await service.add_item(order.user_id, order.id, variant_id(cream), 1)

    assert (order.discount_kind, order.discount_value, order.discount_note) == (None, None, None)
    assert order.discount_base_cents is None
    # A line the customer did not touch keeps its own.
    assert serum.discount_value == 1000
    assert order.total_cents == 15_000 - 1000


async def test_a_customer_adding_to_a_discounted_line_takes_its_discount_off(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.PERCENT, 10), None
    )
    assert serum.variant_id is not None

    order = await service.add_item(order.user_id, order.id, serum.variant_id, 1)

    assert serum.discount_kind is None
    assert order.total_cents == 1000 + 3 * 2000


async def test_a_customer_removing_a_line_takes_the_order_discount_off(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.AMOUNT, 4000), None
    )

    order = await service.remove_item(order.user_id, order.id, serum.id)

    assert order.discount_kind is None
    assert order.total_cents == 1000


async def test_a_customer_changing_a_quantity_takes_that_lines_discount_off(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.AMOUNT, 3000), None
    )
    order, _ = await service.set_discount(
        order.id, order.revision, balm.id, (DiscountKind.AMOUNT, 500), None
    )

    order = await service.set_item_quantity(order.user_id, order.id, serum.id, 1)

    assert serum.discount_kind is None
    assert balm.discount_value == 500
    assert order.total_cents == 500 + 2000


async def test_a_customer_setting_the_same_quantity_changes_nothing(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
    )
    revision = order.revision

    order = await service.set_item_quantity(order.user_id, order.id, serum.id, 2)

    assert order.discount_value == 10
    assert order.revision == revision


async def test_an_amount_a_reprice_shrank_is_stored_as_what_it_takes_off(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.AMOUNT, 3000), None
    )
    assert serum.variant_id is not None

    await service.reprice_variant(serum.variant_id, 1000)

    # Serum ×2 is 2000 now; 3000 of 4000 scaled to it is 1500, and 1500 is what is stored.
    assert (serum.discount_value, serum.discount_base_cents) == (1500, 2000)
    assert order.total_cents == 1000 + 500


async def test_an_admin_edit_does_not_grow_back_an_amount_a_reprice_shrank(
    db_session: AsyncSession,
) -> None:
    """The edit re-anchors what the line gets now, not the number first typed."""
    order = await _placed(db_session)
    balm, serum = order.items
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.AMOUNT, 4000), None
    )
    assert serum.variant_id is not None
    await service.reprice_variant(serum.variant_id, 500)
    # 1000 + 1000 = 2000 left; 4000 of 5000 scaled to it is 1600.
    assert (order.discount_value, order.total_cents) == (1600, 400)

    edited, _ = await service.edit_by_admin(order.id, order.revision, {balm.id: 2, serum.id: 2}, [])

    # 2000 + 1000 = 3000, still 1600 off — not 3000 off, which would make it free.
    assert edited.total_cents == 3000 - 1600


async def test_a_shrunk_amount_does_not_block_the_next_discount(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, serum.id, (DiscountKind.AMOUNT, 3000), None
    )
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
    )
    assert serum.variant_id is not None
    await service.reprice_variant(serum.variant_id, 1000)

    order, change = await service.set_discount(order.id, order.revision, None, None, None)
    assert change is not None
    order, _ = await service.set_discount(
        order.id, order.revision, balm.id, (DiscountKind.PERCENT, 50), None
    )

    # Balm 1000 − 500, Serum 2000 − 1500.
    assert order.total_cents == 500 + 500


async def test_an_admin_edit_re_anchors_a_percent_to_the_new_composition(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    balm, serum = order.items
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
    )

    edited, _ = await service.edit_by_admin(order.id, order.revision, {balm.id: 1, serum.id: 4}, [])

    # 1000 + 8000 = 9000: the admin left 10% in place looking at it.
    assert edited.total_cents == 8100


async def test_discount_refuses_one_that_rounds_to_nothing(db_session: AsyncSession) -> None:
    order = await _placed(db_session)
    balm = order.items[0]

    with pytest.raises(DiscountRoundsToZeroError):
        # 1% of 10 сом is 0,1 — rounded to whole сом, nothing.
        await OrdersService(db_session).set_discount(
            order.id, order.revision, balm.id, (DiscountKind.PERCENT, 1), None
        )
    assert balm.discount_kind is None
    assert order.total_cents == 5000


async def test_a_line_discount_may_not_leave_the_order_amount_without_room(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session)
    serum = order.items[1]
    service = OrdersService(db_session)
    order, _ = await service.set_discount(
        order.id, order.revision, None, (DiscountKind.AMOUNT, 4000), None
    )

    with pytest.raises(DiscountExceedsTotalError):
        # Serum −2000 leaves 3000 for an order amount of 4000.
        await service.set_discount(
            order.id, order.revision, serum.id, (DiscountKind.AMOUNT, 2000), None
        )
    assert serum.discount_kind is None
    assert order.discount_base_cents == 5000
    assert order.total_cents == 1000


async def test_a_full_discount_is_allowed(db_session: AsyncSession) -> None:
    order = await _placed(db_session)

    order, _ = await OrdersService(db_session).set_discount(
        order.id, order.revision, None, (DiscountKind.PERCENT, 100), "Подарок"
    )

    assert order.total_cents == 0


async def test_discount_refuses_while_a_receipt_waits_for_a_verdict(
    db_session: AsyncSession,
) -> None:
    order = await _placed(db_session, OrderStatus.AWAITING_PAYMENT)
    order.confirmed_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.add(
        PaymentReceipt(
            order_id=order.id, kind=ReceiptKind.PHOTO, file_id="file", file_unique_id="unique"
        )
    )
    await db_session.flush()

    with pytest.raises(OrderHasReceiptError):
        await OrdersService(db_session).set_discount(
            order.id, order.revision, None, (DiscountKind.PERCENT, 10), None
        )
