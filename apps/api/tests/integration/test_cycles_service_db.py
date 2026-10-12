from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.service import CartService
from app.cycles.models import CycleStatus, OrderCycle
from app.cycles.service import (
    DELETABLE_AFTER,
    ActiveCycleExistsError,
    CycleClosedRecentlyError,
    CycleDeletion,
    CycleHasOrdersError,
    CycleNotClosedError,
    CycleOrdersChangedError,
    CyclesService,
    PastDeadlineError,
)
from app.orders.models import Order, OrderItem, OrderStatus
from app.orders.service import OrdersService
from app.payments.models import PaymentReceipt, ReceiptKind, ReceiptVerdict
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

"""update()'s deadline rule.

create() has always refused a deadline in the past; update() accepted one silently, and
on a cycle customers are still ordering in that is not a shorter cycle — it is a closed
one, and the next sweep empties every cart collected under it.
"""


async def test_moving_an_open_cycle_into_the_past_is_refused(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=2))

    with pytest.raises(PastDeadlineError):
        await CyclesService(db_session).update(
            cycle.id, {"deadline_at": datetime.now(UTC) - timedelta(minutes=1)}
        )


async def test_an_open_cycle_still_moves_to_another_future_date(db_session: AsyncSession) -> None:
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=2))
    moved_to = datetime.now(UTC) + timedelta(days=5)

    updated = await CyclesService(db_session).update(cycle.id, {"deadline_at": moved_to})

    assert updated.deadline_at == moved_to


async def test_a_finished_cycle_can_still_be_relabelled(db_session: AsyncSession) -> None:
    """The calendar's form saves the label and the deadline together, so guarding past
    deadlines unconditionally would make renaming a closed cycle impossible."""
    past = datetime.now(UTC) - timedelta(days=3)
    cycle = await make_cycle(db_session, deadline_at=past, label="Май")

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": past, "label": "Май 2026"}
    )

    assert updated.label == "Май 2026"


async def test_reopening_a_closed_cycle_puts_the_whole_row_back(db_session: AsyncSession) -> None:
    """Moving a closed cycle's deadline forward has to reopen it properly, not halfway.

    `get_active_cycle()` goes by the deadline alone, so the cycle started collecting orders
    again — while `sweep_deadlines` skips anything already CLOSED and would therefore never
    close it a second time, and both reminder stamps stayed set so the new deadline would
    pass unannounced. `announced_at` is the same kind of leftover: kept, it describes an
    announcement about a cycle that has since ended and closes the only door through which
    the shop hears the reopening.
    """
    now = datetime.now(UTC)
    cycle = await make_cycle(
        db_session, deadline_at=now - timedelta(days=1), status=CycleStatus.CLOSED
    )
    cycle.closed_at = now - timedelta(days=1)
    cycle.reminder_sent_at = now - timedelta(days=2)
    cycle.final_reminder_sent_at = now - timedelta(days=2)
    cycle.announced_at = now - timedelta(days=5)
    await db_session.flush()

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": now + timedelta(days=3)}
    )

    assert updated.status is CycleStatus.UPCOMING
    assert updated.closed_at is None
    assert updated.reminder_sent_at is None
    assert updated.final_reminder_sent_at is None
    assert updated.announced_at is None
    assert await CyclesService(db_session).get_active_cycle() is not None


async def test_renaming_a_finished_cycle_leaves_it_closed(db_session: AsyncSession) -> None:
    """The calendar's form saves label and deadline together, so an ordinary rename
    re-sends the past deadline — which must not be read as reopening anything."""
    now = datetime.now(UTC)
    cycle = await make_cycle(
        db_session, deadline_at=now - timedelta(days=1), status=CycleStatus.CLOSED
    )
    cycle.closed_at = now - timedelta(days=1)
    cycle.announced_at = now - timedelta(days=5)
    await db_session.flush()

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": now - timedelta(days=1), "label": "Ноябрьский сбор"}
    )

    assert updated.status is CycleStatus.CLOSED
    assert updated.closed_at is not None
    assert updated.label == "Ноябрьский сбор"
    # And its announcement stands: nothing was reopened, so there is nothing to announce.
    assert updated.announced_at is not None


"""Открытый сбор ровно один.

Второй, созданный с более ранним дедлайном, молча становился *тем самым* сбором:
`get_active_cycle` берёт ближайший дедлайн, а корзина привязана к своему сбору
(`Unique(user_id, cycle_id)`) — и всё, что покупатели собрали в первом, пропадало с
экрана. Правка даты у текущего сбора — то, ради чего второй и заводили.
"""


async def test_a_second_open_cycle_is_refused(db_session: AsyncSession) -> None:
    await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=7))
    service = CyclesService(db_session)

    with pytest.raises(ActiveCycleExistsError):
        await service.create(datetime.now(UTC) + timedelta(days=1), label="Второй")


async def test_a_new_cycle_opens_once_the_previous_one_is_over(db_session: AsyncSession) -> None:
    """Запрет — на второй **открытый**, а не на второй вообще: закончившийся сбор
    следующему не мешает, иначе магазин закрылся бы навсегда."""
    finished = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(seconds=1))
    finished.deadline_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    service = CyclesService(db_session)
    created = await service.create(datetime.now(UTC) + timedelta(days=3), label="Новый")

    assert (await service.get_active_cycle()) is not None
    assert (await service.get_active_cycle()).id == created.id


async def test_a_cycle_closed_early_stops_being_the_active_one(db_session: AsyncSession) -> None:
    """Закрытие досрочное, дедлайн — прежний: активность считается ещё и по статусу,
    иначе корзины набирались бы в сбор, по которому владелец уже уехал закупаться."""
    cycle = await make_cycle(db_session, deadline_at=datetime.now(UTC) + timedelta(days=2))
    cycle.status = CycleStatus.CLOSED
    await db_session.flush()

    assert await CyclesService(db_session).get_active_cycle() is None


async def test_reopening_a_finished_cycle_is_refused_while_another_collects(
    db_session: AsyncSession,
) -> None:
    """The rule `create()` enforces, on the path that used to get around it.

    Moving a closed cycle's deadline into the future reopens it, and with another cycle
    already collecting that leaves two open at once — `get_active_cycle()` then picks the
    nearer deadline, and every cart gathered under the other one drops out of sight.
    """
    now = datetime.now(UTC)
    finished = await make_cycle(db_session, deadline_at=now - timedelta(days=7))
    finished.status = CycleStatus.CLOSED
    finished.closed_at = now - timedelta(days=7)
    await make_cycle(db_session, deadline_at=now + timedelta(days=3))
    await db_session.flush()

    with pytest.raises(ActiveCycleExistsError):
        await CyclesService(db_session).update(
            finished.id, {"deadline_at": now + timedelta(days=10)}
        )


async def test_reopening_a_finished_cycle_is_allowed_when_nothing_else_collects(
    db_session: AsyncSession,
) -> None:
    now = datetime.now(UTC)
    finished = await make_cycle(db_session, deadline_at=now - timedelta(days=7))
    finished.status = CycleStatus.CLOSED
    await db_session.flush()

    reopened = await CyclesService(db_session).update(
        finished.id, {"deadline_at": now + timedelta(days=10)}
    )

    assert reopened.status is CycleStatus.UPCOMING


async def test_editing_the_open_cycle_is_not_blocked_by_itself(db_session: AsyncSession) -> None:
    """The guard only fires on a cycle *becoming* open — extending the live one is the
    ordinary use of this endpoint."""
    now = datetime.now(UTC)
    cycle = await make_cycle(db_session, deadline_at=now + timedelta(days=1))

    updated = await CyclesService(db_session).update(
        cycle.id, {"deadline_at": now + timedelta(days=5), "label": "Июль"}
    )

    assert updated.label == "Июль"
    assert updated.deadline_at > now + timedelta(days=4)


async def test_renaming_a_finished_cycle_is_never_blocked(db_session: AsyncSession) -> None:
    """A past cycle stays past when only its label changes, so no guard applies."""
    now = datetime.now(UTC)
    finished = await make_cycle(db_session, deadline_at=now - timedelta(days=7))
    finished.status = CycleStatus.CLOSED
    await make_cycle(db_session, deadline_at=now + timedelta(days=3))
    await db_session.flush()

    updated = await CyclesService(db_session).update(finished.id, {"label": "Май"})

    assert updated.label == "Май"
    assert updated.status is CycleStatus.CLOSED


async def _cycle_with_order(db_session: AsyncSession) -> tuple[OrderCycle, Order]:
    """A cycle with one checked-out order, closed `DELETABLE_AFTER` and a minute ago.

    Tests that need it open or freshly closed move it back themselves.
    """
    user = await make_user(db_session)
    cycle = await make_cycle(db_session)
    product = await make_product(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    closed_at = datetime.now(UTC) - DELETABLE_AFTER - timedelta(minutes=1)
    cycle.status = CycleStatus.CLOSED
    cycle.deadline_at = closed_at
    cycle.closed_at = closed_at
    await db_session.flush()
    return cycle, order


async def test_an_open_cycle_is_not_deleted(db_session: AsyncSession) -> None:
    """Even an empty one: deleting is for history, an open cycle is still taking orders."""
    cycle = await make_cycle(db_session)

    with pytest.raises(CycleNotClosedError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=0)


async def test_a_recently_closed_cycle_is_not_deleted(db_session: AsyncSession) -> None:
    """The days after closing are when its orders are confirmed and paid for."""
    cycle, order = await _cycle_with_order(db_session)
    order.status = OrderStatus.CANCELLED_BY_CUSTOMER
    cycle.closed_at = datetime.now(UTC) - DELETABLE_AFTER + timedelta(hours=1)
    await db_session.flush()

    with pytest.raises(CycleClosedRecentlyError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=1)


async def test_a_cancellation_the_customer_can_still_undo_is_not_deleted(
    db_session: AsyncSession,
) -> None:
    """While the site still offers «Вернуть», the order is not history yet.

    Eight days after closing used to be deletable — a week was the rule — while the
    customer's restore window ran to ten.
    """
    cycle, order = await _cycle_with_order(db_session)
    order.status = OrderStatus.CANCELLED_BY_CUSTOMER
    cycle.closed_at = datetime.now(UTC) - timedelta(days=8)
    await db_session.flush()

    flags = await OrdersService(db_session).customer_flags([order])
    assert flags[order.id].is_restorable
    with pytest.raises(CycleClosedRecentlyError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=1)


@pytest.mark.parametrize("verdict", [None, ReceiptVerdict.ACCEPTED, ReceiptVerdict.REJECTED])
async def test_a_cancelled_order_with_a_receipt_is_not_deleted(
    db_session: AsyncSession, verdict: ReceiptVerdict | None
) -> None:
    """A receipt is money that may have been sent, whatever `paid_at` says now.

    Taking an order back to PENDING clears `paid_at`, so a paid order cancelled, restored
    and cancelled again looks unpaid — only its receipt remembers the transfer.
    """
    cycle, order = await _cycle_with_order(db_session)
    order.status = OrderStatus.CANCELLED_BY_OWNER
    db_session.add(
        PaymentReceipt(
            order_id=order.id,
            kind=ReceiptKind.PHOTO,
            file_id="file",
            file_unique_id="unique",
            verdict=verdict,
        )
    )
    await db_session.flush()

    assert await CyclesService(db_session).deletion(cycle.id) == CycleDeletion(orders=1, blocking=1)
    with pytest.raises(CycleHasOrdersError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=1)


@pytest.mark.parametrize(
    ("order_status", "paid"),
    [
        (OrderStatus.PENDING, False),
        (OrderStatus.CONFIRMED, False),
        (OrderStatus.READY, False),
        # Paid for and then done with: the money is still a fact about this order.
        (OrderStatus.COMPLETED, True),
        (OrderStatus.CANCELLED_BY_OWNER, True),
    ],
)
async def test_a_cycle_with_a_live_or_paid_order_is_not_deleted(
    db_session: AsyncSession, order_status: OrderStatus, paid: bool
) -> None:
    cycle, order = await _cycle_with_order(db_session)
    order.status = order_status
    order.paid_at = datetime.now(UTC) if paid else None
    await db_session.flush()

    assert (await CyclesService(db_session).deletion(cycle.id)).blocking == 1
    with pytest.raises(CycleHasOrdersError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=1)


async def test_a_count_other_than_the_confirmed_one_is_refused(db_session: AsyncSession) -> None:
    """The owner agreed to lose N orders; the server finding another number deletes none."""
    cycle, order = await _cycle_with_order(db_session)
    order.status = OrderStatus.CANCELLED_BY_CUSTOMER
    await db_session.flush()

    with pytest.raises(CycleOrdersChangedError):
        await CyclesService(db_session).delete(cycle.id, expected_orders=0)


@pytest.mark.parametrize(
    "order_status",
    [OrderStatus.COMPLETED, OrderStatus.CANCELLED_BY_CUSTOMER, OrderStatus.CANCELLED_BY_OWNER],
)
async def test_a_finished_cycle_is_deleted_with_its_history(
    db_session: AsyncSession, order_status: OrderStatus
) -> None:
    """Nothing left alive in it: the cycle goes, its orders and their items with it."""
    cycle, order = await _cycle_with_order(db_session)
    order.status = order_status
    await db_session.flush()

    assert await CyclesService(db_session).deletion(cycle.id) == CycleDeletion(orders=1, blocking=0)
    await CyclesService(db_session).delete(cycle.id, expected_orders=1)
    await db_session.flush()
    db_session.expunge_all()

    assert await db_session.get(OrderCycle, cycle.id) is None
    assert await db_session.scalar(select(func.count()).select_from(Order)) == 0
    assert await db_session.scalar(select(func.count()).select_from(OrderItem)) == 0
