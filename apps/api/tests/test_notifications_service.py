import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter

from app.auth.models import OtpPurpose, User
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderStatus
from app.telegram.keyboards import OrderAction
from app.telegram.service import NotificationsService


def _user(telegram_chat_id: int | None) -> User:
    return User(
        phone="+996700123456",
        name="Test User",
        password_hash="irrelevant",
        telegram_chat_id=telegram_chat_id,
    )


def _order(status: OrderStatus = OrderStatus.PENDING) -> Order:
    order = Order(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=status,
        total_cents=1000,
        note=None,
    )
    order.items = []
    return order


def _cycle() -> OrderCycle:
    return OrderCycle(deadline_at=datetime(2030, 6, 12, tzinfo=UTC), label="Июнь")


async def test_send_otp_uses_telegram_when_bound() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_otp(_user(telegram_chat_id=42), "123456", OtpPurpose.LOGIN)

    bot.send_message.assert_awaited_once()
    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert "123456" in message


async def test_send_otp_falls_back_when_not_bound() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_otp(_user(telegram_chat_id=None), "123456", OtpPurpose.LOGIN)

    bot.send_message.assert_not_awaited()


async def test_send_otp_falls_back_when_no_bot_configured() -> None:
    service = NotificationsService(None)

    await service.send_otp(_user(telegram_chat_id=42), "123456", OtpPurpose.LOGIN)


async def test_send_reminder_uses_telegram_when_bound() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), "Cycle 1", datetime.now(UTC))

    bot.send_message.assert_awaited_once()


async def test_send_otp_falls_back_when_telegram_delivery_raises() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = RuntimeError("network error")
    service = NotificationsService(bot)

    # Must not raise: a Telegram delivery failure shouldn't break register/login.
    await service.send_otp(_user(telegram_chat_id=42), "123456", OtpPurpose.LOGIN)


async def test_send_new_order_reaches_the_owners_chat() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    owner = _user(telegram_chat_id=7)

    await service.send_new_order(owner, _order(), _user(telegram_chat_id=None), _cycle())

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 7
    assert "Новая заявка" in message


async def test_send_new_order_carries_the_confirm_cancel_buttons() -> None:
    """The point of the notification is that the owner can act on it without opening the
    admin panel; without the markup it's just a receipt."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order()

    await service.send_new_order(_user(telegram_chat_id=7), order, None, _cycle())

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    payloads = [
        OrderAction.unpack(button.callback_data or "")
        for row in markup.inline_keyboard
        for button in row
    ]
    assert {payload.order_id for payload in payloads} == {order.id}


async def test_send_reminder_links_to_checkout_when_the_site_is_public(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), "Cycle 1", datetime.now(UTC))

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    assert markup.inline_keyboard[0][0].url == "https://lulu.example.com/checkout"


async def test_send_reminder_still_goes_out_without_a_linkable_site(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), "Cycle 1", datetime.now(UTC))

    bot.send_message.assert_awaited_once()
    assert bot.send_message.await_args.kwargs["reply_markup"] is None


async def test_send_order_status_stays_silent_on_pending() -> None:
    """The owner restoring an order they cancelled is not news the customer needs."""
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(_user(telegram_chat_id=42), _order(OrderStatus.PENDING))

    bot.send_message.assert_not_awaited()


async def test_send_order_status_announces_a_real_move() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(_user(telegram_chat_id=42), _order(OrderStatus.READY))

    bot.send_message.assert_awaited_once()


async def test_broadcast_counts_deliveries_and_skips_unbound_users() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    audience = [_user(telegram_chat_id=1), _user(telegram_chat_id=None), _user(2)]

    result = await service.send_cycle_opened(audience, _cycle())

    assert result.sent == 2
    assert result.blocked_chat_ids == []


async def test_broadcast_reports_blocked_chats_instead_of_counting_them() -> None:
    """A 403 means the binding is dead, not that the send should be retried — the
    caller drops the row so the next cycle doesn't pay for it again."""
    bot = AsyncMock()
    bot.send_message.side_effect = [
        None,
        TelegramForbiddenError(method=AsyncMock(), message="bot was blocked by the user"),
    ]
    service = NotificationsService(bot)

    result = await service.send_cycle_opened([_user(1), _user(2)], _cycle())

    assert result.sent == 1
    assert result.blocked_chat_ids == [2]


async def test_broadcast_survives_one_chat_failing() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = [RuntimeError("network error"), None]
    service = NotificationsService(bot)

    result = await service.send_cycle_opened([_user(1), _user(2)], _cycle())

    assert result.sent == 1
    assert result.blocked_chat_ids == []


async def test_delivery_retries_once_after_a_flood_wait() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = [
        TelegramRetryAfter(method=AsyncMock(), message="Too Many Requests", retry_after=0),
        None,
    ]
    service = NotificationsService(bot)

    await service.send_otp(_user(telegram_chat_id=42), "123456", OtpPurpose.LOGIN)

    assert bot.send_message.await_count == 2


async def test_delivery_gives_up_after_a_second_flood_wait() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = TelegramRetryAfter(
        method=AsyncMock(), message="Too Many Requests", retry_after=0
    )
    service = NotificationsService(bot)

    # Must not recurse forever, and must not raise into the caller.
    await service.send_otp(_user(telegram_chat_id=42), "123456", OtpPurpose.LOGIN)

    assert bot.send_message.await_count == 2
