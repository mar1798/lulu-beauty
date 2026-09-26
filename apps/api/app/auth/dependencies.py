import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import token_service
from app.auth.models import ADMIN_ROLES, Role, User
from app.db import get_session

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    role: Role


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """Verifies the access JWT only — no DB lookup, per the plan's stateless-access design."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not_authenticated")

    try:
        payload = token_service.decode_access_token(credentials.credentials)
        # Inside the same guard as the decode: `sub` is a string in the JWT, and one that
        # isn't a uuid is an invalid token rather than an unhandled ValueError two frames
        # below, where it surfaced as a 500.
        user_id = uuid.UUID(payload.sub)
    except (token_service.InvalidTokenError, ValueError) as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token") from error

    return CurrentUser(id=user_id, role=payload.role)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser | None:
    """Who is calling, when the endpoint works either way.

    For the public surface that behaves differently once signed in — `/wanted-products`,
    where an account supplies the name and number the guest form has to ask for. A missing
    *or* unusable token answers None rather than 401: the caller did not claim to be
    anybody, and an expired token on a page that never required a login is the same
    situation as no token at all.
    """
    if credentials is None:
        return None

    try:
        payload = token_service.decode_access_token(credentials.credentials)
        return CurrentUser(id=uuid.UUID(payload.sub), role=payload.role)
    except (token_service.InvalidTokenError, ValueError):
        return None


async def _current_role(user_id: uuid.UUID, session: AsyncSession) -> Role:
    """The role as the database has it now, not as the token claimed it.

    The access token is stateless and lives fifteen minutes, so a role taken away — or
    an account erased — kept its old powers until the token ran out. The admin surface
    is small and rarely called, so it can afford the one lookup per request the rest of
    the API avoids. An erased or missing account answers 401: there is nobody to be.
    """
    role = await session.scalar(
        select(User.role).where(User.id == user_id, User.deleted_at.is_(None))
    )
    if role is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
    return role


async def require_admin(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """The admin panel: ADMIN and SUPER_ADMIN alike, they see the same sections."""
    return await load_admin(current_user.id, session)


async def load_admin(user_id: uuid.UUID, session: AsyncSession) -> CurrentUser:
    """`require_admin` for an identity that did not come from a bearer header.

    The export download link carries its own signed user id; it goes through the same
    database check and answers with the same 401/403 as every admin route.
    """
    role = await _current_role(user_id, session)
    if role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin_only")
    return CurrentUser(id=user_id, role=role)


async def require_super_admin(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """Handing out admin rights — the one thing an ADMIN cannot do.

    Deliberately not a 404: an ADMIN opening the accounts list can see the page and the
    roles on it, so pretending the endpoint isn't there would only make the refusal
    harder to explain, not harder to find.
    """
    role = await _current_role(current_user.id, session)
    if role != Role.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "super_admin_only")
    return CurrentUser(id=current_user.id, role=role)


async def require_live_user(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """`get_current_user`, plus a check that the account has not been erased since.

    For the paths that create something on the account's behalf — checkout, putting
    the first line into a cart. The token outlives an erasure by up to fifteen minutes,
    and in that window a deleted account could still place an order under a name and
    number that no longer exist.
    """
    await _current_role(current_user.id, session)
    return current_user
