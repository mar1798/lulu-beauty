import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.types import Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.orders.models import Order, OrderStatus
from app.telegram import recipients
from app.telegram.handlers import (
    handle_contact,
    handle_order_action,
    handle_orders,
    handle_unlink,
)
from app.telegram.keyboards import OrderAction
from app.telegram.models import PendingTelegramContact
from tests.integration.factories import make_cycle, make_user


@pytest.fixture
def bot_session(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> AsyncSession:
    """Handlers open their own session (they run outside any request); point that at the
    test's session so its writes are visible to the assertions."""

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.handlers.async_session", factory)
    return db_session


def _contact_message(chat_id: int, phone: str, *, owner_id: int | None = None) -> MagicMock:
    """A shared contact. `owner_id` is Telegram's own answer to "whose card is this" —
    it defaults to the sender, i.e. the share-contact button; pass someone else's id to
    model a card picked out of the address book."""
    message = MagicMock()
    message.chat.id = chat_id
    message.from_user.id = chat_id
    message.contact.phone_number = phone
    message.contact.user_id = chat_id if owner_id is None else owner_id
    message.answer = AsyncMock()
    return message


def _command_message(chat_id: int) -> MagicMock:
    message = MagicMock()
    message.chat.id = chat_id
    message.answer = AsyncMock()
    return message


async def test_contact_binds_an_existing_user(bot_session: AsyncSession) -> None:
    user = await make_user(bot_session, phone="+996700111222")
    await bot_session.commit()

    await handle_contact(_contact_message(555, "996700111222"))

    await bot_session.refresh(user)
    assert user.telegram_chat_id == 555


async def test_contact_without_a_user_is_parked_as_pending(bot_session: AsyncSession) -> None:
    await handle_contact(_contact_message(555, "+996700333444"))

    pending = (await bot_session.execute(select(PendingTelegramContact))).scalars().all()
    assert [(row.phone, row.chat_id) for row in pending] == [("+996700333444", 555)]


async def test_second_contact_from_the_same_chat_rebinds_instead_of_crashing(
    bot_session: AsyncSession,
) -> None:
    """Both chat_id columns are UNIQUE, so the naive "insert a new row" path raised
    IntegrityError out of the handler — reachable by one person sharing two different
    contacts from the same chat (their own, then a relative's)."""
    first = await make_user(bot_session, phone="+996700111222")
    second = await make_user(bot_session, phone="+996700555666")
    await bot_session.commit()

    await handle_contact(_contact_message(555, "+996700111222"))
    await handle_contact(_contact_message(555, "+996700555666"))

    await bot_session.refresh(first)
    await bot_session.refresh(second)
    assert first.telegram_chat_id is None  # released, not left duplicated
    assert second.telegram_chat_id == 555


async def test_second_pending_contact_from_the_same_chat_rebinds(
    bot_session: AsyncSession,
) -> None:
    """Same collision, on the pending table — neither phone has an account yet."""
    await handle_contact(_contact_message(555, "+996700777888"))
    await handle_contact(_contact_message(555, "+996700999000"))

    pending = (await bot_session.execute(select(PendingTelegramContact))).scalars().all()
    assert [(row.phone, row.chat_id) for row in pending] == [("+996700999000", 555)]


async def test_someone_elses_contact_card_binds_nothing(bot_session: AsyncSession) -> None:
    """Otherwise: pick a victim out of your address book, share their card, and every OTP
    issued for their phone lands in your chat."""
    victim = await make_user(bot_session, phone="+996700111222")
    await bot_session.commit()

    message = _contact_message(555, "+996700111222", owner_id=999)
    await handle_contact(message)

    await bot_session.refresh(victim)
    assert victim.telegram_chat_id is None
    assert (await bot_session.execute(select(PendingTelegramContact))).scalars().all() == []
    assert "только свой номер" in message.answer.await_args.args[0]


async def test_a_contact_with_no_telegram_account_behind_it_binds_nothing(
    bot_session: AsyncSession,
) -> None:
    """A card typed in by hand has no user_id at all — it proves nothing about the sender."""
    message = _contact_message(555, "+996700333444", owner_id=None)
    message.contact.user_id = None
    await handle_contact(message)

    assert (await bot_session.execute(select(PendingTelegramContact))).scalars().all() == []


async def test_unlink_releases_the_chat(bot_session: AsyncSession) -> None:
    user = await make_user(bot_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await bot_session.commit()

    await handle_unlink(_command_message(555))

    await bot_session.refresh(user)
    assert user.telegram_chat_id is None


async def test_commands_from_an_unlinked_chat_say_so_instead_of_failing(
    bot_session: AsyncSession,
) -> None:
    message = _command_message(999)

    await handle_orders(message)

    assert "не привязан" in message.answer.await_args.args[0]


async def test_find_user_by_chat_id_is_the_bots_only_way_in(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await db_session.flush()

    assert (await recipients.find_user_by_chat_id(db_session, 555)) is not None
    assert (await recipients.find_user_by_chat_id(db_session, 556)) is None


async def test_broadcast_audience_is_only_verified_and_linked_users(
    db_session: AsyncSession,
) -> None:
    linked = await make_user(db_session, phone="+996700111111")
    linked.telegram_chat_id = 1
    unlinked = await make_user(db_session, phone="+996700222222")
    unverified = await make_user(db_session, phone="+996700333333", phone_verified=False)
    unverified.telegram_chat_id = 3
    await db_session.flush()

    audience = await recipients.get_broadcast_audience(db_session)

    ids = {user.id for user in audience}
    assert linked.id in ids
    assert unlinked.id not in ids
    assert unverified.id not in ids


async def test_clear_stale_bindings_frees_the_chat_for_relinking(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session, phone="+996700111222")
    user.telegram_chat_id = 555
    db_session.add(PendingTelegramContact(phone="+996700999888", chat_id=556))
    await db_session.flush()

    cleared = await recipients.clear_stale_bindings(db_session, [555, 556])
    await db_session.flush()

    assert cleared == 1  # one User row; the pending row is deleted, not counted
    await db_session.refresh(user)
    assert user.telegram_chat_id is None
    assert (await db_session.execute(select(PendingTelegramContact))).scalars().all() == []


def _callback_query(chat_id: int, order_id: uuid.UUID) -> MagicMock:
    """spec=Message on the carrier message so the handler's isinstance narrowing (which
    exists because Telegram may hand back an InaccessibleMessage) takes the edit branch."""
    query = MagicMock()
    query.from_user.id = chat_id
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.text = f"🆕 Новая заявка #{str(order_id)[:8]}"
    query.message.edit_text = AsyncMock()
    return query


async def _make_order(session: AsyncSession, customer: User) -> Order:
    cycle = await make_cycle(session)
    order = Order(
        user_id=customer.id,
        cycle_id=cycle.id,
        status=OrderStatus.PENDING,
        total_cents=1000,
    )
    session.add(order)
    await session.flush()
    return order


@pytest.fixture
def sent_status_notifications(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """The customer-facing half of the callback opens its own session and talks to
    Telegram; here only the fact that it was triggered is under test."""
    notify = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.notify_order_status", notify)
    return notify


async def test_owner_confirms_an_order_from_the_notification(
    bot_session: AsyncSession, sent_status_notifications: AsyncMock
) -> None:
    owner = await make_user(bot_session, phone="+996700111222", role=Role.ADMIN)
    owner.telegram_chat_id = 555
    customer = await make_user(bot_session, phone="+996700333444")
    order = await _make_order(bot_session, customer)
    await bot_session.commit()

    query = _callback_query(555, order.id)
    await handle_order_action(query, OrderAction(action="confirm", order_id=order.id))

    await bot_session.refresh(order)
    assert order.status is OrderStatus.CONFIRMED
    query.answer.assert_awaited_once()
    # The buttons go with the edit; leaving them would invite a second press.
    query.message.edit_text.assert_awaited_once()
    assert "Подтверждена" in query.message.edit_text.await_args.args[0]
    sent_status_notifications.assert_awaited_once_with(order.id)


async def test_a_customer_pressing_the_owners_button_changes_nothing(
    bot_session: AsyncSession, sent_status_notifications: AsyncMock
) -> None:
    """callback_data is client-side data: anyone who can reach the bot can replay it, so
    the check is the presser's role, not the fact that a button was rendered for them."""
    customer = await make_user(bot_session, phone="+996700333444")
    customer.telegram_chat_id = 777
    order = await _make_order(bot_session, customer)
    await bot_session.commit()

    query = _callback_query(777, order.id)
    await handle_order_action(query, OrderAction(action="cancel", order_id=order.id))

    await bot_session.refresh(order)
    assert order.status is OrderStatus.PENDING
    assert query.answer.await_args.kwargs["show_alert"] is True
    query.message.edit_text.assert_not_awaited()
    sent_status_notifications.assert_not_awaited()


async def test_an_unlinked_chat_cannot_act_on_orders(
    bot_session: AsyncSession, sent_status_notifications: AsyncMock
) -> None:
    customer = await make_user(bot_session, phone="+996700333444")
    order = await _make_order(bot_session, customer)
    await bot_session.commit()

    query = _callback_query(999, order.id)
    await handle_order_action(query, OrderAction(action="confirm", order_id=order.id))

    await bot_session.refresh(order)
    assert order.status is OrderStatus.PENDING


async def test_acting_on_a_deleted_order_answers_instead_of_raising(
    bot_session: AsyncSession, sent_status_notifications: AsyncMock
) -> None:
    """An unanswered callback leaves the client spinning on the button for half a minute,
    and the notification outlives the order the owner deleted from the admin panel."""
    owner = await make_user(bot_session, phone="+996700111222", role=Role.ADMIN)
    owner.telegram_chat_id = 555
    await bot_session.commit()
    gone = uuid.uuid4()

    query = _callback_query(555, gone)
    await handle_order_action(query, OrderAction(action="confirm", order_id=gone))

    query.answer.assert_awaited_once()
    sent_status_notifications.assert_not_awaited()


async def test_get_owners_returns_every_admin(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, phone="+996700111222", role=Role.ADMIN)
    await make_user(db_session, phone="+996700333444")
    await db_session.flush()

    owners = await recipients.get_owners(db_session)

    assert [owner.id for owner in owners] == [admin.id]
