import uuid

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import token_service
from app.auth.dependencies import CurrentUser, get_current_user, require_admin
from app.auth.models import Role


def _bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


async def test_get_current_user_rejects_missing_credentials() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials=None)

    assert exc_info.value.status_code == 401


async def test_get_current_user_returns_identity_from_valid_token() -> None:
    user_id = uuid.uuid4()
    token = token_service.create_access_token(user_id, Role.ADMIN)

    current_user = await get_current_user(credentials=_bearer(token))

    assert current_user == CurrentUser(id=user_id, role=Role.ADMIN)


async def test_get_current_user_rejects_invalid_token() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials=_bearer("not-a-real-token"))

    assert exc_info.value.status_code == 401


async def test_require_admin_allows_admin() -> None:
    admin = CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)

    assert await require_admin(current_user=admin) is admin


async def test_require_admin_rejects_customer() -> None:
    customer = CurrentUser(id=uuid.uuid4(), role=Role.CUSTOMER)

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user=customer)

    assert exc_info.value.status_code == 403
