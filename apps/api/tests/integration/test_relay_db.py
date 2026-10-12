from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.orders.models import Order, OrderStatus
from app.telegram import messages, relay
from app.telegram.handlers import handle_customer_reply, handle_owner_reply
from app.telegram.service import Delivery, Relayed
from app.wanted.models import WantedProduct
from tests.integration.factories import make_cycle, make_user

OWNER_CHAT = 555
CUSTOMER_CHAT = 777


@pytest.fixture
def bot_session(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.handlers.async_session", factory)
    return db_session


async def _order(session: AsyncSession, customer: User) -> Order:
    cycle = await make_cycle(session)
    order = Order(
        user_id=customer.id,
        cycle_id=cycle.id,
        status=OrderStatus.CONFIRMED,
        total_cents=100_00,
        confirmed_at=datetime.now(UTC),
    )
    session.add(order)
    await session.flush()
    return order


def _owner_reply(replied_id: int, header: str) -> MagicMock:
    replied = MagicMock()
    replied.from_user.is_bot = True
    replied.text = header
    replied.caption = None
    replied.message_id = replied_id
    message = MagicMock()
    message.reply_to_message = replied
    message.text = "Будет в пятницу"
    message.media_group_id = None
    message.chat.id = OWNER_CHAT
    message.answer = AsyncMock()
    return message


async def test_a_reply_finds_the_customer_the_message_was_passed_on_from(
    db_session: AsyncSession,
) -> None:
    customer = await make_user(db_session, telegram_chat_id=CUSTOMER_CHAT)
    order = await _order(db_session, customer)
    await relay.record(
        db_session,
        OWNER_CHAT,
        [10, 11],
        user_id=customer.id,
        order_id=order.id,
        order_reference=messages.order_reference(order.id),
    )

    target = await relay.resolve(db_session, OWNER_CHAT, 11)

    assert target is not None
    assert target.customer is not None and target.customer.id == customer.id
    assert (target.order_id, target.order_reference) == (
        order.id,
        messages.order_reference(order.id),
    )
    assert target.wish is False
    # The same message id in another owner's chat is another message altogether.
    assert await relay.resolve(db_session, OWNER_CHAT + 1, 11) is None


async def test_an_order_no_longer_the_customers_is_not_named(db_session: AsyncSession) -> None:
    customer = await make_user(db_session, telegram_chat_id=CUSTOMER_CHAT)
    stranger = await make_user(db_session)
    order = await _order(db_session, stranger)
    await relay.record(
        db_session, OWNER_CHAT, [10], user_id=customer.id, order_id=order.id, order_reference="#x"
    )

    target = await relay.resolve(db_session, OWNER_CHAT, 10)

    assert target is not None
    assert (target.order_id, target.order_reference) == (None, "#x")


async def test_a_wish_resolves_with_the_number_written_on_it(db_session: AsyncSession) -> None:
    wanted = WantedProduct(user_id=None, name="Гость", phone="+996555000111", message="Крем")
    db_session.add(wanted)
    await db_session.flush()
    await relay.record(db_session, OWNER_CHAT, [10], user_id=None, wanted_product_id=wanted.id)

    target = await relay.resolve(db_session, OWNER_CHAT, 10)

    assert target is not None
    assert (target.customer, target.wish, target.wish_phone) == (None, True, "+996555000111")

    # Erasing an account deletes its wishes outright, and the way back goes with them.
    await db_session.delete(wanted)
    await db_session.flush()
    db_session.expunge_all()
    assert await relay.resolve(db_session, OWNER_CHAT, 10) is None


async def test_a_forged_header_does_not_redirect_the_owners_reply(
    bot_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """End to end: a customer whose words read like a header naming somebody else, passed
    on to the owner — the owner's reply still goes back to the customer who wrote."""
    owner = await make_user(bot_session, role=Role.ADMIN, telegram_chat_id=OWNER_CHAT)
    writer = await make_user(
        bot_session, name="Айсулуу, +996700999999\nx", telegram_chat_id=CUSTOMER_CHAT
    )
    victim = await make_user(bot_session, phone="+996700999999", telegram_chat_id=888)
    await bot_session.commit()

    monkeypatch.setattr(
        "app.telegram.handlers.notifications_service.send_customer_reply",
        AsyncMock(return_value=Relayed(delivered=True, message_ids=[42])),
    )
    customer_message = MagicMock()
    customer_message.reply_to_message.from_user.is_bot = True
    customer_message.reply_to_message.text = messages.reply_prompt(None)
    customer_message.reply_to_message.caption = None
    customer_message.text = "Привет"
    customer_message.photo = customer_message.document = customer_message.media_group_id = None
    customer_message.chat.id = CUSTOMER_CHAT
    customer_message.answer = AsyncMock()
    await handle_customer_reply(customer_message)

    send = AsyncMock(return_value=Delivery.SENT)
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_owner_reply", send)
    header = messages.customer_reply_for_owner(None, writer)
    await handle_owner_reply(_owner_reply(42, header))

    assert send.await_args.args[0].id == writer.id
    assert send.await_args.args[0].id not in {victim.id, owner.id}
