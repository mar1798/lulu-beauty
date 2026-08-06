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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.cycles.models import OrderCycle
from app.db import async_session
from app.orders.models import Order
from app.telegram import recipients
from app.telegram.client import notifications_service

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


async def notify_cycle_closed(
    session: AsyncSession, cycle: OrderCycle, orders_count: int, total_cents: int
) -> None:
    """Hands the owner the closing tally — the moment the shopping list is final."""
    try:
        for owner in await recipients.get_owners(session):
            await notifications_service.send_cycle_closed(owner, cycle, orders_count, total_cents)
    except Exception:  # noqa: BLE001 - the cycle is already closed; see module docstring
        logger.exception("Failed to send the closing summary for cycle %s", cycle.id)
