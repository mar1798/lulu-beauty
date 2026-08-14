import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.auth.telegram_identity import (
    MAX_AGE_SECONDS,
    InvalidTelegramAuthError,
    TelegramAuthExpiredError,
    verify_init_data,
    verify_widget_payload,
)
from app.config import settings

TELEGRAM_ID = 4242


def _sign(secret_key: bytes, fields: dict[str, str]) -> str:
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    return hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()


def _widget_key() -> bytes:
    return hashlib.sha256(settings.telegram_bot_token.encode()).digest()


def _mini_app_key() -> bytes:
    return hmac.new(b"WebAppData", settings.telegram_bot_token.encode(), hashlib.sha256).digest()


def widget_payload(**overrides: str) -> dict[str, str]:
    """What the Login Widget hands the page, signed the way Telegram signs it."""
    fields = {
        "id": str(TELEGRAM_ID),
        "first_name": "Настя",
        "username": "nastya",
        "photo_url": "https://t.me/i/userpic/320/nastya.jpg",
        "auth_date": str(int(time.time())),
    }
    fields.update(overrides)
    return {**fields, "hash": _sign(_widget_key(), fields)}


def init_data(*, extra: dict[str, str] | None = None, **overrides: str) -> str:
    """`window.Telegram.WebApp.initData` — a signed query string, not an object."""
    fields = {
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": json.dumps({"id": TELEGRAM_ID, "first_name": "Настя"}, ensure_ascii=False),
        "auth_date": str(int(time.time())),
    }
    fields.update(overrides)
    signed = {**fields, "hash": _sign(_mini_app_key(), fields)}
    signed.update(extra or {})
    return urlencode(signed)


# ─── Login Widget ────────────────────────────────────────────────────────────────


def test_a_signed_widget_payload_identifies_its_telegram_user() -> None:
    assert verify_widget_payload(widget_payload()) == TELEGRAM_ID


def test_a_widget_payload_with_an_edited_field_is_refused() -> None:
    """The point of the signature: the id travels through the browser, and without the
    check anyone could post someone else's and be let into their account."""
    payload = widget_payload()
    payload["id"] = "1"

    with pytest.raises(InvalidTelegramAuthError):
        verify_widget_payload(payload)


def test_a_widget_payload_with_no_hash_is_refused() -> None:
    payload = widget_payload()
    del payload["hash"]

    with pytest.raises(InvalidTelegramAuthError):
        verify_widget_payload(payload)


def test_an_unknown_field_takes_part_in_the_hash() -> None:
    """Telegram may add fields, and they are all covered by the signature — so a payload
    is hashed whole rather than field by field, and stays verifiable when it grows."""
    fields = {
        "id": str(TELEGRAM_ID),
        "first_name": "Настя",
        "auth_date": str(int(time.time())),
        "something_new": "42",
    }
    payload = {**fields, "hash": _sign(_widget_key(), fields)}

    assert verify_widget_payload(payload) == TELEGRAM_ID


def test_an_old_widget_payload_is_expired_not_invalid() -> None:
    """Told apart on purpose: "press the button again" and "something is wrong with this
    site" are different answers, and only one of them is worth retrying."""
    stale = str(int(time.time()) - MAX_AGE_SECONDS - 60)

    with pytest.raises(TelegramAuthExpiredError):
        verify_widget_payload(widget_payload(auth_date=stale))


# ─── Mini App ────────────────────────────────────────────────────────────────────


def test_signed_init_data_identifies_its_telegram_user() -> None:
    assert verify_init_data(init_data()) == TELEGRAM_ID


def test_init_data_with_an_edited_user_is_refused() -> None:
    raw = init_data()
    tampered = raw.replace(str(TELEGRAM_ID), "1")

    with pytest.raises(InvalidTelegramAuthError):
        verify_init_data(tampered)


def test_the_ed25519_signature_field_is_not_part_of_the_hmac() -> None:
    """Telegram appends `signature` for third-party validation and does not include it
    in the HMAC. Hashed along with the rest, every real Mini App login would fail — and
    it would fail only against the live client, never in a test that built its own data.
    """
    assert verify_init_data(init_data(extra={"signature": "irrelevant-but-present"})) == TELEGRAM_ID


def test_old_init_data_is_expired() -> None:
    stale = str(int(time.time()) - MAX_AGE_SECONDS - 60)

    with pytest.raises(TelegramAuthExpiredError):
        verify_init_data(init_data(auth_date=stale))


def test_a_widget_payload_cannot_be_replayed_as_init_data() -> None:
    """The two keys are derived differently (SHA256 of the token vs. HMAC of it under
    "WebAppData"), which is what keeps one signed payload from being spent as the other.
    """
    payload = widget_payload()
    as_query = urlencode(payload)

    with pytest.raises(InvalidTelegramAuthError):
        verify_init_data(as_query)


def test_nothing_is_accepted_without_a_bot_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unconfigured bot must not become an open door: with no token there is nothing
    to verify against, and "nothing to verify" has to mean "no", not "yes"."""
    payload = widget_payload()
    monkeypatch.setattr(settings, "telegram_bot_token", "")

    with pytest.raises(InvalidTelegramAuthError):
        verify_widget_payload(payload)
