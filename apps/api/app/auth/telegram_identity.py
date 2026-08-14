"""Signing in when Telegram itself vouches for the browser, with no bot round trip.

Two entry points share this module, and they share it because they are the same trick
with two different keys:

- the **Login Widget** on the site, which hands the page a signed payload of profile
  fields (Telegram's "Checking authorization");
- the **Mini App**, where the site runs inside Telegram's webview and gets the same
  guarantee as a signed `initData` query string.

Both are HMAC-SHA256 over "key=value" lines sorted by key, and in both the key is
derived from the bot token — which is why this can be verified offline, and why the bot
token is the whole secret: anyone holding it can mint either payload.

What neither of them provides is a phone number. An account here cannot exist without
one (see `auth/models.User`), so these paths can only sign in someone who has already
shared their contact with the bot; a stranger gets `TelegramAccountNotLinkedError` from
the service above and is sent to the bot, which is where accounts are born.

Both functions return the Telegram **user id**, which for the private chat every binding
is made in equals the chat id stored in `User.telegram_chat_id` — that equality is the
entire join between a signed payload and an account.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime
from urllib.parse import parse_qsl

from app.config import settings

# How long a signed payload stays usable. Telegram's own guidance is to check `auth_date`
# and reject anything old; a day is generous for a widget press that has to survive the
# page's own round trip, and short enough that a payload dug out of a browser history is
# worthless by the time it is found.
MAX_AGE_SECONDS = 24 * 60 * 60

# Excluded from the string that gets hashed. `hash` is the signature itself; `signature`
# is the newer Ed25519 field Telegram adds for third-party validation, and it is not part
# of what the HMAC covers — leaving it in makes every Mini App login fail.
UNSIGNED_FIELDS = frozenset({"hash", "signature"})


class InvalidTelegramAuthError(Exception):
    """The signature doesn't check out, or the payload is missing what it needs.

    One error for both, deliberately: telling a caller *which* field it got wrong is
    telling a forger how far along they are.
    """


class TelegramAuthExpiredError(Exception):
    """Correctly signed, but `auth_date` is too old to accept."""


def verify_widget_payload(payload: dict[str, str]) -> int:
    """The Login Widget's `data-onauth` object, straight from the page.

    Key: SHA256 of the bot token. Every field the widget sent takes part in the hash,
    including the ones this code has no use for (`photo_url`, `username`) — dropping
    them before verifying would break the signature, so the payload is hashed whole and
    only then read from.
    """
    fields = {key: str(value) for key, value in payload.items() if key not in UNSIGNED_FIELDS}

    secret_key = hashlib.sha256(_token()).digest()
    _check(secret_key, _data_check_string(fields), str(payload.get("hash", "")))
    _check_age(fields.get("auth_date"))

    return _telegram_id(fields.get("id"))


def verify_init_data(init_data: str) -> int:
    """`window.Telegram.WebApp.initData` — the raw query string, not a parsed object.

    Raw on purpose: the values are hashed exactly as Telegram percent-decoded them, and
    a client that parsed and re-encoded the string would sooner or later re-encode one
    character differently and produce a payload that verifies nowhere.

    Key: HMAC of the bot token under the constant "WebAppData" — a different derivation
    from the widget's, so neither payload can be replayed as the other.
    """
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    signed = {key: value for key, value in fields.items() if key not in UNSIGNED_FIELDS}

    secret_key = hmac.new(b"WebAppData", _token(), hashlib.sha256).digest()
    _check(secret_key, _data_check_string(signed), fields.get("hash", ""))
    _check_age(signed.get("auth_date"))

    return _telegram_id(_init_data_user(signed.get("user")).get("id"))


def _token() -> bytes:
    if not settings.telegram_bot_token:
        # Nothing can be verified without a token, and "signature does not match" is the
        # right answer to that: an unconfigured bot must not let anyone in.
        raise InvalidTelegramAuthError
    return settings.telegram_bot_token.encode()


def _data_check_string(fields: dict[str, str]) -> bytes:
    return "\n".join(f"{key}={fields[key]}" for key in sorted(fields)).encode()


def _check(secret_key: bytes, data_check_string: bytes, provided: str) -> None:
    expected = hmac.new(secret_key, data_check_string, hashlib.sha256).hexdigest()
    # Compared as bytes, not as str: `compare_digest` raises TypeError on a str holding
    # anything non-ASCII, and the string being compared here came from a request body —
    # so a forged hash with a Cyrillic letter in it would be a 500 instead of a refusal.
    if not provided or not hmac.compare_digest(expected.encode(), provided.encode()):
        raise InvalidTelegramAuthError


def _check_age(auth_date: str | None) -> None:
    if auth_date is None:
        raise InvalidTelegramAuthError
    try:
        issued_at = datetime.fromtimestamp(int(auth_date), tz=UTC)
    except (ValueError, OverflowError, OSError) as error:
        raise InvalidTelegramAuthError from error

    if (datetime.now(UTC) - issued_at).total_seconds() > MAX_AGE_SECONDS:
        raise TelegramAuthExpiredError


def _init_data_user(raw: str | None) -> dict[str, object]:
    """`initData` carries the profile as a JSON blob inside one field."""
    if raw is None:
        raise InvalidTelegramAuthError
    try:
        user = json.loads(raw)
    except ValueError as error:
        raise InvalidTelegramAuthError from error

    if not isinstance(user, dict):
        raise InvalidTelegramAuthError
    return user


def _telegram_id(raw: object) -> int:
    try:
        return int(str(raw))
    except (TypeError, ValueError) as error:
        raise InvalidTelegramAuthError from error
