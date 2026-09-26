import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt
from pydantic import BaseModel

from app.auth.models import Role
from app.config import settings


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"
    DOWNLOAD = "download"


class InvalidTokenError(Exception):
    pass


class AccessTokenPayload(BaseModel):
    sub: str
    role: Role


class RefreshTokenPayload(BaseModel):
    sub: str


class DownloadTokenPayload(BaseModel):
    sub: str
    export: str
    params: dict[str, Any]


# Long enough for a Telegram client to start the download it was just handed, short enough
# that a link which leaked into a log or a forwarded screenshot is dead by the time anyone
# reads it.
DOWNLOAD_TOKEN_TTL_SECONDS = 120


def create_access_token(user_id: uuid.UUID, role: Role) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "type": TokenType.ACCESS.value,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_access_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


def decode_access_token(token: str) -> AccessTokenPayload:
    payload = _decode(token, settings.jwt_access_secret, TokenType.ACCESS)
    # A correctly signed token whose claims are not what this app writes — a stale token
    # from before a claim was renamed, a role that no longer exists, a hand-made one — is
    # still an invalid token, not a bug. Left to escape, KeyError/ValueError came out of
    # the dependency as a 500 on what the caller should have been told was a 401.
    try:
        return AccessTokenPayload(sub=str(payload["sub"]), role=Role(payload["role"]))
    except (KeyError, ValueError) as error:
        raise InvalidTokenError("unexpected access-token claims") from error


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    """Returns (token, expires_at)."""
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=settings.jwt_refresh_ttl_seconds)
    payload = {
        "sub": str(user_id),
        "type": TokenType.REFRESH.value,
        "iat": now,
        "exp": expires_at,
        # Without this the payload is a pure function of (user, second): `iat`/`exp` are
        # encoded as whole seconds, so two refresh tokens issued for one user inside the
        # same second are byte-identical — and `refresh_tokens.token_hash` is UNIQUE, so
        # the second insert died as a 500 on an ordinary action (two tabs signing in, or
        # two parallel refreshes). A random id per token makes each one its own row.
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")
    return token, expires_at


def decode_refresh_token(token: str) -> RefreshTokenPayload:
    payload = _decode(token, settings.jwt_refresh_secret, TokenType.REFRESH)
    try:
        return RefreshTokenPayload(sub=str(payload["sub"]))
    except KeyError as error:
        raise InvalidTokenError("unexpected refresh-token claims") from error


def create_download_token(user_id: uuid.UUID, export: str, params: dict[str, Any]) -> str:
    """A short-lived link to one xlsx export, for clients that cannot save a blob.

    Telegram's in-app browser and Mini App webview silently ignore `<a download>` on a
    blob URL, so an export fetched with cookies never reaches the owner's phone. The link
    carries its own authorisation instead: who asked, which export and with which
    filters, for two minutes. It is signed with the access secret but typed `download`,
    so it can never pass as an access token (`_decode` checks the type), and the download
    handler re-reads the account's role, so a demotion kills an unused link at once.
    """
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": TokenType.DOWNLOAD.value,
        "export": export,
        "params": params,
        "iat": now,
        "exp": now + timedelta(seconds=DOWNLOAD_TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


def decode_download_token(token: str) -> DownloadTokenPayload:
    payload = _decode(token, settings.jwt_access_secret, TokenType.DOWNLOAD)
    try:
        return DownloadTokenPayload(
            sub=str(payload["sub"]), export=str(payload["export"]), params=payload["params"]
        )
    except (KeyError, ValueError) as error:
        raise InvalidTokenError("unexpected download-token claims") from error


def _decode(token: str, secret: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise InvalidTokenError(str(error)) from error

    if payload.get("type") != expected_type.value:
        raise InvalidTokenError(f"expected a {expected_type.value} token")

    return payload
