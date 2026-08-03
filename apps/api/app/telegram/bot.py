import asyncio
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, ReplyKeyboardRemove
from aiogram.utils.token import TokenValidationError
from sqlalchemy import select

from app.auth.models import User
from app.common.phone import normalize_phone
from app.config import settings
from app.db import async_session
from app.telegram.models import PendingTelegramContact
from app.telegram.service import NotificationsService

logger = logging.getLogger("app.telegram.bot")

dispatcher = Dispatcher()


@dispatcher.message(F.text == "/start")
async def handle_start(message: Message) -> None:
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Поделиться номером телефона", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(
        "Добро пожаловать в Lulu Beauty! Поделитесь номером телефона, чтобы привязать "
        "этот чат к вашему аккаунту и получать сюда коды подтверждения и напоминания.",
        reply_markup=keyboard,
    )


@dispatcher.message(F.contact)
async def handle_contact(message: Message) -> None:
    if message.contact is None or message.chat is None:
        return

    phone = normalize_phone(message.contact.phone_number)
    chat_id = message.chat.id

    async with async_session() as session:
        result = await session.execute(select(User).where(User.phone == phone))
        user = result.scalar_one_or_none()

        if user is not None:
            user.telegram_chat_id = chat_id
        else:
            pending_result = await session.execute(
                select(PendingTelegramContact).where(PendingTelegramContact.phone == phone)
            )
            pending = pending_result.scalar_one_or_none()
            if pending is not None:
                pending.chat_id = chat_id
            else:
                session.add(PendingTelegramContact(phone=phone, chat_id=chat_id))

        await session.commit()

    await message.answer(
        "Готово! Этот чат привязан к вашему номеру телефона.",
        reply_markup=ReplyKeyboardRemove(),
    )


@dispatcher.message()
async def handle_fallback(message: Message) -> None:
    logger.info(
        "Unhandled message: content_type=%s has_contact=%s text=%r",
        message.content_type,
        message.contact is not None,
        message.text,
    )
    await message.answer("Отправьте /start, чтобы привязать номер телефона.")


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

_polling_task: asyncio.Task[None] | None = None


def start_polling() -> None:
    global _polling_task
    if bot is None:
        logger.warning("TELEGRAM_BOT_TOKEN not set; Telegram bot disabled")
        return
    _polling_task = asyncio.create_task(dispatcher.start_polling(bot))


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
