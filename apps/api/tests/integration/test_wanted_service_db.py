import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.service import UsersService
from app.wanted.models import WantedProduct
from app.wanted.service import ContactRequiredError, WantedProductsService
from tests.integration.factories import make_user


async def test_guest_wish_keeps_the_contact_it_was_given(db_session: AsyncSession) -> None:
    wanted = await WantedProductsService(db_session).submit(
        message="  Нужен крем Cerave  ", user_id=None, name=" Аня ", phone="+996555123456"
    )

    assert wanted.user_id is None
    assert wanted.name == "Аня"
    assert wanted.phone == "+996555123456"
    # Trimmed on the way in: the owner reads this as a line of a shopping list.
    assert wanted.message == "Нужен крем Cerave"


async def test_guest_without_a_contact_is_refused(db_session: AsyncSession) -> None:
    with pytest.raises(ContactRequiredError):
        await WantedProductsService(db_session).submit(
            message="Нужен крем", user_id=None, name="Аня", phone=None
        )


async def test_account_contact_wins_over_the_payload(db_session: AsyncSession) -> None:
    """The form cannot name somebody else: a signed-in number is one Telegram vouched for."""
    user = await make_user(db_session, name="Аня", phone="+996555111222")

    wanted = await WantedProductsService(db_session).submit(
        message="Нужен крем", user_id=user.id, name="Кто-то ещё", phone="+996555999888"
    )

    assert wanted.user_id == user.id
    assert wanted.name == "Аня"
    assert wanted.phone == "+996555111222"


async def test_erased_account_falls_back_to_the_form(db_session: AsyncSession) -> None:
    """Its name and phone are a placeholder and a filled hole - never passed on."""
    user = await make_user(db_session, name="Аня")
    await UsersService(db_session).delete_account(user.id)

    wanted = await WantedProductsService(db_session).submit(
        message="Нужен крем", user_id=user.id, name="Гость", phone="+996555123456"
    )

    assert wanted.name == "Гость"
    assert wanted.phone == "+996555123456"


async def test_erasing_an_account_deletes_its_wishes(db_session: AsyncSession) -> None:
    """They hold their own copy of the name and the number - the point of the erasure."""
    user = await make_user(db_session)
    await WantedProductsService(db_session).submit(
        message="Нужен крем", user_id=user.id, name=None, phone=None
    )

    await UsersService(db_session).delete_account(user.id)

    rows = (await db_session.execute(select(WantedProduct))).scalars().all()
    assert rows == []
