"""A correctly signed token with claims this app doesn't write is a 401, not a 500.

Reachable without forging anything: a token issued before a claim changed shape, or one
minted by a second service sharing the secret. `Role(...)` and `uuid.UUID(...)` both
raise ValueError on such a payload, and neither was inside the guard that turns a bad
token into 401 — so the request died in the dependency instead.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import token_service
from app.auth.dependencies import get_current_user
from app.config import settings


def _signed(claims: dict[str, object]) -> str:
    now = datetime.now(UTC)
    payload = {"type": "access", "iat": now, "exp": now + timedelta(minutes=5), **claims}
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


@pytest.mark.parametrize(
    "claims",
    [
        {"sub": "b8f2c0e6-0000-0000-0000-000000000000", "role": "SUPERUSER"},
        {"sub": "b8f2c0e6-0000-0000-0000-000000000000"},
        {"role": "ADMIN"},
    ],
)
def test_unexpected_claims_are_an_invalid_token(claims: dict[str, object]) -> None:
    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_access_token(_signed(claims))


async def test_a_sub_that_is_not_a_uuid_is_a_401() -> None:
    token = _signed({"sub": "not-a-uuid", "role": "CUSTOMER"})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials)

    assert error.value.status_code == 401
    assert error.value.detail == "invalid_token"


def test_a_refresh_token_without_a_sub_is_an_invalid_token() -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {"type": "refresh", "iat": now, "exp": now + timedelta(days=1)},
        settings.jwt_refresh_secret,
        algorithm="HS256",
    )
    with pytest.raises(token_service.InvalidTokenError):
        token_service.decode_refresh_token(token)
