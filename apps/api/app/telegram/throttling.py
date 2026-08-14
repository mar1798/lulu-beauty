"""How often one Telegram user may make the bot touch the database.

Every path into the bot — five menu buttons, the unlink callbacks, the order buttons and
now the fallback itself — opens a session and queries, on behalf of a sender nobody has
authenticated. Telegram will happily deliver as fast as a finger (or a script) can send,
so without this the cheapest way to take the API down is to hold down a menu button.

An *outer* middleware, registered before the filters run: a throttled update should not
even be matched against the handlers, because matching a button means comparing text —
cheap — while matching an order callback means parsing it, and the point is to spend
nothing at all on an update that is about to be dropped.

A token bucket rather than a fixed "one per second": tapping three buttons in a row is
normal use, and a limiter that punishes it would be wrong far more often than right. The
bucket absorbs the burst and only then starts refusing, at the refill rate.
"""

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

from app.telegram import messages

logger = logging.getLogger("app.telegram.throttling")

# Sustained rate, in events per second, and how many may arrive back to back before it
# applies. Five is "I tapped through the whole menu"; anything above it is not a person
# reading the answers.
REFILL_PER_SECOND = 1.0
BURST = 5

# A bucket that has been full this long says nothing a fresh one wouldn't, so it is only
# occupying memory. Kept per user id, which is unbounded input from outside.
IDLE_TTL_SECONDS = 300.0
# Pruning is O(n), so it runs when the map has grown rather than on every update.
PRUNE_AT = 1000


@dataclass
class _Bucket:
    tokens: float = float(BURST)
    updated_at: float = 0.0
    # Whether this user has already been told they are going too fast. One notice per
    # episode: repeating it on every dropped update would make the bot the flooder.
    notified: bool = False

    def take(self, now: float) -> bool:
        elapsed = max(0.0, now - self.updated_at)
        self.tokens = min(float(BURST), self.tokens + elapsed * REFILL_PER_SECOND)
        self.updated_at = now

        if self.tokens < 1.0:
            return False

        self.tokens -= 1.0
        self.notified = False
        return True

    def is_idle(self, now: float) -> bool:
        """Silent long enough that a fresh bucket would behave identically.

        Time alone decides it: the TTL is minutes and the refill is a token a second,
        so anything this quiet has long since refilled to full — it is a dict entry
        holding no information, which is the only reason to drop it.
        """
        return now - self.updated_at > IDLE_TTL_SECONDS


@dataclass
class ThrottlingMiddleware(BaseMiddleware):
    """Drops updates from a sender who is sending faster than a person reads.

    Keyed by `from_user`, not by chat: the bot only works in private chats, where the
    two coincide, and if a button ever leaks into a group the limit should follow the
    person who is pressing it rather than the room they are pressing it in.
    """

    _buckets: dict[int, _Bucket] = field(default_factory=dict)

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        key = _sender_id(event)
        if key is None:
            return await handler(event, data)

        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = self._buckets.setdefault(key, _Bucket(updated_at=now))
            self._prune(now)

        if bucket.take(now):
            return await handler(event, data)

        logger.info("Throttled update from telegram user %s", key)
        await self._notice(event, bucket)
        return None

    @staticmethod
    async def _notice(event: TelegramObject, bucket: _Bucket) -> None:
        """Says "slow down" — once per episode for a message, always for a callback.

        A callback query is the exception because Telegram spins the button for half a
        minute when nothing answers it: silence there reads as a broken bot, which is
        the opposite of what a rate limit should communicate.
        """
        if isinstance(event, CallbackQuery):
            await event.answer(messages.TOO_FAST, show_alert=False)
            return

        if isinstance(event, Message) and not bucket.notified:
            bucket.notified = True
            await event.answer(messages.TOO_FAST)

    def _prune(self, now: float) -> None:
        if len(self._buckets) < PRUNE_AT:
            return

        stale = [key for key, bucket in self._buckets.items() if bucket.is_idle(now)]
        for key in stale:
            del self._buckets[key]
        logger.info("Pruned %d idle throttling buckets, %d left", len(stale), len(self._buckets))


def _sender_id(event: TelegramObject) -> int | None:
    from_user = getattr(event, "from_user", None)
    return None if from_user is None else int(from_user.id)
