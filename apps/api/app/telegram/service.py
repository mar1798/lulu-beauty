import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from aiogram import Bot

from app.auth.models import OtpPurpose, User
from app.config import settings

logger = logging.getLogger("app.telegram")


def _format_deadline(deadline_at: datetime) -> str:
    """Deadline in the shop's local timezone — reminders are read by customers, not developers."""
    try:
        local = deadline_at.astimezone(ZoneInfo(settings.cycle_timezone))
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Invalid CYCLE_TIMEZONE %r; falling back to UTC", settings.cycle_timezone)
        return deadline_at.isoformat()
    return local.strftime("%d.%m.%Y в %H:%M")


class NotificationsService:
    """Sends via Telegram when a chat is bound; otherwise falls back to console/log.

    The fallback keeps register/login/reminders usable in local dev without a live bot,
    and until a user has pressed Start + shared their contact.
    """

    def __init__(self, bot: Bot | None) -> None:
        self._bot = bot

    async def send_otp(self, user: User, code: str, purpose: OtpPurpose) -> None:
        action = "регистрации" if purpose is OtpPurpose.REGISTER else "входа"
        message = f"Код подтверждения {action} в Lulu Beauty: {code}"
        if await self._try_send(user.telegram_chat_id, message):
            logger.info("Sent %s OTP to %s via Telegram", purpose.value, user.phone)
            return
        logger.warning("%s; %s OTP: %s", self._fallback_reason(user), purpose.value, code)

    async def send_reminder(self, user: User, cycle_label: str, deadline_at: datetime) -> None:
        message = (
            f"Напоминание: товары в вашей корзине Lulu Beauty по заказу «{cycle_label}» "
            f"будут удалены {_format_deadline(deadline_at)}, если вы не оформите заявку."
        )
        if await self._try_send(user.telegram_chat_id, message):
            logger.info("Sent reminder for cycle %s to %s via Telegram", cycle_label, user.phone)
            return
        logger.warning("%s; reminder for %s not sent", self._fallback_reason(user), cycle_label)

    async def _try_send(self, chat_id: int | None, message: str) -> bool:
        if self._bot is None or chat_id is None:
            return False
        try:
            await self._bot.send_message(chat_id, message)
        except Exception:  # noqa: BLE001 - delivery is best-effort; any failure falls back to the log
            logger.exception("Failed to send Telegram message to chat_id=%s", chat_id)
            return False
        return True

    def _fallback_reason(self, user: User) -> str:
        if self._bot is None:
            return f"Telegram bot not configured (user {user.phone})"
        return f"No Telegram binding for {user.phone}"
