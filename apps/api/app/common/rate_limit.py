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
import secrets
import time
from collections import OrderedDict
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
EXEMPT_PATHS = frozenset({"/health"})

# Telegram's own path. Exempt only once it has proved itself: the exemption used to go by
# path alone, and `compare_digest` lives in the handler — so anybody who knew the address
# had an unmetered endpoint (and a log line per attempt). A call carrying the right secret
# is Telegram and must never be throttled; one without it is a stranger and pays the
# general budget like any other.
WEBHOOK_PATH = "/telegram/webhook"
WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token"

# The anonymous, row-writing surface. Prefix match, so it covers every /auth/* endpoint.
STRICT_PREFIX = "/auth/"

# Polled, not called: the waiting tab asks this one every couple of seconds for as long as
# the sign-in is open, so the strict budget — sized for endpoints that create rows on an
# anonymous request — empties inside two minutes and locks the person out of their own
# login. It is also the one /auth/ path that is already authenticated: the caller has to
# present the poll secret from the httpOnly cookie, which no stranger has.
STRICT_EXEMPT_PATHS = frozenset({"/auth/telegram/claim"})

RETRY_AFTER_SECONDS = "60"

# A bucket that has been full this long says nothing a fresh one would not.
IDLE_TTL_SECONDS = 600.0
PRUNE_AT = 10_000

# The map may not grow past this, whatever the scan manages to free. Roughly 50k * ~200
# bytes of dict entry, key and bucket — tens of megabytes, an order of magnitude below
# anything this process would otherwise be short of.
MAX_BUCKETS = 50_000


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
    buckets: OrderedDict[str, _Bucket] = field(default_factory=OrderedDict)
    _last_prune_at: float = 0.0

    def allows(self, key: str, now: float) -> bool:
        bucket = self.buckets.get(key)
        if bucket is None:
            fresh = _Bucket(tokens=float(self.per_minute), updated_at=now)
            bucket = self.buckets.setdefault(key, fresh)
            self._prune(now)

        return bucket.take(now, self.per_minute, self.per_minute / 60.0)

    def _prune(self, now: float) -> None:
        """Bounded work per request, and a hard ceiling on the map.

        Scanning on every new key was the wrong shape twice over. A caller that rotates
        its identity — which anyone can, since the anonymous key is an address read from
        `X-Forwarded-For` — creates a key per request, and a fresh key always starts with
        a full budget, so the flood is never slowed by the limiter itself; meanwhile
        during that flood nothing in the map is older than `IDLE_TTL_SECONDS`, so each
        O(n) scan over 10k+ entries frees nothing and runs on the event loop the whole
        shop shares.

        So: the scan is rate-limited in time (once per `IDLE_TTL_SECONDS` at most), and
        when it fails to bring the map under control, the oldest entries are evicted
        outright. Evicting is safe in the only direction that matters — a dropped bucket
        comes back full, which forgives a caller rather than refusing an innocent one, and
        the entries dropped are by definition the least recently seen.
        """
        if len(self.buckets) < PRUNE_AT:
            return

        if now - self._last_prune_at >= IDLE_TTL_SECONDS:
            self._last_prune_at = now
            stale = [key for key, bucket in self.buckets.items() if bucket.is_idle(now)]
            for key in stale:
                del self.buckets[key]
            logger.info(
                "Pruned %d idle rate-limit buckets, %d left", len(stale), len(self.buckets)
            )

        while len(self.buckets) > MAX_BUCKETS:
            # `popitem(last=False)` is the oldest insertion — buckets are never re-inserted,
            # so insertion order is first-seen order.
            evicted, _ = self.buckets.popitem(last=False)
            logger.debug("Evicted rate-limit bucket %s at the ceiling", evicted)


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
        if path == WEBHOOK_PATH and _is_telegram(headers):
            await self._app(scope, receive, send)
            return

        is_strict = path.startswith(STRICT_PREFIX) and path not in STRICT_EXEMPT_PATHS
        rule = self._auth if is_strict else self._general

        if not rule.allows(_caller(headers, scope), time.monotonic()):
            logger.info("Rate-limited %s %s", scope.get("method"), path)
            await _too_many_requests(send)
            return

        await self._app(scope, receive, send)


def _is_telegram(headers: Headers) -> bool:
    """Whether this webhook call carries the secret the bot registered with Telegram.

    Compared as bytes for the same reason the handler does it (`telegram/webhook.py`):
    `compare_digest` raises on non-ASCII `str`, and this header is attacker-controlled.
    An unset secret means the webhook mode is off and the handler answers 404 — no reason
    to exempt anything then.
    """
    secret = settings.telegram_webhook_secret
    if not secret:
        return False
    provided = headers.get(WEBHOOK_SECRET_HEADER, "").encode()
    return secrets.compare_digest(provided, secret.encode())


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
