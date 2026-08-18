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


async def test_search_treats_like_wildcards_as_literal_text(db_session: AsyncSession) -> None:
    """"%" and "_" are LIKE syntax, and the owner types them as characters.

    Unescaped, "_" matched any single character — so searching for a name containing an
    underscore returned every account whose name differed by one letter, and a lone "%"
    returned the whole table under the guise of a filter.
    """
    await make_user(db_session, name="Аня_К", phone="+996700000001")
    await make_user(db_session, name="АняЛК", phone="+996700000002")
    await make_user(db_session, name="Борис", phone="+996700000003")

    service = UsersService(db_session)

    underscore, total = await service.list_page(search="Аня_")
    assert [user.name for user in underscore] == ["Аня_К"]
    assert total == 1

    percent, total = await service.list_page(search="%")
    assert percent == []
    assert total == 0


async def test_blank_search_is_not_a_filter(db_session: AsyncSession) -> None:
    await make_user(db_session, name="Аня", phone="+996700000004")

    _, total = await UsersService(db_session).list_page(search="   ")

    assert total == 1
