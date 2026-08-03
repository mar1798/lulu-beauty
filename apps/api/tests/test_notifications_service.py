from datetime import UTC, datetime
from unittest.mock import AsyncMock

from app.auth.models import OtpPurpose, User
from app.telegram.service import NotificationsService


def _user(telegram_chat_id: int | None) -> User:
    return User(
        phone="+996700123456",
        name="Test User",
        password_hash="irrelevant",
        telegram_chat_id=telegram_chat_id,
    )


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
