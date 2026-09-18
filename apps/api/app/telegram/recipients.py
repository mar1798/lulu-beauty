"""Who a Telegram message goes to, and which bindings are still alive.

Kept out of `service.py` (which has no session) and out of the handlers (which would
each grow their own copy of these queries).
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import select, union, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import ADMIN_ROLES, User
from app.cart.models import Cart
from app.orders.models import CANCELLED_STATUSES, Order


async def get_owners(session: AsyncSession) -> list[User]:
    """Every account with admin rights, not "the" owner.

    Both roles: the seed (app/scripts/seed.py) bootstraps one SUPER_ADMIN by OWNER_PHONE
    and every ADMIN beside it was granted the role precisely so they would share the
    work — a notification that reached only one of them is a notification nobody
    answered.
    """
    result = await session.execute(select(User).where(User.role.in_(ADMIN_ROLES)))
    return list(result.scalars().all())


async def get_broadcast_audience(session: AsyncSession) -> list[User]:
    """Everyone a shop-wide announcement can actually reach.

    A bound chat is the whole condition: an account cannot exist without one having been
    bound at some point, and when a binding dies (`clear_stale_bindings`) the account
    stays but becomes unreachable — which is exactly what this filter is for.
    """
    result = await session.execute(select(User).where(User.telegram_chat_id.is_not(None)))
    return list(result.scalars().all())


async def get_cycle_participants(
    session: AsyncSession, cycle_id: uuid.UUID, *, with_carts: bool = True
) -> list[User]:
    """Everyone a change to this cycle actually reaches: carts left in it, orders placed
    in it.

    Not the broadcast audience: a moved deadline is news for the people whose cart dies
    with it and whose order stops being editable, and a shop-wide message about a cycle
    someone never touched is the kind of noise that gets a bot muted.

    Cancelled orders are out — that order ended before the cycle did. `with_carts=False`
    is for the closing notice, where cart holders are told something else entirely
    (`cart_moved_to_wishlist`) and would otherwise get both.
    """
    sources = [
        select(Order.user_id).where(
            Order.cycle_id == cycle_id, Order.status.not_in(CANCELLED_STATUSES)
        )
    ]
    if with_carts:
        sources.append(select(Cart.user_id).where(Cart.cycle_id == cycle_id))

    result = await session.execute(union(*sources) if len(sources) > 1 else sources[0])
    user_ids = [row[0] for row in result.all()]
    if not user_ids:
        return []

    users = await session.execute(
        select(User).where(User.id.in_(user_ids), User.telegram_chat_id.is_not(None))
    )
    return list(users.scalars().all())


async def get_users(session: AsyncSession, user_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, User]:
    """Batch-loads the recipients of a personalised fan-out (one query, not one each).

    Erased accounts drop out, like everywhere a profile is read: an id can reach this from
    an order that outlived the person who placed it, and there is nobody behind it to
    address. Every caller already skips an id the map doesn't answer for.
    """
    if not user_ids:
        return {}

    result = await session.execute(
        select(User).where(User.id.in_(user_ids), User.deleted_at.is_(None))
    )
    return {user.id: user for user in result.scalars().all()}


async def find_user_by_chat_id(session: AsyncSession, chat_id: int) -> User | None:
    """The reverse of every other lookup here — the bot knows a chat, not a user."""
    result = await session.execute(select(User).where(User.telegram_chat_id == chat_id))
    return result.scalar_one_or_none()


async def find_user_by_phone(session: AsyncSession, phone: str) -> User | None:
    result = await session.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


async def release_chat(session: AsyncSession, chat_id: int) -> None:
    """Detaches a chat from whatever it is currently bound to.

    Both telegram_chat_id columns are UNIQUE, so binding a chat that is already bound
    elsewhere raises IntegrityError from inside the handler. That is reachable by one
    person sharing two different contacts from the same chat — so every bind clears the
    old owner first rather than trusting that it can't happen.
    """
    await session.execute(
        update(User).where(User.telegram_chat_id == chat_id).values(telegram_chat_id=None)
    )


async def clear_stale_bindings(session: AsyncSession, chat_ids: list[int]) -> int:
    """Drops bindings Telegram has told us are dead (bot blocked, chat deleted).

    Without this a broadcast keeps paying for the same rejected chats every cycle, and
    the unique chat_id keeps blocking the person from re-linking after they unblock.
    """
    if not chat_ids:
        return 0

    result = await session.execute(select(User).where(User.telegram_chat_id.in_(chat_ids)))
    users = list(result.scalars().all())
    for user in users:
        user.telegram_chat_id = None

    return len(users)
