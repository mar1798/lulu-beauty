"""How often one caller may reach the API.

The bot has had a limiter since it grew buttons (`telegram/throttling.py`); the HTTP side
had none, and it is the half with an anonymous endpoint that writes: `POST
/auth/telegram/session` inserts a `telegram_auth_sessions` row per call and asks nothing
of the caller, so a loop fills the table between two runs of the cleanup sweep (five
minutes by default). Everything else is at least bounded by needing an account, which in
this shop means having shared a phone number with the bot.

Same token bucket as the bot's, and for the same reason: a burst of taps is normal use
and a limiter that punishes it would be wrong far more often than right. Two rules,
because the two surfaces are not comparable — signing in is a handful of calls, while
browsing the catalog is a page of products plus their images.

**Keyed by the caller, and "the caller" is the hard part here.** The API sits behind the
website's proxy (`pages/api/proxy/[...path].ts`), so the peer address is the proxy's for
every visitor alike — keyed on that, one impatient customer would throttle the whole shop.
So an authenticated request is keyed by the user id inside its own access token, which is
signed and cannot be borrowed; only anonymous requests fall back to an address, and that
address is read from `X-Forwarded-For` when the deployment says the header is trustworthy.

In-process and per-worker, deliberately: one uvicorn process serves this shop, and the
alternative (Redis) is an entire dependency for a limit whose job is to stop a script,
not to be exact. Two workers would mean each caller gets both budgets — raise the limit
rather than expecting precision.
"""

import logging
import time
from dataclasses import dataclass, field

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.auth import token_service
from app.config import settings

logger = logging.getLogger("app.rate_limit")

# Paths that answer to something other than a person, and must not be throttled with one.
# /health is polled by the container's own probe, and a 429 there reads as the API being
# down. The Telegram webhook is already gated by a secret header, and dropping an update
# there loses it for good — Telegram does not redeliver what we answered.
EXEMPT_PATHS = frozenset({"/health", "/telegram/webhook"})

# The anonymous, row-writing surface. Prefix match, so it covers every /auth/* endpoint.
STRICT_PREFIX = "/auth/"

RETRY_AFTER_SECONDS = "60"

# A bucket that has been full this long says nothing a fresh one would not.
IDLE_TTL_SECONDS = 600.0
PRUNE_AT = 10_000


@dataclass
class _Bucket:
    tokens: float
    updated_at: float

    def take(self, now: float, capacity: int, refill_per_second: float) -> bool:
        elapsed = max(0.0, now - self.updated_at)
        self.tokens = min(float(capacity), self.tokens + elapsed * refill_per_second)
        self.updated_at = now

        if self.tokens < 1.0:
            return False

        self.tokens -= 1.0
        return True

    def is_idle(self, now: float) -> bool:
        return now - self.updated_at > IDLE_TTL_SECONDS


@dataclass
class _Rule:
    """One budget: how many calls a minute, and the buckets spending it."""

    per_minute: int
    buckets: dict[str, _Bucket] = field(default_factory=dict)

    def allows(self, key: str, now: float) -> bool:
        bucket = self.buckets.get(key)
        if bucket is None:
            fresh = _Bucket(tokens=float(self.per_minute), updated_at=now)
            bucket = self.buckets.setdefault(key, fresh)
            self._prune(now)

        return bucket.take(now, self.per_minute, self.per_minute / 60.0)

    def _prune(self, now: float) -> None:
        """O(n), so it runs when the map has grown rather than on every request."""
        if len(self.buckets) < PRUNE_AT:
            return

        stale = [key for key, bucket in self.buckets.items() if bucket.is_idle(now)]
        for key in stale:
            del self.buckets[key]
        logger.info("Pruned %d idle rate-limit buckets, %d left", len(stale), len(self.buckets))


class RateLimitMiddleware:
    """Raw ASGI rather than `BaseHTTPMiddleware`, on purpose.

    `BaseHTTPMiddleware` wraps every response in a task and a queue to hand it back, which
    this app cannot afford to pay on the two endpoints that stream (`/files` static, the
    xlsx export) for the sake of a check that only ever reads the request line. Nothing
    here touches the response: a request is either refused outright or passed through
    untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app
        self._general = _Rule(settings.rate_limit_per_minute)
        self._auth = _Rule(settings.rate_limit_auth_per_minute)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not settings.rate_limit_enabled:
            await self._app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in EXEMPT_PATHS:
            await self._app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        rule = self._auth if path.startswith(STRICT_PREFIX) else self._general

        if not rule.allows(_caller(headers, scope), time.monotonic()):
            logger.info("Rate-limited %s %s", scope.get("method"), path)
            await _too_many_requests(send)
            return

        await self._app(scope, receive, send)


def _caller(headers: Headers, scope: Scope) -> str:
    """Who to charge for this request, most specific identity first.

    The access token wins because it is the only one of the three that cannot be chosen by
    the caller: it is signed, so a customer cannot spend somebody else's budget or escape
    their own by rotating an address. It also survives the proxy, which the address does
    not — see the module docstring.
    """
    user_id = _authenticated_user_id(headers)
    if user_id is not None:
        return f"user:{user_id}"

    return f"ip:{_client_address(headers, scope)}"


def _authenticated_user_id(headers: Headers) -> str | None:
    authorization = headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    try:
        # Verified, not just parsed: an unverified `sub` would be a budget anyone could
        # pick, which is worse than having no identity at all. An invalid token falls
        # through to the address — the request is about to be refused as a 401 anyway,
        # and those attempts are exactly what the limit is there to bound.
        return token_service.decode_access_token(token).sub
    except token_service.InvalidTokenError:
        return None


def _client_address(headers: Headers, scope: Scope) -> str:
    """The visitor's address, or the best stand-in available.

    `X-Forwarded-For` is only read when the deployment says so, because the header is
    attacker-chosen wherever the API can be reached directly — trusting it there would
    hand every caller an unlimited supply of identities. Left off, everyone behind the
    proxy shares one bucket, which is a coarse limit rather than a broken one; the
    authenticated path above is unaffected either way.
    """
    if settings.rate_limit_trust_forwarded_for:
        forwarded = headers.get("x-forwarded-for", "")
        if forwarded:
            # The left-most entry is the original client; the rest are proxies that added
            # themselves on the way.
            return forwarded.split(",")[0].strip()

    client = scope.get("client")
    return client[0] if client else "unknown"


async def _too_many_requests(send: Send) -> None:
    body = b'{"detail":"rate_limited"}'
    start: Message = {
        "type": "http.response.start",
        "status": 429,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
            # Advisory, and honest: the bucket refills continuously, so a full minute is
            # the longest a refused caller could have to wait for a whole budget back.
            (b"retry-after", RETRY_AFTER_SECONDS.encode()),
        ],
    }
    await send(start)
    await send({"type": "http.response.body", "body": body})
