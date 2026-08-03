import uuid

import pytest

from app.auth import token_service
from app.auth.models import Role
from app.config import settings


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()

    token = token_service.create_access_token(user_id, Role.ADMIN)
    payload = token_service.decode_access_token(token)

    assert payload.sub == str(user_id)
    assert payload.role == Role.ADMIN


def test_refresh_token_roundtrip() -> None:
    user_id = uuid.uuid4()

    token, expires_at = token_service.create_refresh_token(user_id)
    payload = token_service.decode_refresh_token(token)

    assert payload.sub == str(user_id)
    assert expires_at.tzinfo is not None


def test_decode_access_token_rejects_a_refresh_token() -> None:
    token, _ = token_service.create_refresh_token(uuid.uuid4())

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(token)


def test_decode_refresh_token_rejects_an_access_token() -> None:
    token = token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_refresh_token(token)


def test_decode_access_token_rejects_tampered_signature() -> None:
    # Flip a character in the middle of the signature segment, not the last one: the final
    # base64url character of a SHA-256 HMAC only encodes 2 meaningful bits, so roughly 1 in 4
    # single-character edits there leave the decoded signature bytes unchanged (flaky pass).
    token = token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)
    header, payload, signature = token.split(".")
    tampered_char_index = len(signature) // 2
    tampered_char = "A" if signature[tampered_char_index] != "A" else "B"
    tampered_signature = (
        signature[:tampered_char_index] + tampered_char + signature[tampered_char_index + 1 :]
    )

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(f"{header}.{payload}.{tampered_signature}")


def test_decode_access_token_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "jwt_access_ttl_seconds", -10)
    token = token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(token)
