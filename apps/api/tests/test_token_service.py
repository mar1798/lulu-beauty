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
    token = token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(token[:-1] + ("A" if token[-1] != "A" else "B"))


def test_decode_access_token_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "jwt_access_ttl_seconds", -10)
    token = token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)

    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(token)
