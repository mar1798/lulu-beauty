import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import token_service
from app.auth.dependencies import (
    CurrentUser,
    get_current_user,
    require_admin,
    require_live_user,
    require_super_admin,
)
from app.auth.models import Role


def _bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _session(role: Role | None) -> AsyncMock:
    """A session whose role lookup answers `role` — None for an erased account."""
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=role)
    return session


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

    assert await require_admin(current_user=admin, session=_session(Role.ADMIN)) == admin


async def test_require_admin_allows_super_admin() -> None:
    """SUPER_ADMIN sees every section an ADMIN sees — the roles differ over who may
    hand out rights, not over what the panel shows."""
    owner = CurrentUser(id=uuid.uuid4(), role=Role.SUPER_ADMIN)

    assert await require_admin(current_user=owner, session=_session(Role.SUPER_ADMIN)) == owner


async def test_require_admin_rejects_customer() -> None:
    customer = CurrentUser(id=uuid.uuid4(), role=Role.CUSTOMER)

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user=customer, session=_session(Role.CUSTOMER))

    assert exc_info.value.status_code == 403


async def test_require_admin_trusts_the_database_over_the_token() -> None:
    """Роль сняли, а токен ещё жив пятнадцать минут — панель закрывается сразу."""
    demoted = CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user=demoted, session=_session(Role.CUSTOMER))

    assert exc_info.value.status_code == 403


async def test_require_admin_rejects_an_erased_account() -> None:
    admin = CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user=admin, session=_session(None))

    assert exc_info.value.status_code == 401


async def test_require_live_user_rejects_an_erased_account() -> None:
    """Удалённый аккаунт не оформляет заявки остатком жизни своего токена."""
    customer = CurrentUser(id=uuid.uuid4(), role=Role.CUSTOMER)

    with pytest.raises(HTTPException) as exc_info:
        await require_live_user(current_user=customer, session=_session(None))

    assert exc_info.value.status_code == 401
    assert (
        await require_live_user(current_user=customer, session=_session(Role.CUSTOMER)) == customer
    )


async def test_require_super_admin_allows_super_admin() -> None:
    owner = CurrentUser(id=uuid.uuid4(), role=Role.SUPER_ADMIN)

    assert (
        await require_super_admin(current_user=owner, session=_session(Role.SUPER_ADMIN)) == owner
    )


async def test_require_super_admin_rejects_admin() -> None:
    """The whole point of the second role: an admin has the panel but not its keys."""
    admin = CurrentUser(id=uuid.uuid4(), role=Role.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await require_super_admin(current_user=admin, session=_session(Role.ADMIN))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "super_admin_only"
