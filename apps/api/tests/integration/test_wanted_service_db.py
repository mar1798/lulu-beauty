import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.service import UsersService
from app.wanted.models import WantedProduct
from app.wanted.service import AccountGoneError, WantedProductsService
from tests.integration.factories import make_user


async def test_wish_copies_the_account_contact(db_session: AsyncSession) -> None:
    """The number is one Telegram vouched for, not one typed into a form."""
    user = await make_user(db_session, name="Аня", phone="+996555111222")

    wanted = await WantedProductsService(db_session).submit(
        message="  Нужен крем Cerave  ", user_id=user.id
    )

    assert wanted.user_id == user.id
    assert wanted.name == "Аня"
    assert wanted.phone == "+996555111222"
    # Trimmed on the way in: the owner reads this as a line of a shopping list.
    assert wanted.message == "Нужен крем Cerave"


async def test_erased_account_is_refused(db_session: AsyncSession) -> None:
    """Its name and phone are a placeholder and a filled hole - never passed on."""
    user = await make_user(db_session, name="Аня")
    await UsersService(db_session).delete_account(user.id)

    with pytest.raises(AccountGoneError):
        await WantedProductsService(db_session).submit(message="Нужен крем", user_id=user.id)


async def test_missing_account_is_refused(db_session: AsyncSession) -> None:
    with pytest.raises(AccountGoneError):
        await WantedProductsService(db_session).submit(message="Нужен крем", user_id=uuid.uuid4())


async def test_erasing_an_account_deletes_its_wishes(db_session: AsyncSession) -> None:
    """They hold their own copy of the name and the number - the point of the erasure."""
    user = await make_user(db_session)
    await WantedProductsService(db_session).submit(message="Нужен крем", user_id=user.id)

    await UsersService(db_session).delete_account(user.id)

    rows = (await db_session.execute(select(WantedProduct))).scalars().all()
    assert rows == []
