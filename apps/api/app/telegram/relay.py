"""Who a message in an owner's chat was passed on from — see `models.RelayedMessage`.

Like every service here: takes the session, writes, never commits.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.orders.models import Order
from app.telegram.models import RelayedMessage
from app.wanted.models import WantedProduct


@dataclass(frozen=True)
class RelayTarget:
    """Where an owner's reply to a passed-on message goes, as the database has it now."""

    # None when the writer is gone, or was a guest leaving a wish.
    customer: User | None
    # The «#…» the passed-on message showed, and the order behind it while it is still
    # the customer's.
    order_reference: str | None
    order_id: uuid.UUID | None
    wish: bool
    # The number written on the wish, for the owner to call when the bot cannot reach it.
    wish_phone: str | None


async def record(
    session: AsyncSession,
    owner_chat_id: int,
    message_ids: Iterable[int],
    *,
    user_id: uuid.UUID | None,
    order_id: uuid.UUID | None = None,
    order_reference: str | None = None,
    wanted_product_id: uuid.UUID | None = None,
) -> None:
    session.add_all(
        RelayedMessage(
            owner_chat_id=owner_chat_id,
            message_id=message_id,
            user_id=user_id,
            order_id=order_id,
            order_reference=order_reference,
            wanted_product_id=wanted_product_id,
        )
        for message_id in message_ids
    )
    await session.flush()


async def resolve(session: AsyncSession, owner_chat_id: int, message_id: int) -> RelayTarget | None:
    """None when the bot did not pass that message on — or did before it kept count."""
    row = await session.scalar(
        select(RelayedMessage).where(
            RelayedMessage.owner_chat_id == owner_chat_id,
            RelayedMessage.message_id == message_id,
        )
    )
    if row is None:
        return None

    customer = await session.get(User, row.user_id) if row.user_id is not None else None
    wanted = (
        await session.get(WantedProduct, row.wanted_product_id)
        if row.wanted_product_id is not None
        else None
    )
    order = await session.get(Order, row.order_id) if row.order_id is not None else None
    if order is not None and (customer is None or order.user_id != customer.id):
        order = None
    return RelayTarget(
        customer=customer,
        order_reference=row.order_reference,
        order_id=order.id if order is not None else None,
        wish=row.wanted_product_id is not None,
        wish_phone=wanted.phone if wanted is not None else None,
    )
