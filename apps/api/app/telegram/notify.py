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
from datetime import UTC, datetime

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
from app.wanted.models import WantedProduct

logger = logging.getLogger("app.telegram.notify")

# Cycles whose opening broadcast is in flight right now.
#
# The announcement is retried from the sweep for any cycle `announced_at` is missing
# from, and a fan-out over every customer in the shop easily outlives a sweep tick —
# so without this, a tick landing mid-broadcast would start a second copy of the same
# announcement and tell everyone it had already reached a second time.
#
# In memory rather than in the row, because what has to survive a restart is precisely
# the *absence* of a stamp: a claim written to the database would outlive the process
# that took it and leave a cycle killed mid-announcement claimed for good, which is the
# very failure this is here to repair. It holds because the scheduler runs inside the
# one API process (docs/deployment.md) — the same assumption every sweep here already
# rests on, since a second process would double every reminder and every closing too.
_announcing: set[uuid.UUID] = set()


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

            customer = await _load_customer(session, order.user_id)
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

            customer = await _load_customer(session, order.user_id)
            if customer is None:
                return
            await notifications_service.send_order_status(customer, order)
    except Exception:  # noqa: BLE001 - the status is already committed; see module docstring
        logger.exception("Failed to announce status of order %s", order_id)


async def notify_order_cancelled_by_customer(order_id: uuid.UUID, *, restored: bool) -> None:
    """Tells the owner a customer cancelled their own order, or took that back.

    The one thing the customer can do after checkout that changes what the owner buys,
    and until now it changed it silently: the row simply read differently the next time
    the admin list was opened. A restore is announced for the same reason the owner's
    own undo is announced to the customer — the previous message said the order was off.
    """
    try:
        async with async_session() as session:
            order = await _load_order(session, order_id)
            if order is None:  # deleted between the commit and this task running
                return

            owners = await recipients.get_owners(session)
            if not owners:
                logger.warning("No ADMIN user to notify about order %s", order_id)
                return

            customer = await _load_customer(session, order.user_id)
            for owner in owners:
                await notifications_service.send_customer_cancellation(
                    owner, order, customer, restored=restored
                )
    except Exception:  # noqa: BLE001 - the order is already changed; see module docstring
        logger.exception("Failed to announce the customer's own change to order %s", order_id)


async def notify_wanted_product(wanted_id: uuid.UUID) -> None:
    """Passes on a wish for something the shop does not stock.

    The one notification here about a row nothing else in the shop reads: `wanted_products`
    exists so the wish survives a Telegram outage, and this is the only thing that ever
    looks at it. Which is also why the row is re-read rather than travelling by value — the
    task runs after the response is out, like every other one in this module.
    """
    try:
        async with async_session() as session:
            wanted = await session.get(WantedProduct, wanted_id)
            if wanted is None:  # the writer erased their account between the commit and now
                return

            owners = await recipients.get_owners(session)
            if not owners:
                logger.warning("No ADMIN user to notify about wish %s", wanted_id)
                return

            for owner in owners:
                await notifications_service.send_wanted_product(owner, wanted)
    except Exception:  # noqa: BLE001 - the wish is already stored; see module docstring
        logger.exception("Failed to pass on wish %s", wanted_id)


async def notify_account_deleted(order_ids: Sequence[uuid.UUID]) -> None:
    """Tells the owner a customer erased their account, and which orders left with them.

    Travels by value like `notify_order_deleted`, and for a related reason: the customer
    this is about no longer exists in any readable form, so re-reading anything would find
    a nameless row. The ids are all there is to say, and all there should be.

    Only called when something was actually withdrawn — `delete_account` returns an empty
    list for a person who left between cycles, and the router doesn't queue this for it.
    """
    try:
        async with async_session() as session:
            owners = await recipients.get_owners(session)
            if not owners:
                logger.warning("No ADMIN user to notify about %d withdrawn orders", len(order_ids))
                return

            for owner in owners:
                await notifications_service.send_account_deleted(owner, order_ids)
    except Exception:  # noqa: BLE001 - the account is already erased; see module docstring
        logger.exception("Failed to announce an erased account's %d orders", len(order_ids))


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
            customer = await _load_customer(session, user_id)
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


async def notify_stale_orders(session: AsyncSession, cycle: OrderCycle, count: int) -> bool:
    """Nudges the owner about a closed cycle still holding unanswered orders.

    Owner-facing and once per cycle (`stale_orders_notice_at`), because the thing it is
    about does not go away on its own: nothing expires an order, so a cycle left like
    this stays exactly as it is until a person decides either way.

    Returns whether an owner was actually told, and that is the whole point of a return
    value here, exactly as in `notify_cycle_reminders`: the caller stamps what this
    reports, the stamp is final, and this nudge is the only thing that ever mentions
    those orders again. A swallowed failure that still got stamped would be the one
    failure mode the sweep cannot recover from — so an unsent nudge is simply left for
    the next tick.

    One owner reached is enough: they all read the same message, and refusing to stamp
    over a second owner who never linked the bot would nudge the first one every tick.
    """
    try:
        return any(
            [
                await notifications_service.send_stale_orders(owner, cycle, count)
                for owner in await recipients.get_owners(session)
            ]
        )
    except Exception:  # noqa: BLE001 - the sweep must survive one cycle's failure
        logger.exception("Failed to nudge the owner about stale orders in cycle %s", cycle.id)
        return False


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


async def _load_customer(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """The person an order belongs to, or None when there is no longer one.

    An erased account (`deleted_at`) answers None here, exactly as it does to every other
    reader of a profile. Its `name` and `phone` still hold something — a placeholder and a
    filled hole — and this is the one place that would otherwise put them in front of the
    owner, which is precisely what the erasure was for. Anything addressed *to* that
    person has nowhere to go either: the chat binding is gone with the rest.
    """
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        return None
    return user


async def _load_order(session: AsyncSession, order_id: uuid.UUID) -> Order | None:
    """Items eagerly, always: the messages count them, and a lazy load on an async
    session raises MissingGreenlet rather than returning the wrong number."""
    result = await session.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def notify_cycle_opened(cycle_id: uuid.UUID) -> bool:
    """Announces a new cycle to every linked customer, once.

    Opens its own session because it runs as a background task, after the request's
    session is closed — and it has to: a throttled fan-out takes seconds, and holding
    the owner's POST open for the whole broadcast would be a bug of its own.

    Which is also why it stamps `announced_at` when it is through, and why it is safe to
    call again: running outside the request means a restart mid-broadcast used to leave
    every customer past the point it got to permanently unaware that the shop was open,
    with nothing anywhere recording that they had been missed. The sweep now re-runs this
    for any cycle the stamp is missing from.

    The price is that a resumed announcement repeats itself to everyone it did reach —
    the same trade the reminders make, for the same reason: a duplicate is a nuisance, a
    cycle nobody heard about is a lost cycle.

    Returns whether this call is the one that got the announcement out. A claim already
    held, a stamp already in place, a deleted cycle and a failed fan-out all read False —
    which is what lets the sweep report a resumed announcement only when it resumed one.
    """
    if cycle_id in _announcing:
        return False
    _announcing.add(cycle_id)
    try:
        async with async_session() as session:
            cycle = await session.get(OrderCycle, cycle_id)
            if cycle is None:  # deleted between the commit and this task running
                return False
            if cycle.announced_at is not None:  # a previous call already saw it through
                return False

            audience = await recipients.get_broadcast_audience(session)
            result = await notifications_service.send_cycle_opened(audience, cycle)

            # Stamped after the fan-out, never before it: a stamp that landed first would
            # turn a crash mid-broadcast into a cycle nobody is ever told about, which is
            # the whole failure this stamp exists to catch.
            cycle.announced_at = datetime.now(UTC)
            cleared = await recipients.clear_stale_bindings(session, result.blocked_chat_ids)
            await session.commit()

            logger.info(
                "Cycle %s announced to %d/%d chat(s); %d stale binding(s) cleared",
                cycle_id,
                result.sent,
                len(audience),
                cleared,
            )
            return True
    except Exception:  # noqa: BLE001 - the cycle is already committed; see module docstring
        logger.exception("Failed to announce cycle %s", cycle_id)
        return False
    finally:
        _announcing.discard(cycle_id)


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
) -> list[CycleReminder]:
    """Sends the deadline nudges the sweep worked out, after its commit.

    A throttled fan-out like the other broadcasts: a reminder goes to everyone holding an
    abandoned cart, which is the same shape of audience as a shop-wide announcement, and
    firing it flat-out would simply earn a rate-limit from Telegram partway through.

    Returns the reminders that were actually dealt with, and that is the whole point of a
    return value here: the caller stamps what this reports, and a stamp is what stops a
    reminder from ever being sent again. One `try` around the whole loop meant a failure
    on the third cycle left the fourth unsent — and then stamped as though it had gone
    out. The failure is caught per reminder instead, and an unfinished one is simply left
    for the next tick.
    """
    if not reminders:
        return []

    delivered: list[CycleReminder] = []
    for reminder in reminders:
        try:
            if not reminder.user_ids:
                # Planned only so its stages get stamped — nobody left a cart in it.
                delivered.append(reminder)
                continue

            users = await recipients.get_users(session, reminder.user_ids)
            message = (
                messages.cart_last_chance(reminder.cycle)
                if reminder.last_chance
                else messages.cart_reminder(reminder.cycle)
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
            delivered.append(reminder)
        except Exception:  # noqa: BLE001 - one cycle's failure must not cost the others
            logger.exception("Failed to send the reminder for cycle %s", reminder.cycle.id)

    return delivered


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
