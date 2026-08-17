import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Chat, Message, ReplyKeyboardMarkup

from app.telegram import bot as bot_module
from app.telegram import keyboards, messages
from app.telegram.bot import BOT_COMMANDS, dispatcher
from app.telegram.handlers import (
    handle_fallback,
    handle_help,
    handle_site,
    handle_start,
    router,
)


def _stub_session(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Хендлеры открывают собственную сессию; здесь она не нужна — только не должна ходить в БД."""
    session = AsyncMock()

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncMock]:
        yield session

    monkeypatch.setattr("app.telegram.handlers.async_session", factory)
    return session


async def test_handle_start_prompts_for_contact_share(monkeypatch: pytest.MonkeyPatch) -> None:
    """Чат без привязки и без аккаунта — единственный путь дальше это «поделиться номером»."""
    message = MagicMock()
    message.chat.id = 555
    message.answer = AsyncMock()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=None)
    )

    await handle_start(message, CommandObject(command="start", args=None))

    message.answer.assert_awaited_once()
    _, kwargs = message.answer.await_args
    assert "reply_markup" in kwargs


def test_start_is_matched_by_command_filter_not_exact_text() -> None:
    """A deep link sends "/start <payload>", which an exact text match silently drops
    into the fallback — the person then gets no share-contact button at all."""
    filters = [f.callback for f in router.message.handlers[0].filters or []]
    assert any(isinstance(f, CommandStart) for f in filters)


def _typed_message() -> MagicMock:
    # Covers e.g. a user typing their phone number as plain text instead of sharing
    # a verified contact via the keyboard button - observed during manual bot testing.
    message = MagicMock()
    message.content_type = "text"
    message.contact = None
    message.text = "+996700123456"
    message.answer = AsyncMock()
    return message


async def test_handle_fallback_hands_a_linked_chat_the_menu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Typing at a bot driven by taps almost always means the keyboard is collapsed, so
    the reply has to be the keyboard rather than a sentence about it."""
    message = _typed_message()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )

    await handle_fallback(message)

    markup = message.answer.await_args.kwargs["reply_markup"]
    assert isinstance(markup, ReplyKeyboardMarkup)
    labels = {button.text for row in markup.keyboard for button in row}
    assert messages.MENU_CART in labels


async def test_handle_fallback_offers_an_unlinked_chat_the_only_button_that_works(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The menu's five buttons would all answer "вы не привязаны" — worth a DB lookup
    to send the share-contact button instead."""
    message = _typed_message()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=None)
    )

    await handle_fallback(message)

    message.answer.assert_awaited_once()
    markup = message.answer.await_args.kwargs["reply_markup"]
    assert markup.keyboard[0][0].request_contact is True


def _menu_labels() -> list[str]:
    return [button.text for row in keyboards.main_menu().keyboard for button in row]


async def test_every_menu_button_reaches_a_handler_of_its_own() -> None:
    """A tapped button arrives as an ordinary text message, matched by comparing that
    text to the label — so a label edited in `messages.py` and nowhere else doesn't
    break loudly: the button silently starts falling through to `handle_fallback`,
    which answers "не понял" to a press of the bot's own keyboard.

    Resolved the way the dispatcher resolves it (first matching handler wins) rather
    than by reading the filters, so this stays true however the filters are written.
    """
    chat = Chat(id=555, type="private")

    for label in _menu_labels():
        message = Message.model_construct(message_id=1, date=None, chat=chat, text=label)
        matched = [
            handler
            for handler in router.message.handlers
            if (await handler.check(message, bot=MagicMock()))[0]
        ]

        assert matched, f"кнопка {label!r} не совпала ни с одним хендлером"
        assert matched[0].callback is not handle_fallback, (
            f"кнопка {label!r} доходит только до fallback"
        )


def test_help_documents_every_button_on_the_menu() -> None:
    """The menu is the interface now; a button missing from /help is a button whose
    meaning has to be guessed from four words on a pill."""
    for label in _menu_labels():
        assert label in messages.HELP


def test_polling_subscribes_to_button_presses() -> None:
    """Both modes ask Telegram only for the update types the dispatcher handles —
    polling by default, and `set_webhook(allowed_updates=...)` explicitly.

    A callback handler that never gets registered on the dispatcher wouldn't fail — the
    buttons would simply do nothing, with no error on either side.
    """
    assert "callback_query" in dispatcher.resolve_used_update_types()


async def test_handle_help_lists_every_published_command() -> None:
    """The "/" menu and /help are two copies of the same list; one drifting from the
    other leaves a command nobody can discover."""
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_help(message)

    text = message.answer.await_args.args[0]
    for command in BOT_COMMANDS:
        assert f"/{command.command}" in text


async def test_start_falls_back_to_polling_when_the_webhook_is_half_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Webhook без секрета — открытая ручка, и бот такой режим не принимает. Падать при
    этом нельзя: неверно настроенный вебхук унёс бы с собой весь API, а polling шумный,
    но доставляет всё то же самое."""
    monkeypatch.setattr("app.config.settings.telegram_use_webhook", True)
    monkeypatch.setattr("app.config.settings.telegram_webhook_url", "https://api.example.com")
    monkeypatch.setattr("app.config.settings.telegram_webhook_secret", "")
    instance = MagicMock()
    instance.set_webhook = AsyncMock()
    instance.session.close = AsyncMock()
    monkeypatch.setattr("app.telegram.bot.bot", instance)
    # Тот же инстанс и в `webhook`: иначе режим отказал бы просто потому, что бота нет,
    # и тест ничего не сказал бы про отсутствующий секрет.
    monkeypatch.setattr("app.telegram.webhook.bot", instance)
    started = AsyncMock()
    monkeypatch.setattr("app.telegram.bot._run", started)

    await bot_module.start()
    # Polling живёт в задаче: без уступки циклу событий `stop()` отменил бы её раньше,
    # чем она успела начаться, и тест не отличил бы «не запущено» от «не дошло».
    await asyncio.sleep(0)
    await bot_module.stop()

    instance.set_webhook.assert_not_awaited()
    started.assert_awaited_once()


async def test_start_registers_the_webhook_with_the_update_types_it_handles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`allowed_updates` не по умолчанию: оставленный Telegram'у на усмотрение, он молча
    перестанет присылать тип апдейта, под который позже появится хендлер."""
    monkeypatch.setattr("app.config.settings.telegram_use_webhook", True)
    monkeypatch.setattr("app.config.settings.telegram_webhook_url", "https://api.example.com/")
    monkeypatch.setattr("app.config.settings.telegram_webhook_secret", "s3cret")
    instance = MagicMock()
    instance.set_webhook = AsyncMock()
    instance.set_my_commands = AsyncMock()
    instance.set_chat_menu_button = AsyncMock()
    instance.delete_webhook = AsyncMock()
    instance.session.close = AsyncMock()
    monkeypatch.setattr("app.telegram.bot.bot", instance)
    monkeypatch.setattr("app.telegram.webhook.bot", instance)

    await bot_module.start()

    kwargs = instance.set_webhook.await_args.kwargs
    assert kwargs["url"] == "https://api.example.com/telegram/webhook"
    assert kwargs["secret_token"] == "s3cret"
    assert "callback_query" in kwargs["allowed_updates"]

    await bot_module.stop()
    # Оставленный вебхук — это адрес, который больше не отвечает: Telegram продолжит
    # слать туда апдейты, и они пропадут, а не подождут следующего запуска.
    instance.delete_webhook.assert_awaited_once()


async def test_a_webhook_telegram_refuses_falls_back_to_polling_instead_of_crashing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Адрес вебхука проверяет сам Telegram, и нерезолвящийся хост — это 400 из
    `set_webhook`. Поднявшись наружу, он падает внутри lifespan и уносит весь API: и
    `/health`, и каталог, и админку — из-за настройки бота. Найдено живым прогоном."""
    monkeypatch.setattr("app.config.settings.telegram_use_webhook", True)
    monkeypatch.setattr("app.config.settings.telegram_webhook_url", "https://nowhere.invalid")
    monkeypatch.setattr("app.config.settings.telegram_webhook_secret", "s3cret")
    instance = MagicMock()
    instance.set_webhook = AsyncMock(side_effect=RuntimeError("Bad Request: bad webhook"))
    instance.delete_webhook = AsyncMock()
    instance.session.close = AsyncMock()
    monkeypatch.setattr("app.telegram.bot.bot", instance)
    monkeypatch.setattr("app.telegram.webhook.bot", instance)
    started = AsyncMock()
    monkeypatch.setattr("app.telegram.bot._run", started)

    await bot_module.start()
    await asyncio.sleep(0)
    await bot_module.stop()

    started.assert_awaited_once()
    # И снимать на выходе нечего: регистрации не было.
    instance.delete_webhook.assert_not_awaited()


async def test_handle_site_sends_a_button_when_the_site_is_addressable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Кнопка «Сайт» — единственный ответ бота, который существует ради ухода из чата."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_site(message)

    text, kwargs = message.answer.await_args[0], message.answer.await_args[1]
    assert text[0] == messages.SITE_PROMPT
    assert kwargs["reply_markup"].inline_keyboard[0][0].url == "https://lulu.example.com"


async def test_handle_site_falls_back_to_the_address_in_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """На локальном хосте кнопки нет — Telegram отверг бы всё сообщение целиком, — и
    тогда адрес обязан быть в тексте, иначе ответ не отвечает ни на что."""
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_site(message)

    text, kwargs = message.answer.await_args[0], message.answer.await_args[1]
    assert "http://localhost:3000" in text[0]
    assert "reply_markup" not in kwargs
