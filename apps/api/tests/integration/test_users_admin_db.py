from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role
from app.telegram import recipients
from app.users.service import (
    SuperAdminImmutableError,
    SuperAdminNotAssignableError,
    UsersService,
)
from tests.integration.factories import make_user

"""Управление ролями: админов может быть больше одного, super admin — ровно один.

Рассылки бота идут всем, у кого есть доступ (`recipients.get_owners`), а раздаёт
доступ только SUPER_ADMIN — аккаунт, который заводит сид из OWNER_PHONE и роль
которого не меняется ничем, включая его самого.
"""


async def test_role_is_granted_and_revoked(db_session: AsyncSession) -> None:
    owner = await make_user(db_session, role=Role.SUPER_ADMIN)
    helper = await make_user(db_session)
    service = UsersService(db_session)

    promoted = await service.set_role(helper.id, Role.ADMIN)
    assert promoted.role is Role.ADMIN
    # И уведомления владельцу магазина с этого момента приходят обоим — в этом смысл роли.
    assert {user.id for user in await recipients.get_owners(db_session)} == {owner.id, helper.id}

    demoted = await service.set_role(helper.id, Role.CUSTOMER)
    assert demoted.role is Role.CUSTOMER


async def test_super_admin_role_cannot_be_changed(db_session: AsyncSession) -> None:
    """Главная гарантия: пока строку super admin нельзя тронуть, магазин не останется
    без доступа в собственную админку — ни чужими руками, ни своими."""
    owner = await make_user(db_session, role=Role.SUPER_ADMIN)

    with pytest.raises(SuperAdminImmutableError):
        await UsersService(db_session).set_role(owner.id, Role.CUSTOMER)

    with pytest.raises(SuperAdminImmutableError):
        await UsersService(db_session).set_role(owner.id, Role.ADMIN)

    await db_session.refresh(owner)
    assert owner.role is Role.SUPER_ADMIN


async def test_super_admin_cannot_be_granted(db_session: AsyncSession) -> None:
    """Второй super admin — это второй человек, который может отобрать доступ у
    первого. Роль выдаётся только сидом, при настройке магазина."""
    helper = await make_user(db_session)

    with pytest.raises(SuperAdminNotAssignableError):
        await UsersService(db_session).set_role(helper.id, Role.SUPER_ADMIN)

    await db_session.refresh(helper)
    assert helper.role is Role.CUSTOMER


async def test_list_puts_the_super_admin_first_then_admins(db_session: AsyncSession) -> None:
    older = await make_user(db_session, name="Старый покупатель")
    newer = await make_user(db_session, name="Новый покупатель")
    admin = await make_user(db_session, name="Админ", role=Role.ADMIN)
    owner = await make_user(db_session, name="Супер-админ", role=Role.SUPER_ADMIN)
    older.created_at = datetime.now(UTC) - timedelta(days=2)
    newer.created_at = datetime.now(UTC) - timedelta(days=1)
    admin.created_at = datetime.now(UTC) - timedelta(days=3)
    owner.created_at = datetime.now(UTC) - timedelta(days=4)
    await db_session.flush()

    users, total = await UsersService(db_session).list_page()

    assert total == 4
    # Админы первыми, хотя они самые старые: список открывают ради тех, у кого доступ.
    assert [user.name for user in users] == [
        "Супер-админ",
        "Админ",
        "Новый покупатель",
        "Старый покупатель",
    ]


async def test_search_finds_by_name_and_phone(db_session: AsyncSession) -> None:
    target = await make_user(db_session, name="Айгуль", phone="+996555111222")
    await make_user(db_session, name="Бакыт", phone="+996555333444")
    service = UsersService(db_session)

    by_name, _ = await service.list_page(search="айгу")
    by_phone, _ = await service.list_page(search="111222")

    assert [user.id for user in by_name] == [target.id]
    assert [user.id for user in by_phone] == [target.id]
