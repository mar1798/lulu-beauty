import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import token_service
from app.auth.models import Role

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
    except token_service.InvalidTokenError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token") from error

    return CurrentUser(id=uuid.UUID(payload.sub), role=payload.role)


async def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin_only")
    return current_user
