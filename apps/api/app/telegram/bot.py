import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand

from app.telegram.client import bot
from app.telegram.handlers import router as handlers_router

logger = logging.getLogger("app.telegram.bot")

dispatcher = Dispatcher()
dispatcher.include_router(handlers_router)

# Populates the "/" menu in the Telegram client. /start is intentionally absent: it's
# offered by Telegram itself on an empty chat, and repeating it in the menu of a chat
# that's already linked invites people to re-link for no reason.
BOT_COMMANDS = [
    BotCommand(command="orders", description="Мои заявки"),
    BotCommand(command="cart", description="Корзина и дедлайн"),
    BotCommand(command="deadline", description="Когда закрывается сбор"),
    BotCommand(command="unlink", description="Отвязать чат"),
    BotCommand(command="help", description="Что умеет бот"),
]

_polling_task: asyncio.Task[None] | None = None


async def _run(instance: Bot) -> None:
    try:
        await instance.set_my_commands(BOT_COMMANDS)
    except Exception:  # noqa: BLE001 - a cosmetic menu must not stop the bot from starting
        logger.exception("Failed to publish the bot command menu")
    await dispatcher.start_polling(instance)


def start_polling() -> None:
    global _polling_task
    if bot is None:
        logger.warning("TELEGRAM_BOT_TOKEN not set; Telegram bot disabled")
        return
    _polling_task = asyncio.create_task(_run(bot))


async def stop_polling() -> None:
    global _polling_task
    if _polling_task is not None:
        _polling_task.cancel()
        try:
            await _polling_task
        except asyncio.CancelledError:
            pass
        _polling_task = None

    if bot is not None:
        await bot.session.close()
