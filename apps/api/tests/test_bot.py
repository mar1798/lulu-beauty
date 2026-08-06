from unittest.mock import AsyncMock, MagicMock

from aiogram.filters import CommandStart

from app.telegram.bot import BOT_COMMANDS, dispatcher
from app.telegram.handlers import handle_fallback, handle_help, handle_start, router


async def test_handle_start_prompts_for_contact_share() -> None:
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_start(message)

    message.answer.assert_awaited_once()
    _, kwargs = message.answer.await_args
    assert "reply_markup" in kwargs


def test_start_is_matched_by_command_filter_not_exact_text() -> None:
    """A deep link sends "/start <payload>", which an exact text match silently drops
    into the fallback — the person then gets no share-contact button at all."""
    filters = [f.callback for f in router.message.handlers[0].filters or []]
    assert any(isinstance(f, CommandStart) for f in filters)


async def test_handle_fallback_prompts_for_start() -> None:
    # Covers e.g. a user typing their phone number as plain text instead of sharing
    # a verified contact via the keyboard button - observed during manual bot testing.
    message = MagicMock()
    message.content_type = "text"
    message.contact = None
    message.text = "+996700123456"
    message.answer = AsyncMock()

    await handle_fallback(message)

    message.answer.assert_awaited_once()


def test_polling_subscribes_to_button_presses() -> None:
    """start_polling() asks Telegram only for the update types the dispatcher handles.

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
