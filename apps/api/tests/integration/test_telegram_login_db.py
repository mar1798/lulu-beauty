import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import TelegramAuthSession
from app.auth.telegram_login import (
    AuthSessionExpiredError,
    AuthSessionNotFoundError,
    AuthSessionPendingError,
    TelegramAccountNotLinkedError,
    TelegramLoginService,
)
from tests.integration.factories import make_user


async def _started(session: AsyncSession) -> tuple[TelegramLoginService, str, str, str]:
    service = TelegramLoginService(session)
    started = await service.start()
    return service, str(started.session.id), started.link_payload, started.poll_secret


async def test_a_fresh_session_is_pending(db_session: AsyncSession) -> None:
    service, session_id, _, secret = await _started(db_session)

    with pytest.raises(AuthSessionPendingError):
        await service.claim(session_id, secret)


async def test_start_and_confirm_from_a_bound_chat(db_session: AsyncSession) -> None:
    user = await make_user(db_session, telegram_chat_id=555)
    service, session_id, payload, secret = await _started(db_session)

    auth_session = await service.attach_chat(payload, 555)
    assert auth_session is not None
    await service.authorize(auth_session, user)

    assert (await service.claim(session_id, secret)).id == user.id


async def test_a_session_can_be_claimed_only_once(db_session: AsyncSession) -> None:
    """Ссылка входа стоит ровно один вход — дальше живут куки."""
    user = await make_user(db_session, telegram_chat_id=555)
    service, session_id, payload, secret = await _started(db_session)
    auth_session = await service.attach_chat(payload, 555)
    assert auth_session is not None
    await service.authorize(auth_session, user)
    await service.claim(session_id, secret)

    with pytest.raises(AuthSessionNotFoundError):
        await service.claim(session_id, secret)


async def test_the_link_payload_does_not_let_anyone_claim(db_session: AsyncSession) -> None:
    """Главное свойство схемы: payload виден в переписке, и им нельзя забрать вход."""
    user = await make_user(db_session, telegram_chat_id=555)
    service, session_id, payload, _ = await _started(db_session)
    auth_session = await service.attach_chat(payload, 555)
    assert auth_session is not None
    await service.authorize(auth_session, user)

    with pytest.raises(AuthSessionNotFoundError):
        await service.claim(session_id, payload)


async def test_a_secret_from_another_session_is_refused(db_session: AsyncSession) -> None:
    service, session_id, _, _ = await _started(db_session)
    _, _, _, other_secret = await _started(db_session)

    with pytest.raises(AuthSessionNotFoundError):
        await service.claim(session_id, other_secret)


async def test_an_expired_session_cannot_be_claimed(db_session: AsyncSession) -> None:
    user = await make_user(db_session, telegram_chat_id=555)
    service, session_id, payload, secret = await _started(db_session)
    auth_session = await service.attach_chat(payload, 555)
    assert auth_session is not None
    await service.authorize(auth_session, user)
    auth_session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    with pytest.raises(AuthSessionExpiredError):
        await service.claim(session_id, secret)


async def test_an_expired_link_is_not_attachable(db_session: AsyncSession) -> None:
    service, _, payload, _ = await _started(db_session)
    stored = (
        await db_session.execute(
            select(TelegramAuthSession).where(TelegramAuthSession.link_payload == payload)
        )
    ).scalar_one()
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    assert await service.attach_chat(payload, 555) is None


async def test_an_unknown_payload_is_not_attachable(db_session: AsyncSession) -> None:
    service = TelegramLoginService(db_session)

    assert await service.attach_chat("payload-from-another-deploy", 555) is None


async def test_pending_lookup_finds_the_session_opened_from_this_chat(
    db_session: AsyncSession,
) -> None:
    """Контакт приходит отдельным сообщением — связывает их только chat_id."""
    service, _, payload, _ = await _started(db_session)
    await service.attach_chat(payload, 555)

    found = await service.find_pending_for_chat(555)

    assert found is not None
    assert found.link_payload == payload
    assert await service.find_pending_for_chat(556) is None


async def test_pending_lookup_ignores_an_already_authorized_session(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session, telegram_chat_id=555)
    service, _, payload, _ = await _started(db_session)
    auth_session = await service.attach_chat(payload, 555)
    assert auth_session is not None
    await service.authorize(auth_session, user)

    assert await service.find_pending_for_chat(555) is None


async def test_claim_refuses_an_unknown_session_id(db_session: AsyncSession) -> None:
    service, _, _, secret = await _started(db_session)

    with pytest.raises(AuthSessionNotFoundError):
        await service.claim(str(uuid.uuid4()), secret)


async def test_cleanup_removes_expired_and_spent_sessions(db_session: AsyncSession) -> None:
    user = await make_user(db_session, telegram_chat_id=555)
    service = TelegramLoginService(db_session)

    live = await service.start()
    stale = await service.start()
    stale.session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    spent = await service.start()
    await service.authorize(spent.session, user)
    await service.claim(str(spent.session.id), spent.poll_secret)
    await db_session.flush()

    assert await service.cleanup_expired() == 2

    left = (await db_session.execute(select(TelegramAuthSession))).scalars().all()
    assert [row.id for row in left] == [live.session.id]


async def test_a_signature_login_finds_the_account_bound_to_that_telegram_id(
    db_session: AsyncSession,
) -> None:
    """Вход из виджета и из Mini App ищет аккаунт по `telegram_chat_id`: в личном чате,
    где делается привязка, id чата и id пользователя — одно и то же число."""
    user = await make_user(db_session, telegram_chat_id=777)

    assert (await TelegramLoginService(db_session).find_by_telegram_id(777)).id == user.id


async def test_a_signature_login_refuses_a_telegram_id_nobody_shared_a_number_from(
    db_session: AsyncSession,
) -> None:
    """Подпись Telegram доказывает личность, но не даёт телефона, а без него аккаунта
    здесь не существует. Значит, единственный вход для незнакомца — через бота."""
    await make_user(db_session, telegram_chat_id=777)

    with pytest.raises(TelegramAccountNotLinkedError):
        await TelegramLoginService(db_session).find_by_telegram_id(778)
