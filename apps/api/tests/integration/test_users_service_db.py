import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.users.service import UserNotFoundError, UsersService
from tests.integration.factories import make_user


async def test_get_returns_the_user_behind_an_access_token(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700111222", role=Role.ADMIN)

    found = await UsersService(db_session).get(user.id)

    assert found.id == user.id
    assert found.phone == "+996700111222"
    assert found.role is Role.ADMIN


async def test_get_raises_for_unknown_user(db_session: AsyncSession) -> None:
    # Access tokens are verified without a DB lookup, so a token can outlive its user.
    with pytest.raises(UserNotFoundError):
        await UsersService(db_session).get(uuid.uuid4())


async def test_update_changes_only_the_provided_fields(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700333444")
    original_phone = user.phone

    updated = await UsersService(db_session).update(user.id, {"name": "Aigul"})

    assert updated.name == "Aigul"
    assert updated.phone == original_phone


async def test_update_with_no_fields_is_a_noop(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    original_name = user.name

    updated = await UsersService(db_session).update(user.id, {})

    assert updated.name == original_name
