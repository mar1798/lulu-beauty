from unittest.mock import AsyncMock, MagicMock

from app.telegram.bot import handle_fallback, handle_start


async def test_handle_start_prompts_for_contact_share() -> None:
    message = MagicMock()
    message.answer = AsyncMock()

    await handle_start(message)

    message.answer.assert_awaited_once()
    _, kwargs = message.answer.await_args
    assert "reply_markup" in kwargs


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
