import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Chat, ForceReply, Message, ReplyKeyboardMarkup
from aiogram.types import User as TelegramUser

from app.auth.models import Role
from app.telegram import bot as bot_module
from app.telegram import handlers as handlers_module
from app.telegram import keyboards, messages
from app.telegram.bot import BOT_COMMANDS, dispatcher
from app.telegram.handlers import (
    handle_customer_reply,
    handle_fallback,
    handle_help,
    handle_links,
    handle_owner_reply,
    handle_reply_button,
    handle_reply_menu,
    handle_start,
    router,
)
from app.telegram.keyboards import ReplyAction
from app.telegram.service import Delivery


def _stub_session(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Хендлеры открывают собственную сессию; здесь она не нужна — только не должна ходить в БД."""
    session = AsyncMock()

    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncMock]:
        yield session

    monkeypatch.setattr("app.telegram.handlers.async_session", factory)
    return session


async def test_handle_start_prompts_for_contact_share(monkeypatch: pytest.MonkeyPatch) -> None:
    """Чат без привязки и без аккаунта — единственный путь дальше это «поделиться номером».

    Два сообщения, а не одно: у сообщения ровно один `reply_markup`, приветствие тратит
    его на reply-клавиатуру с кнопкой, и согласию остаётся своё — с inline-кнопкой на
    политику. Согласие вторым, то есть последним перед полем ввода: прямо над той
    кнопкой, о которой оно говорит, и всё ещё до нажатия."""
    message = MagicMock()
    message.chat.id = 555
    message.answer = AsyncMock()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=None)
    )

    await handle_start(message, CommandObject(command="start", args=None))

    greeting, consent = message.answer.await_args_list
    assert greeting.args[0] == messages.START
    assert greeting.kwargs["reply_markup"] is not None
    assert consent.args[0] == messages.CONSENT


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


async def test_handle_links_sends_both_buttons_when_the_site_is_addressable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Кнопка «Ссылки» — единственный ответ бота, который существует ради ухода из чата."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_links(message)

    text, kwargs = message.answer.await_args[0], message.answer.await_args[1]
    assert text[0] == messages.LINKS_PROMPT
    urls = [
        keyboards.button_target(b) for row in kwargs["reply_markup"].inline_keyboard for b in row
    ]
    assert urls == ["https://lulu.example.com", keyboards.INSTAGRAM_URL]


async def test_handle_links_falls_back_to_the_address_in_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """На локальном хосте кнопки на сайт нет — Telegram отверг бы всё сообщение
    целиком, — и тогда адрес обязан быть в тексте, иначе ответ не отвечает ни на что.
    Instagram при этом остаётся кнопкой: его хост публичен при любой конфигурации."""
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_links(message)

    text, kwargs = message.answer.await_args[0], message.answer.await_args[1]
    assert "http://localhost:3000" in text[0]
    urls = [
        keyboards.button_target(b) for row in kwargs["reply_markup"].inline_keyboard for b in row
    ]
    assert urls == [keyboards.INSTAGRAM_URL]


def _reply_to_owner_message(*, text: str | None = "Да, заменить", photo: bool = False) -> MagicMock:
    replied = MagicMock()
    replied.from_user.is_bot = True
    replied.text = messages.owner_message("#a1b2c3d4", "Крем закончился")
    message = MagicMock()
    message.reply_to_message = replied
    message.text = text
    message.photo = [MagicMock()] if photo else None
    message.document = None
    message.media_group_id = None
    message.chat.id = 555
    message.answer = AsyncMock()
    return message


@pytest.fixture(autouse=True)
def _forget_shop_messages() -> None:
    """The 30-second limit is module state; each test starts with nobody having written."""
    handlers_module._last_shop_message.clear()


def _stub_reply_delivery(monkeypatch: pytest.MonkeyPatch, *, delivered: bool = True) -> AsyncMock:
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.get_owners", AsyncMock(return_value=[MagicMock()])
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference", AsyncMock(return_value=None)
    )
    send = AsyncMock(return_value=delivered)
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_customer_reply", send)
    return send


async def test_a_reply_to_the_owners_message_is_routed_to_its_own_handler() -> None:
    """Resolved the way the dispatcher does it: before the receipt and the fallback."""
    chat = Chat(id=555, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    replied = Message.model_construct(
        message_id=1,
        date=None,
        chat=chat,
        from_user=bot_user,
        text=messages.owner_message("#a1b2c3d4", "Крем закончился"),
    )
    message = Message.model_construct(
        message_id=2, date=None, chat=chat, text="Да", reply_to_message=replied
    )

    matched = [
        handler
        for handler in router.message.handlers
        if (await handler.check(message, bot=MagicMock()))[0]
    ]

    assert matched[0].callback is handle_customer_reply


async def test_a_reply_to_the_owners_captioned_photo_is_routed_to_its_own_handler() -> None:
    """The owner answered with a photo; the header is in its caption, not in a text."""
    chat = Chat(id=555, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    replied = Message.model_construct(
        message_id=1,
        date=None,
        chat=chat,
        from_user=bot_user,
        caption=messages.owner_media_caption("#a1b2c3d4", None),
    )
    message = Message.model_construct(
        message_id=2, date=None, chat=chat, text="Спасибо", reply_to_message=replied
    )

    matched = [
        handler
        for handler in router.message.handlers
        if (await handler.check(message, bot=MagicMock()))[0]
    ]

    assert matched[0].callback is handle_customer_reply


async def test_a_reply_to_a_captioned_photo_names_its_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = _reply_to_owner_message()
    message.reply_to_message.text = None
    message.reply_to_message.caption = messages.owner_media_caption("#a1b2c3d4", "Вот")
    send = _stub_reply_delivery(monkeypatch)

    await handle_customer_reply(message)

    assert send.await_args.args[2] == "#a1b2c3d4"


async def test_a_number_in_the_owners_own_words_names_no_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only the header line is read: «#…» below it is whatever the owner typed."""
    message = _reply_to_owner_message()
    message.reply_to_message.text = messages.owner_message(None, "Это как #ffffffff")
    send = _stub_reply_delivery(monkeypatch)

    await handle_customer_reply(message)

    assert send.await_args.args[2] is None


async def test_a_reply_to_the_owners_message_reaches_every_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A reply in the chat must not vanish into the fallback."""
    message = _reply_to_owner_message()
    _stub_session(monkeypatch)
    customer = MagicMock()
    owners = [MagicMock(), MagicMock()]
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=customer)
    )
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.get_owners", AsyncMock(return_value=owners)
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference", AsyncMock(return_value=None)
    )
    send = AsyncMock(return_value=True)
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_customer_reply", send)

    await handle_customer_reply(message)

    assert send.await_count == 2
    assert send.await_args.args[1:] == (customer, "#a1b2c3d4", message)
    assert message.answer.await_args.args[0] == messages.CUSTOMER_REPLY_FORWARDED


async def test_a_receipt_sent_as_a_reply_to_the_owner_is_still_a_receipt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A photo for an order waiting for money is filed, not passed on as chat."""
    message = _reply_to_owner_message(text=None, photo=True)
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference",
        AsyncMock(return_value=MagicMock()),
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.takes_payment", MagicMock(return_value=True)
    )
    receipt = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.handle_receipt", receipt)
    send = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_customer_reply", send)

    await handle_customer_reply(message)

    receipt.assert_awaited_once_with(message)
    send.assert_not_awaited()


async def test_a_reply_nobody_received_says_so_instead_of_offering_to_reply_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = _reply_to_owner_message()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )
    monkeypatch.setattr("app.telegram.handlers.recipients.get_owners", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference", AsyncMock(return_value=None)
    )

    await handle_customer_reply(message)

    assert message.answer.await_args.args[0] == messages.CUSTOMER_REPLY_NOT_DELIVERED


async def test_a_reply_to_the_reply_prompt_is_routed_to_the_same_handler() -> None:
    """The «Ответить» prompt (from the menu or under the owner's message) is the other
    message an answer to which goes to the owner."""
    chat = Chat(id=555, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    message = Message.model_construct(message_id=2, date=None, chat=chat, text="Когда выдача?")

    for prompt in (messages.reply_prompt(None), messages.reply_prompt(uuid.uuid4())):
        replied = Message.model_construct(
            message_id=1, date=None, chat=chat, from_user=bot_user, text=prompt
        )
        message = message.model_copy(update={"reply_to_message": replied})
        matched = [
            handler
            for handler in router.message.handlers
            if (await handler.check(message, bot=MagicMock()))[0]
        ]

        assert matched[0].callback is handle_customer_reply


async def test_a_reply_to_a_message_sent_before_the_rename_still_reaches_the_owner() -> None:
    """Messages that said «магазин» before the bot started saying «Sululu» are still in
    customers' chats; answering one of them must not fall through to the fallback."""
    chat = Chat(id=555, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    message = Message.model_construct(message_id=2, date=None, chat=chat, text="Да")

    for old in (
        "Сообщение от магазина по заявке #a1b2c3d4:\n\nКрем закончился",
        "Напишите ответ магазину по заявке #a1b2c3d4 - я передам его.",
        "Напишите сообщение магазину - я передам его.",
    ):
        replied = Message.model_construct(
            message_id=1, date=None, chat=chat, from_user=bot_user, text=old
        )
        message = message.model_copy(update={"reply_to_message": replied})
        matched = [
            handler
            for handler in router.message.handlers
            if (await handler.check(message, bot=MagicMock()))[0]
        ]

        assert matched[0].callback is handle_customer_reply


async def test_plain_text_in_the_chat_is_not_passed_on_but_says_how(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only a reply reaches the owner; the fallback names the way to make one."""
    message = _typed_message()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )

    await handle_fallback(message)

    text = message.answer.await_args.args[0]
    assert messages.MENU_REPLY in text
    assert messages.MENU_REPLY in _menu_labels()


async def test_a_reply_from_the_menu_prompt_reaches_the_owner_without_an_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = _reply_to_owner_message()
    message.reply_to_message.text = messages.reply_prompt(None)
    _stub_session(monkeypatch)
    customer = MagicMock()
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=customer)
    )
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.get_owners", AsyncMock(return_value=[MagicMock()])
    )
    send = AsyncMock(return_value=True)
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_customer_reply", send)

    await handle_customer_reply(message)

    assert send.await_args.args[1:] == (customer, None, message)
    assert message.answer.await_args.args[0] == messages.CUSTOMER_REPLY_FORWARDED


async def test_the_menu_reply_button_asks_for_the_message_as_a_force_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    message = _typed_message()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )

    await handle_reply_menu(message)

    assert message.answer.await_args.args[0] == messages.reply_prompt(None)
    assert isinstance(message.answer.await_args.kwargs["reply_markup"], ForceReply)


async def test_the_reply_button_under_the_owners_message_names_the_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    order_id = uuid.UUID("a1b2c3d4-0000-0000-0000-000000000000")
    query = MagicMock()
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.answer = AsyncMock()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=MagicMock())
    )

    await handle_reply_button(query, ReplyAction(order_id=order_id))

    prompt = query.message.answer.await_args.args[0]
    assert "#a1b2c3d4" in prompt
    assert prompt.startswith(messages.REPLY_PROMPT_HEADER)
    assert isinstance(query.message.answer.await_args.kwargs["reply_markup"], ForceReply)


async def test_the_reply_button_in_an_unlinked_chat_explains_instead_of_prompting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    query = MagicMock()
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.answer = AsyncMock()
    _stub_session(monkeypatch)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=None)
    )

    await handle_reply_button(query, ReplyAction(order_id=uuid.uuid4()))

    assert query.answer.await_args.kwargs["show_alert"] is True
    query.message.answer.assert_not_awaited()


async def test_a_second_message_within_30_seconds_is_refused_with_the_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send = _stub_reply_delivery(monkeypatch)
    clock = iter([1000.0, 1010.2])
    monkeypatch.setattr("app.telegram.handlers._clock", lambda: next(clock))

    await handle_customer_reply(_reply_to_owner_message())
    second = _reply_to_owner_message()
    await handle_customer_reply(second)

    assert send.await_count == 1
    assert second.answer.await_args.args[0] == messages.shop_message_too_soon(30, 20)


async def test_after_30_seconds_the_next_message_goes_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send = _stub_reply_delivery(monkeypatch)
    clock = iter([1000.0, 1030.0])
    monkeypatch.setattr("app.telegram.handlers._clock", lambda: next(clock))

    await handle_customer_reply(_reply_to_owner_message())
    await handle_customer_reply(_reply_to_owner_message())

    assert send.await_count == 2


async def test_an_undelivered_message_does_not_start_the_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Nothing reached the shop, so trying again at once is fair."""
    send = _stub_reply_delivery(monkeypatch, delivered=False)
    clock = iter([1000.0, 1001.0])
    monkeypatch.setattr("app.telegram.handlers._clock", lambda: next(clock))

    await handle_customer_reply(_reply_to_owner_message())
    await handle_customer_reply(_reply_to_owner_message())

    assert send.await_count == 2


async def test_an_album_goes_through_whole_with_one_acknowledgement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One message per photo, but sent as one: not refused from the second photo on,
    and not thanked for twice."""
    send = _stub_reply_delivery(monkeypatch)
    photos = [_reply_to_owner_message(text=None, photo=True) for _ in range(3)]
    for photo in photos:
        photo.media_group_id = "album-1"

    for photo in photos:
        await handle_customer_reply(photo)

    assert send.await_count == 3
    acknowledged = [p for p in photos if p.answer.await_count]
    assert len(acknowledged) == 1
    assert acknowledged[0].answer.await_args.args[0] == messages.CUSTOMER_REPLY_FORWARDED


async def test_a_receipt_reply_is_not_held_back_by_the_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Paying is not chatting: the receipt goes to `handle_receipt` whatever the clock."""
    _stub_reply_delivery(monkeypatch)
    await handle_customer_reply(_reply_to_owner_message())

    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference",
        AsyncMock(return_value=MagicMock()),
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.takes_payment", MagicMock(return_value=True)
    )
    receipt = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.handle_receipt", receipt)
    photo = _reply_to_owner_message(text=None, photo=True)

    await handle_customer_reply(photo)

    receipt.assert_awaited_once_with(photo)


_CUSTOMER = "Айсулуу, +996555000111"


def _owner_reply(header: str, *, text: str | None = "Будет в пятницу") -> MagicMock:
    replied = MagicMock()
    replied.from_user.is_bot = True
    replied.text = header
    replied.caption = None
    message = MagicMock()
    message.reply_to_message = replied
    message.text = text
    message.media_group_id = None
    message.answer = AsyncMock()
    return message


def _stub_owner_reply(
    monkeypatch: pytest.MonkeyPatch,
    *,
    role: str = "ADMIN",
    customer: MagicMock | None = None,
    order: MagicMock | None = None,
    outcome: Delivery = Delivery.SENT,
) -> AsyncMock:
    _stub_session(monkeypatch)
    owner = MagicMock()
    owner.role = Role(role)
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_chat_id", AsyncMock(return_value=owner)
    )
    monkeypatch.setattr(
        "app.telegram.handlers.recipients.find_user_by_phone", AsyncMock(return_value=customer)
    )
    monkeypatch.setattr(
        "app.telegram.handlers.PaymentsService.order_by_reference", AsyncMock(return_value=order)
    )
    send = AsyncMock(return_value=outcome)
    monkeypatch.setattr("app.telegram.handlers.notifications_service.send_owner_reply", send)
    return send


async def test_an_owners_reply_to_a_passed_on_message_is_routed_to_its_own_handler() -> None:
    chat = Chat(id=1, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    for header in (
        f"💬 Ответ покупателя по заявке #a1b2c3d4\nПокупатель: {_CUSTOMER}\n\nДа",
        f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}\n\nПривет",
    ):
        replied = Message.model_construct(
            message_id=1, date=None, chat=chat, from_user=bot_user, text=header
        )
        message = Message.model_construct(
            message_id=2, date=None, chat=chat, text="Ок", reply_to_message=replied
        )
        matched = [
            handler
            for handler in router.message.handlers
            if (await handler.check(message, bot=MagicMock()))[0]
        ]

        assert matched[0].callback is handle_owner_reply


async def test_an_owners_reply_to_a_wish_is_routed_to_the_owner_reply_handler() -> None:
    chat = Chat(id=1, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    replied = Message.model_construct(
        message_id=1,
        date=None,
        chat=chat,
        from_user=bot_user,
        text=f"💡 Пожелание к следующему сбору\nОт кого: {_CUSTOMER}\n\nКрем с SPF",
    )
    message = Message.model_construct(
        message_id=2, date=None, chat=chat, text="Привезём", reply_to_message=replied
    )

    matched = [
        handler
        for handler in router.message.handlers
        if (await handler.check(message, bot=MagicMock()))[0]
    ]

    assert matched[0].callback is handle_owner_reply


async def test_an_owners_reply_to_a_customers_photo_is_routed_by_its_caption() -> None:
    """A customer's photo reaches the owner with the header in its caption."""
    chat = Chat(id=1, type="private")
    bot_user = TelegramUser(id=1, is_bot=True, first_name="bot")
    replied = Message.model_construct(
        message_id=1,
        date=None,
        chat=chat,
        from_user=bot_user,
        caption=f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}",
    )
    message = Message.model_construct(
        message_id=2, date=None, chat=chat, text="Красиво", reply_to_message=replied
    )

    matched = [
        handler
        for handler in router.message.handlers
        if (await handler.check(message, bot=MagicMock()))[0]
    ]

    assert matched[0].callback is handle_owner_reply


async def test_an_owners_reply_reaches_the_customer_named_in_the_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    customer = MagicMock()
    customer.telegram_chat_id = 555
    order = MagicMock()
    send = _stub_owner_reply(monkeypatch, customer=customer, order=order)
    message = _owner_reply(
        "💬 Ответ покупателя по заявке #a1b2c3d4\nПокупатель: Айсулуу, Бишкек, +996555000111"
        "\n\nА где #deadbeef?"
    )

    await handle_owner_reply(message)

    find = handlers_module.recipients.find_user_by_phone
    assert find.await_args.args[1] == "+996555000111"  # type: ignore[attr-defined]
    assert send.await_args.args[:4] == (customer, "#a1b2c3d4", order.id, message)
    assert message.answer.await_args.args[0] == messages.OWNER_REPLY_SENT


async def test_an_owners_reply_to_a_message_from_the_menu_names_no_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    customer = MagicMock()
    send = _stub_owner_reply(monkeypatch, customer=customer)
    message = _owner_reply(f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}\n\nПривет")

    await handle_owner_reply(message)

    assert send.await_args.args[1:3] == (None, None)


async def test_a_customer_quoting_the_header_is_not_an_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send = _stub_owner_reply(monkeypatch, role="CUSTOMER", customer=MagicMock())
    message = _owner_reply(f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}")

    await handle_owner_reply(message)

    send.assert_not_awaited()
    assert message.answer.await_args.args[0] == messages.FALLBACK


async def test_an_owners_reply_to_an_erased_customer_says_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send = _stub_owner_reply(monkeypatch, customer=None)
    message = _owner_reply(f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}")

    await handle_owner_reply(message)

    send.assert_not_awaited()
    assert message.answer.await_args.args[0] == messages.OWNER_REPLY_CUSTOMER_GONE


async def test_an_owners_reply_to_a_customer_who_blocked_the_bot_drops_the_binding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    customer = MagicMock()
    customer.telegram_chat_id = 555
    _stub_owner_reply(monkeypatch, customer=customer, outcome=Delivery.BLOCKED)
    clear = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.recipients.clear_stale_bindings", clear)
    message = _owner_reply(f"💬 Сообщение покупателя\nПокупатель: {_CUSTOMER}")

    await handle_owner_reply(message)

    assert clear.await_args.args[1] == [555]
    assert message.answer.await_args.args[0] == messages.OWNER_REPLY_BLOCKED


async def test_an_owners_reply_to_a_wish_reaches_its_writer_worded_as_about_the_wish(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    customer = MagicMock()
    customer.telegram_chat_id = 555
    send = _stub_owner_reply(monkeypatch, customer=customer)
    message = _owner_reply(
        "💡 Пожелание к следующему сбору\nОт кого: Айсулуу, +996555000111\n\nКрем #deadbeef"
    )

    await handle_owner_reply(message)

    find = handlers_module.recipients.find_user_by_phone
    assert find.await_args.args[1] == "+996555000111"  # type: ignore[attr-defined]
    assert send.await_args.args[:4] == (customer, None, None, message)
    assert send.await_args.kwargs["wish"] is True
    assert message.answer.await_args.args[0] == messages.OWNER_REPLY_SENT


async def test_an_owners_reply_to_a_guests_wish_says_to_call_instead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send = _stub_owner_reply(monkeypatch, customer=None)
    message = _owner_reply(f"💡 Пожелание к следующему сбору\nОт кого: {_CUSTOMER}\n\nКрем")

    await handle_owner_reply(message)

    send.assert_not_awaited()
    assert message.answer.await_args.args[0] == messages.owner_reply_wish_unreachable(
        "+996555000111"
    )
