import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.filters import CommandObject
from aiogram.types import Message, ReplyKeyboardRemove
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.auth.telegram_login import AuthSessionPendingError, TelegramLoginService
from app.orders.models import Order, OrderStatus
from app.orders.service import OrderPriceChange
from app.telegram import messages, recipients
from app.telegram.handlers import (
    handle_contact,
    handle_menu_action,
    handle_order_action,
    handle_orders,
    handle_start,
    handle_unlink,
    handle_wishlist,
)
from app.telegram.keyboards import MenuAction, OrderAction
from app.telegram.notify import notify_orders_repriced
from app.telegram.service import BroadcastResult
from app.wishlist.models import WishlistItem
from tests.integration.factories import make_cycle, make_product, make_user


@pytest.fixture
def bot_session(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
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
    # Строками, а не моками: имя нового аккаунта берётся из профиля Telegram.
    message.from_user.first_name = "Test"
    message.from_user.last_name = None
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


async def test_contact_without_a_user_creates_the_account(bot_session: AsyncSession) -> None:
    """Регистрации на сайте нет вовсе: аккаунт рождается здесь и только здесь."""
    message = _contact_message(555, "+996700333444")
    message.from_user.first_name = "Айгуль"
    message.from_user.last_name = "Т."

    await handle_contact(message)

    user = (
        await bot_session.execute(select(User).where(User.phone == "+996700333444"))
    ).scalar_one()
    assert user.telegram_chat_id == 555
    assert user.name == "Айгуль Т."


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


async def test_second_contact_from_the_same_chat_rebinds_freshly_created_accounts(
    bot_session: AsyncSession,
) -> None:
    """Тот же конфликт по UNIQUE chat_id, но оба аккаунта заводит сам бот."""
    await handle_contact(_contact_message(555, "+996700777888"))
    await handle_contact(_contact_message(555, "+996700999000"))

    users = (await bot_session.execute(select(User).order_by(User.phone))).scalars().all()
    assert [(u.phone, u.telegram_chat_id) for u in users] == [
        ("+996700777888", None),
        ("+996700999000", 555),
    ]


async def test_someone_elses_contact_card_binds_nothing(bot_session: AsyncSession) -> None:
    """Otherwise: pick a victim out of your address book, share their card, and every OTP
    issued for their phone lands in your chat."""
    victim = await make_user(bot_session, phone="+996700111222")
    await bot_session.commit()

    message = _contact_message(555, "+996700111222", owner_id=999)
    await handle_contact(message)

    await bot_session.refresh(victim)
    assert victim.telegram_chat_id is None
    assert "только свой номер" in message.answer.await_args.args[0]


async def test_a_contact_with_no_telegram_account_behind_it_binds_nothing(
    bot_session: AsyncSession,
) -> None:
    """A card typed in by hand has no user_id at all — it proves nothing about the sender."""
    message = _contact_message(555, "+996700333444", owner_id=None)
    message.contact.user_id = None
    await handle_contact(message)

    assert (await bot_session.execute(select(User))).scalars().all() == []


async def test_start_with_a_login_payload_signs_in_a_bound_chat(
    bot_session: AsyncSession,
) -> None:
    """Привязанный чат — это уже вход: спрашивать нечего, кода не существует."""
    user = await make_user(bot_session, phone="+996700111222", telegram_chat_id=555)
    service = TelegramLoginService(bot_session)
    started = await service.start()
    await bot_session.commit()

    await handle_start(
        _command_message(555), CommandObject(command="start", args=started.link_payload)
    )

    assert (await service.claim(str(started.session.id), started.poll_secret)).id == user.id


async def test_start_then_contact_registers_and_signs_in(bot_session: AsyncSession) -> None:
    """Новый человек: /start по ссылке, «поделиться номером» — и вкладка впускает его."""
    service = TelegramLoginService(bot_session)
    started = await service.start()
    await bot_session.commit()

    await handle_start(
        _command_message(555), CommandObject(command="start", args=started.link_payload)
    )
    await handle_contact(_contact_message(555, "+996700333444"))

    claimed = await service.claim(str(started.session.id), started.poll_secret)
    assert claimed.phone == "+996700333444"
    assert claimed.telegram_chat_id == 555


async def test_start_without_a_payload_leaves_the_login_untouched(
    bot_session: AsyncSession,
) -> None:
    """Голый /start — не вход: иначе любой чужой /start подтверждал бы чью-то вкладку."""
    await make_user(bot_session, phone="+996700111222", telegram_chat_id=555)
    service = TelegramLoginService(bot_session)
    started = await service.start()
    await bot_session.commit()

    await handle_start(_command_message(555), CommandObject(command="start", args=None))

    with pytest.raises(AuthSessionPendingError):
        await service.claim(str(started.session.id), started.poll_secret)


def _menu_query(chat_id: int) -> MagicMock:
    query = MagicMock()
    query.from_user.id = chat_id
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.answer = AsyncMock()
    query.message.edit_text = AsyncMock()
    return query


async def test_unlink_asks_before_it_releases_the_chat(bot_session: AsyncSession) -> None:
    """Two presses, not one: the button sits on the help screen where a stray tap is
    cheap, and a released chat_id costs the person a whole re-link."""
    user = await make_user(bot_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await bot_session.commit()

    asked = _menu_query(555)
    await handle_menu_action(asked, MenuAction(action="unlink"))

    await bot_session.refresh(user)
    assert user.telegram_chat_id == 555

    confirmed = _menu_query(555)
    await handle_menu_action(confirmed, MenuAction(action="unlink_confirm"))

    await bot_session.refresh(user)
    assert user.telegram_chat_id is None
    # Клавиатура живёт у чата, а не у сообщения: правкой старого её не снять.
    assert isinstance(
        confirmed.message.answer.await_args.kwargs["reply_markup"], ReplyKeyboardRemove
    )


async def test_declining_the_unlink_keeps_the_binding(bot_session: AsyncSession) -> None:
    user = await make_user(bot_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await bot_session.commit()

    query = _menu_query(555)
    await handle_menu_action(query, MenuAction(action="unlink_cancel"))

    await bot_session.refresh(user)
    assert user.telegram_chat_id == 555
    # Ответ на вопрос убирает и сам вопрос — иначе к нему вернутся второй раз.
    query.message.edit_text.assert_awaited_once()


async def test_the_typed_unlink_alias_asks_the_same_question(bot_session: AsyncSession) -> None:
    """/unlink stayed as an alias, and an alias that skipped the confirmation would make
    the safety of the operation depend on which way in you happened to know."""
    user = await make_user(bot_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await bot_session.commit()

    message = _command_message(555)
    await handle_unlink(message)

    await bot_session.refresh(user)
    assert user.telegram_chat_id == 555
    assert message.answer.await_args.kwargs["reply_markup"] is not None


async def test_buttons_from_an_unlinked_chat_offer_the_way_to_link(
    bot_session: AsyncSession,
) -> None:
    """The five menu buttons are all useless without an account, so the answer is not a
    sentence about /start but the one button that does something."""
    message = _command_message(999)

    await handle_orders(message)

    assert "не привязан" in message.answer.await_args.args[0]
    markup = message.answer.await_args.kwargs["reply_markup"]
    assert markup.keyboard[0][0].request_contact is True


async def test_wishlist_button_lists_saved_products(bot_session: AsyncSession) -> None:
    """The sweep has been moving abandoned carts into the wishlist for a while; until
    the menu there was no way to look at one from the chat."""
    user = await make_user(bot_session, phone="+996700111222")
    user.telegram_chat_id = 555
    product = await make_product(bot_session, name="Крем для рук")
    bot_session.add(WishlistItem(user_id=user.id, product_id=product.id))
    await bot_session.commit()

    message = _command_message(555)
    await handle_wishlist(message)

    assert "Крем для рук" in message.answer.await_args.args[0]


async def test_find_user_by_chat_id_is_the_bots_only_way_in(db_session: AsyncSession) -> None:
    user = await make_user(db_session, phone="+996700111222")
    user.telegram_chat_id = 555
    await db_session.flush()

    assert (await recipients.find_user_by_chat_id(db_session, 555)) is not None
    assert (await recipients.find_user_by_chat_id(db_session, 556)) is None


async def test_broadcast_audience_is_only_linked_users(db_session: AsyncSession) -> None:
    """Отвязанный чат (бот заблокирован, чат удалён) — аккаунт жив, но недостижим."""
    linked = await make_user(db_session, phone="+996700111111", telegram_chat_id=1)
    unlinked = await make_user(db_session, phone="+996700222222")
    await db_session.flush()

    audience = await recipients.get_broadcast_audience(db_session)

    ids = {user.id for user in audience}
    assert linked.id in ids
    assert unlinked.id not in ids


async def test_clear_stale_bindings_frees_the_chat_for_relinking(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session, phone="+996700111222", telegram_chat_id=555)
    await db_session.flush()

    cleared = await recipients.clear_stale_bindings(db_session, [555, 556])
    await db_session.flush()

    assert cleared == 1
    await db_session.refresh(user)
    assert user.telegram_chat_id is None


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


async def test_repricing_sends_one_notice_per_customer_not_per_order(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A product sits in several pending orders of the same person — one per cycle they
    ordered in. Telegram takes about a message per second per chat, so one message per
    order arrived as the first one and three 429s: news about one order out of three."""

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.notify.async_session", factory)
    send = AsyncMock(return_value=BroadcastResult(sent=2, blocked_chat_ids=[]))
    monkeypatch.setattr("app.telegram.notify.notifications_service.send_order_notices", send)

    customer = await make_user(db_session, telegram_chat_id=555)
    other = await make_user(db_session, phone="+996700333444", telegram_chat_id=556)
    await db_session.flush()

    def change(user_id: uuid.UUID, order_id: uuid.UUID, total_cents: int) -> OrderPriceChange:
        return OrderPriceChange(
            order_id=order_id,
            user_id=user_id,
            product_name="Rose Serum",
            old_price_cents=1000,
            new_price_cents=1500,
            total_cents=total_cents,
        )

    first, second = uuid.uuid4(), uuid.uuid4()
    await notify_orders_repriced(
        [
            change(customer.id, first, 1500),
            change(customer.id, second, 3000),
            change(other.id, uuid.uuid4(), 4500),
        ]
    )

    (deliveries,) = send.await_args.args
    assert [user.id for user, _ in deliveries] == [customer.id, other.id]
    text = dict((user.id, message) for user, message in deliveries)[customer.id]
    assert messages.order_reference(first) in text
    assert messages.order_reference(second) in text
