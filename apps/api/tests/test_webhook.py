from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.telegram import webhook

SECRET = "webhook-secret"

UPDATE: dict[str, Any] = {
    "update_id": 1,
    "message": {
        "message_id": 1,
        "date": 1700000000,
        "chat": {"id": 555, "type": "private"},
        "from": {"id": 555, "is_bot": False, "first_name": "Тест"},
        "text": "/menu",
    },
}


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[MagicMock]:
    """The webhook mode, with a bot instance that only has to be non-None."""
    monkeypatch.setattr(webhook.settings, "telegram_use_webhook", True)
    monkeypatch.setattr(webhook.settings, "telegram_webhook_url", "https://api.example.com")
    monkeypatch.setattr(webhook.settings, "telegram_webhook_secret", SECRET)
    bot = MagicMock()
    with patch.object(webhook, "bot", bot):
        yield bot


async def test_webhook_is_absent_while_polling(client: AsyncClient) -> None:
    """Off by default, and a 404 rather than a 403: an endpoint that is not serving
    should not confirm that it exists."""
    async with client as c:
        response = await c.post("/telegram/webhook", json=UPDATE)

    assert response.status_code == 404


async def test_a_call_without_the_secret_is_refused(
    client: AsyncClient, enabled: MagicMock
) -> None:
    """The header is the only proof a POST came from Telegram — the url is guessable and
    every handler behind it trusts `from_user` as though Telegram had vouched for it."""
    with patch("app.telegram.bot.dispatcher") as dispatcher:
        async with client as c:
            response = await c.post("/telegram/webhook", json=UPDATE)

    assert response.status_code == 403
    dispatcher.feed_update.assert_not_called()


async def test_a_call_with_the_wrong_secret_is_refused(
    client: AsyncClient, enabled: MagicMock
) -> None:
    async with client as c:
        response = await c.post(
            "/telegram/webhook",
            json=UPDATE,
            headers={webhook.SECRET_HEADER: SECRET + "x"},
        )

    assert response.status_code == 403


async def test_a_signed_update_reaches_the_dispatcher(
    client: AsyncClient, enabled: MagicMock
) -> None:
    with patch("app.telegram.bot.dispatcher") as dispatcher:
        dispatcher.feed_update = AsyncMock()
        async with client as c:
            response = await c.post(
                "/telegram/webhook", json=UPDATE, headers={webhook.SECRET_HEADER: SECRET}
            )

    assert response.status_code == 200
    update = dispatcher.feed_update.await_args.args[1]
    assert update.update_id == 1
    assert update.message is not None
    assert update.message.text == "/menu"


async def test_a_failing_handler_still_answers_200(
    client: AsyncClient, enabled: MagicMock
) -> None:
    """Telegram redelivers anything non-2xx, and the handlers behind this write: a crash
    after a commit would come back as a second confirmation, a second unlink, a second
    status change. There is nothing a retry could fix here and plenty it could duplicate.
    """
    with patch("app.telegram.bot.dispatcher") as dispatcher:
        dispatcher.feed_update = AsyncMock(side_effect=RuntimeError("боль"))
        async with client as c:
            response = await c.post(
                "/telegram/webhook", json=UPDATE, headers={webhook.SECRET_HEADER: SECRET}
            )

    assert response.status_code == 200


def test_the_mode_needs_a_secret_not_just_a_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """A url with no secret is an open endpoint, so it is not a configuration the bot
    accepts — `bot.start()` reads this and stays on polling instead."""
    monkeypatch.setattr(webhook.settings, "telegram_use_webhook", True)
    monkeypatch.setattr(webhook.settings, "telegram_webhook_url", "https://api.example.com")
    monkeypatch.setattr(webhook.settings, "telegram_webhook_secret", "")

    with patch.object(webhook, "bot", MagicMock()):
        assert webhook.is_enabled() is False


async def test_a_non_ascii_secret_header_is_rejected_not_a_500(
    client: AsyncClient, enabled: MagicMock
) -> None:
    """`secrets.compare_digest` on `str` raises TypeError the moment either side is not
    ASCII-only, and the header is attacker-controlled.

    Sent as raw bytes because that is the only way it can arrive: Starlette decodes header
    bytes as latin-1, so any byte above 0x7f becomes a non-ASCII `str` — and comparing it
    turned "wrong secret" into an unhandled 500 instead of the 403 below.
    """
    async with client as c:
        response = await c.post(
            "/telegram/webhook",
            json=UPDATE,
            headers={webhook.SECRET_HEADER: b"\xd1\x81\xd0\xb5\xd0\xba"},
        )

    assert response.status_code == 403
