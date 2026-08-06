"""The bot instance and the notifications service built on it.

Split out of `bot.py` so that the pieces which only need to *send* something don't have
to import the module that owns the handlers. `bot.py` imports `handlers`, and a handler
that triggers a notification imports `notify`, which needs the service — routed through
`bot.py` that is a cycle (handlers → notify → bot → handlers), and it fails at import
time, before anything can be tested.
"""

import logging

from aiogram import Bot
from aiogram.utils.token import TokenValidationError

from app.config import settings
from app.telegram.service import NotificationsService

logger = logging.getLogger("app.telegram.bot")


def _create_bot() -> Bot | None:
    if not settings.telegram_bot_token:
        return None
    try:
        return Bot(token=settings.telegram_bot_token)
    except TokenValidationError:
        logger.warning("TELEGRAM_BOT_TOKEN is not a valid bot token; Telegram bot disabled")
        return None


bot = _create_bot()
notifications_service = NotificationsService(bot)
