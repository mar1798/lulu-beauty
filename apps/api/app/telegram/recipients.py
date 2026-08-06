"""Who a Telegram message goes to, and which bindings are still alive.

Kept out of `service.py` (which has no session) and out of the handlers (which would
each grow their own copy of these queries).
"""

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.telegram.models import PendingTelegramContact


async def get_owners(session: AsyncSession) -> list[User]:
    """Every ADMIN, not "the" owner.

    The seed (app/scripts/seed.py) creates exactly one, by OWNER_PHONE — but nothing in
    the schema enforces that, and picking one arbitrarily would silently drop a
    notification if a second one ever exists.
    """
    result = await session.execute(select(User).where(User.role == Role.ADMIN))
    return list(result.scalars().all())


async def get_broadcast_audience(session: AsyncSession) -> list[User]:
    """Everyone a shop-wide announcement can actually reach."""
    result = await session.execute(
        select(User).where(User.telegram_chat_id.is_not(None), User.phone_verified.is_(True))
    )
    return list(result.scalars().all())


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
    await session.execute(
        delete(PendingTelegramContact).where(PendingTelegramContact.chat_id == chat_id)
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

    await session.execute(
        delete(PendingTelegramContact).where(PendingTelegramContact.chat_id.in_(chat_ids))
    )
    return len(users)
