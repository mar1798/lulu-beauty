"""How many updates the bot works on at once — the bot's share of the database pool.

The bot, the site and the scheduler live in one process and draw on one connection pool
(`DB_POOL_SIZE` + `DB_MAX_OVERFLOW`, 20 by default). Updates are handled concurrently,
each in a task of its own, and nearly every handler opens a session. The throttle
(`throttling.py`) bounds what one sender can do, but not what many can do together: a
burst from a few hundred chats — a broadcast everybody answers at once, or somebody's
script with a few hundred accounts — took every connection, and the site waited out the
pool timeout and answered 500. The site has customers in checkout; the bot can wait.

So the bot gets a fixed number of slots, and an update beyond them queues here — in
memory, not on a connection. Each handler holds at most one session at a time, so the
slots are also the most connections the bot can hold, and the rest of the pool stays
the site's and the scheduler's.

A second pool for the bot would have drawn the same line less well: `notify.py` is
shared by the bot, the site and the scheduler, so the bot's own sessions would not even
be all of what the bot opens, and Postgres would carry both pools' connections.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

# A third of the default pool of 20. A handler holds its slot for its Telegram calls too,
# so this is also how many answers the bot can be sending at once — plenty against
# Telegram's own ~30 messages a second.
MAX_CONCURRENT_UPDATES = 6


class ConcurrencyLimitMiddleware(BaseMiddleware):
    """Runs at most `limit` handlers at a time; the rest wait their turn.

    Registered after the throttle, so a dropped update never takes a slot. Waiting is
    the right answer rather than dropping: what queues here is updates from people
    within their own limit, and each is somebody's tap or receipt.
    """

    def __init__(self, limit: int = MAX_CONCURRENT_UPDATES) -> None:
        self._slots = asyncio.Semaphore(limit)

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with self._slots:
            return await handler(event, data)
