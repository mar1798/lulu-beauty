from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.telegram import recipients
from app.users.service import OwnRoleChangeError, UsersService
from tests.integration.factories import make_user

"""Управление ролями: владельцев может быть больше одного.

Рассылки бота и раньше шли всем `ADMIN` (`recipients.get_owners`), а сид заводил
ровно одного — не было только способа назначить второго, не открывая psql.
"""


async def test_role_is_granted_and_revoked(db_session: AsyncSession) -> None:
    owner = await make_user(db_session, role=Role.ADMIN)
    helper = await make_user(db_session)
    service = UsersService(db_session)

    promoted = await service.set_role(owner.id, helper.id, Role.ADMIN)
    assert promoted.role is Role.ADMIN
    # И уведомления владельцу с этого момента приходят обоим — это и есть смысл роли.
    assert {user.id for user in await recipients.get_owners(db_session)} == {owner.id, helper.id}

    demoted = await service.set_role(owner.id, helper.id, Role.CUSTOMER)
    assert demoted.role is Role.CUSTOMER


async def test_own_role_cannot_be_changed(db_session: AsyncSession) -> None:
    """Единственная защита, которая тут нужна: пока владелец не может разжаловать себя,
    магазин не останется без админов вовсе — а обратно пускал бы только psql."""
    owner = await make_user(db_session, role=Role.ADMIN)

    with pytest.raises(OwnRoleChangeError):
        await UsersService(db_session).set_role(owner.id, owner.id, Role.CUSTOMER)


async def test_list_puts_admins_first_then_the_newest(db_session: AsyncSession) -> None:
    older = await make_user(db_session, name="Старый покупатель")
    newer = await make_user(db_session, name="Новый покупатель")
    admin = await make_user(db_session, name="Владелец", role=Role.ADMIN)
    older.created_at = datetime.now(UTC) - timedelta(days=2)
    newer.created_at = datetime.now(UTC) - timedelta(days=1)
    admin.created_at = datetime.now(UTC) - timedelta(days=3)
    await db_session.flush()

    users, total = await UsersService(db_session).list_page()

    assert total == 3
    # Владелец первый, хотя он самый старый: список открывают ради того, кто имеет доступ.
    assert [user.name for user in users] == ["Владелец", "Новый покупатель", "Старый покупатель"]


async def test_search_finds_by_name_and_phone(db_session: AsyncSession) -> None:
    target = await make_user(db_session, name="Айгуль", phone="+996555111222")
    await make_user(db_session, name="Бакыт", phone="+996555333444")
    service = UsersService(db_session)

    by_name, _ = await service.list_page(search="айгу")
    by_phone, _ = await service.list_page(search="111222")

    assert [user.id for user in by_name] == [target.id]
    assert [user.id for user in by_phone] == [target.id]
