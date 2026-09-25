import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import token_service
from app.auth.models import ADMIN_ROLES, Role

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


async def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """The admin panel: ADMIN and SUPER_ADMIN alike, they see the same sections."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin_only")
    return current_user


async def require_super_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Handing out admin rights — the one thing an ADMIN cannot do.

    Deliberately not a 404: an ADMIN opening the accounts list can see the page and the
    roles on it, so pretending the endpoint isn't there would only make the refusal
    harder to explain, not harder to find.
    """
    if current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "super_admin_only")
    return current_user
