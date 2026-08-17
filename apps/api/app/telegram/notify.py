"""Post-commit notification tasks.

Every function here runs *after* the transaction that produced the event was committed.
Sending from inside a service would announce orders that then roll back, and would let a
Telegram outage turn a successful 201 into a 500 — so the call sites are the routers and
the scheduler jobs, right after their commit.

The request-driven ones are queued as background tasks and open their own session: they
run once the response is out, when the request's session is already closed, and nobody
placing an order should wait on a Telegram round-trip to find out that it worked.

For the same reason nothing here raises: the event has already happened, and the caller
has nothing useful to do with the failure beyond what these logs already record.
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.cycles.models import OrderCycle
from app.cycles.scheduler_service import CartRescue, CycleReminder
from app.db import async_session
from app.orders.models import Order, OrderStatus
from app.orders.service import OrderItemDrop, OrderPriceChange
from app.telegram import messages, recipients
from app.telegram.client import notifications_service
from app.telegram.service import CartRescueNotice

logger = logging.getLogger("app.telegram.notify")


async def notify_new_order(order_id: uuid.UUID) -> None:
    """Tells the owner an order came in — until now the only way to find out was to open
    the admin panel and look."""
    try:
        async with async_session() as session:
            order = await _load_order(session, order_id)
            if order is None:  # deleted between the commit and this task running
                return

            owners = await recipients.get_owners(session)
            if not owners:
                logger.warning("No ADMIN user to notify about order %s", order_id)
                return

            customer = await session.get(User, order.user_id)
            cycle = await session.get(OrderCycle, order.cycle_id)
            for owner in owners:
                await notifications_service.send_new_order(owner, order, customer, cycle)
    except Exception:  # noqa: BLE001 - the order is already committed; see module docstring
        logger.exception("Failed to announce new order %s", order_id)


async def notify_order_status(order_id: uuid.UUID) -> None:
    """Tells the customer their order moved.

    Re-reads the status rather than taking it from the caller: by the time this runs the
    response is already out, and the row is the only thing that's still true.
    """
    try:
        async with async_session() as session:
            order = await _load_order(session, order_id)
            if order is None:
                return

            customer = await session.get(User, order.user_id)
            if customer is None:
                return
            await notifications_service.send_order_status(customer, order)
    except Exception:  # noqa: BLE001 - the status is already committed; see module docstring
        logger.exception("Failed to announce status of order %s", order_id)


async def notify_order_deleted(
    user_id: uuid.UUID, order_id: uuid.UUID, status: OrderStatus
) -> None:
    """Tells the customer the owner removed their order.

    The one notification here that travels by value: everything else re-reads the row it
    is about, and here the row is precisely what no longer exists. `status` is the one the
    order had when it was deleted — `messages.order_deleted` decides from it whether there
    is anything worth saying at all.
    """
    try:
        async with async_session() as session:
            customer = await session.get(User, user_id)
            if customer is None:
                return
            await notifications_service.send_order_deleted(customer, order_id, status)
    except Exception:  # noqa: BLE001 - the order is already gone; see module docstring
        logger.exception("Failed to announce deletion of order %s", order_id)


async def notify_orders_repriced(changes: Sequence[OrderPriceChange]) -> None:
    """Tells each customer that a line in their pending order costs something else now.

    By value, like the deletion notice: the old price is what the repriced row no longer
    holds, and this runs after the commit that overwrote it.
    """
    await _fan_out_order_notices(
        [
            (user_id, messages.orders_repriced(group))
            for user_id, group in _group_by_user(changes)
        ],
        "repricing",
    )


async def notify_orders_item_dropped(drops: Sequence[OrderItemDrop]) -> None:
    """Tells each customer that a product left the catalog and their order with it."""
    await _fan_out_order_notices(
        [
            (user_id, messages.orders_items_dropped(group))
            for user_id, group in _group_by_user(drops)
        ],
        "discontinuation",
    )


def _group_by_user[T: (OrderPriceChange, OrderItemDrop)](
    items: Sequence[T],
) -> list[tuple[uuid.UUID, list[T]]]:
    """One notice per customer, not per affected order.

    A catalog edit routinely touches several pending orders of the *same* person — they
    order in every cycle, and the product sits in each of those orders. Telegram takes
    roughly one message per second per chat, so sending one per order queued them into
    429s and only the first arrived: the customer heard about one order out of several.
    """
    grouped: dict[uuid.UUID, list[T]] = {}
    for item in items:
        grouped.setdefault(item.user_id, []).append(item)
    return list(grouped.items())


async def _fan_out_order_notices(
    notices: Sequence[tuple[uuid.UUID, str]], subject: str
) -> None:
    """Delivers already-worded news, one notice per recipient, clearing dead bindings.

    Shared by the catalog-driven notifications because they differ only in wording: both
    follow one committed edit that touched an unbounded number of pending orders. One
    notice per customer, never per order — see `_group_by_user`.
    """
    if not notices:
        return

    try:
        async with async_session() as session:
            users = await recipients.get_users(session, [user_id for user_id, _ in notices])
            result = await notifications_service.send_order_notices(
                [
                    (users[user_id], message)
                    for user_id, message in notices
                    # Deleted between the catalog edit and this task running.
                    if user_id in users
                ]
            )

            cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
            await session.commit()

            logger.info(
                "Catalog %s: %d/%d order notice(s) delivered; %d stale binding(s) cleared",
                subject,
                result.sent,
                len(notices),
                cleared,
            )
    except Exception:  # noqa: BLE001 - the orders are already changed; see module docstring
        logger.exception("Failed to announce a catalog %s to affected orders", subject)


async def _load_order(session: AsyncSession, order_id: uuid.UUID) -> Order | None:
    """Items eagerly, always: the messages count them, and a lazy load on an async
    session raises MissingGreenlet rather than returning the wrong number."""
    result = await session.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def notify_cycle_opened(cycle_id: uuid.UUID) -> None:
    """Announces a new cycle to every linked customer.

    Opens its own session because it runs as a background task, after the request's
    session is closed — and it has to: a throttled fan-out takes seconds, and holding
    the owner's POST open for the whole broadcast would be a bug of its own.
    """
    try:
        async with async_session() as session:
            cycle = await session.get(OrderCycle, cycle_id)
            if cycle is None:  # deleted between the commit and this task running
                return

            audience = await recipients.get_broadcast_audience(session)
            result = await notifications_service.send_cycle_opened(audience, cycle)

            cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
            await session.commit()

            logger.info(
                "Cycle %s announced to %d/%d chat(s); %d stale binding(s) cleared",
                cycle_id,
                result.sent,
                len(audience),
                cleared,
            )
    except Exception:  # noqa: BLE001 - the cycle is already committed; see module docstring
        logger.exception("Failed to announce cycle %s", cycle_id)


async def notify_cycle_deadline_changed(
    cycle_id: uuid.UUID, previous_deadline_at: datetime
) -> None:
    """Announces a moved deadline to everyone already in the cycle.

    Takes the old deadline by value — the row now holds the new one, and the message is
    about the difference. Its own session and its own background task, like the opening
    announcement: this is a throttled fan-out, and the owner's PATCH must not wait on it.
    """
    try:
        async with async_session() as session:
            cycle = await session.get(OrderCycle, cycle_id)
            if cycle is None:  # deleted between the commit and this task running
                return

            audience = await recipients.get_cycle_participants(session, cycle_id)
            if not audience:
                return

            result = await notifications_service.send_cycle_deadline_changed(
                audience, cycle, previous_deadline_at
            )

            cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
            await session.commit()

            logger.info(
                "Cycle %s deadline change announced to %d/%d chat(s); %d stale binding(s) cleared",
                cycle_id,
                result.sent,
                len(audience),
                cleared,
            )
    except Exception:  # noqa: BLE001 - the cycle is already changed; see module docstring
        logger.exception("Failed to announce the new deadline of cycle %s", cycle_id)


async def notify_cycle_closed_for_customers(session: AsyncSession, cycle: OrderCycle) -> None:
    """Tells the customers who ordered in a cycle that it has closed.

    Runs in the caller's session, like the other closing notices (the owner's tally and
    the cart rescue), so that all three go out after the one commit that closed the cycle.
    Cart holders are excluded here: `notify_carts_rescued` is telling them the same news
    plus where their products went.
    """
    try:
        audience = await recipients.get_cycle_participants(session, cycle.id, with_carts=False)
        if not audience:
            return

        result = await notifications_service.send_cycle_closed_for_customers(audience, cycle)

        cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
        await session.commit()

        logger.info(
            "Cycle %s closing announced to %d/%d customer chat(s); %d stale binding(s) cleared",
            cycle.id,
            result.sent,
            len(audience),
            cleared,
        )
    except Exception:  # noqa: BLE001 - the cycle is already closed; see module docstring
        logger.exception("Failed to announce the closing of cycle %s to customers", cycle.id)


async def notify_cycle_reminders(
    session: AsyncSession, reminders: Sequence[CycleReminder]
) -> None:
    """Sends the deadline nudges the sweep worked out, after its commit.

    A throttled fan-out like the other broadcasts: a reminder goes to everyone holding an
    abandoned cart, which is the same shape of audience as a shop-wide announcement, and
    firing it flat-out would simply earn a rate-limit from Telegram partway through.
    """
    if not reminders:
        return

    try:
        for reminder in reminders:
            if not reminder.user_ids:
                # Planned only so its stages get stamped — nobody left a cart in it.
                continue

            users = await recipients.get_users(session, reminder.user_ids)
            message = (
                messages.cart_last_chance(
                    messages.cycle_title(reminder.cycle), reminder.cycle.deadline_at
                )
                if reminder.last_chance
                else messages.cart_reminder(
                    messages.cycle_title(reminder.cycle), reminder.cycle.deadline_at
                )
            )
            result = await notifications_service.broadcast_reminder(
                [users[user_id] for user_id in reminder.user_ids if user_id in users], message
            )

            cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
            await session.commit()

            logger.info(
                "Cycle %s: %d/%d reminder(s) delivered; %d stale binding(s) cleared",
                reminder.cycle.id,
                result.sent,
                len(reminder.user_ids),
                cleared,
            )
    except Exception:  # noqa: BLE001 - the cycles are already stamped; see module docstring
        logger.exception("Failed to send cycle reminders")


async def notify_cycle_closed(
    session: AsyncSession, cycle: OrderCycle, orders_count: int, total_cents: int
) -> None:
    """Hands the owner the closing tally — the moment the shopping list is final."""
    try:
        for owner in await recipients.get_owners(session):
            await notifications_service.send_cycle_closed(owner, cycle, orders_count, total_cents)
    except Exception:  # noqa: BLE001 - the cycle is already closed; see module docstring
        logger.exception("Failed to send the closing summary for cycle %s", cycle.id)


async def notify_carts_rescued(
    session: AsyncSession, cycle: OrderCycle, rescues: Sequence[CartRescue]
) -> None:
    """Tells each customer whose cart the deadline emptied where their products went.

    Without it the rescue is invisible: the cart is empty either way, and "оно теперь в
    избранном" is not somewhere anyone thinks to look on their own.
    """
    if not rescues:
        return

    try:
        users = await recipients.get_users(session, [rescue.user_id for rescue in rescues])
        notices = [
            CartRescueNotice(
                user=users[rescue.user_id], saved=rescue.saved, dropped=rescue.dropped
            )
            for rescue in rescues
            if rescue.user_id in users  # deleted between the sweep and this call
        ]
        result = await notifications_service.send_cart_rescued(
            notices, messages.cycle_title(cycle)
        )

        # Same bookkeeping as the cycle-opened broadcast: a 403 means the binding is dead,
        # and keeping it would block the person from re-linking after they unblock.
        cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
        await session.commit()

        logger.info(
            "Cycle %s: %d/%d cart rescue notice(s) delivered; %d stale binding(s) cleared",
            cycle.id,
            result.sent,
            len(notices),
            cleared,
        )
    except Exception:  # noqa: BLE001 - the carts are already moved; see module docstring
        logger.exception("Failed to announce the cart rescue for cycle %s", cycle.id)
