"""The two signature-based sign-ins, at the HTTP edge.

What is worth testing here is the mapping from "what went wrong" to a machine code: the
site branches on those codes, and «поделитесь номером в боте» is a different screen from
«не удалось подтвердить вход». The signature checking itself lives in
tests/test_telegram_identity.py.
"""

from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.schemas import TokenResponse
from app.auth.telegram_login import TelegramAccountNotLinkedError
from app.db import get_session
from app.main import app
from tests.test_telegram_identity import TELEGRAM_ID, init_data, widget_payload


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    # A mock rather than None: unlike the order endpoints, these commit in the router
    # itself — the transaction boundary is the request, not the service.
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _linked_user(service_cls: MagicMock) -> MagicMock:
    service = service_cls.return_value
    service.find_by_telegram_id = AsyncMock(return_value=MagicMock())
    return service


TOKENS = TokenResponse(access_token="access", refresh_token="refresh")


async def test_mini_app_sign_in_returns_tokens(client: AsyncClient) -> None:
    with (
        patch("app.auth.router.TelegramLoginService") as service_cls,
        patch("app.auth.router.AuthService") as auth_cls,
    ):
        service = _linked_user(service_cls)
        auth_cls.return_value.issue_tokens = AsyncMock(return_value=TOKENS)
        async with client as c:
            response = await c.post("/auth/telegram/mini-app", json={"initData": init_data()})

    assert response.status_code == 200
    assert response.json()["accessToken"] == "access"
    service.find_by_telegram_id.assert_awaited_once_with(TELEGRAM_ID)


async def test_widget_sign_in_returns_tokens(client: AsyncClient) -> None:
    with (
        patch("app.auth.router.TelegramLoginService") as service_cls,
        patch("app.auth.router.AuthService") as auth_cls,
    ):
        _linked_user(service_cls)
        auth_cls.return_value.issue_tokens = AsyncMock(return_value=TOKENS)
        async with client as c:
            response = await c.post("/auth/telegram/widget", json=widget_payload())

    assert response.status_code == 200
    assert response.json()["refreshToken"] == "refresh"


async def test_an_unsigned_payload_is_rejected_before_any_lookup(client: AsyncClient) -> None:
    with patch("app.auth.router.TelegramLoginService") as service_cls:
        async with client as c:
            response = await c.post(
                "/auth/telegram/widget", json={"id": "1", "auth_date": "1", "hash": "нет"}
            )

    assert response.status_code == 401
    assert response.json()["detail"] == "telegram_auth_invalid"
    service_cls.assert_not_called()


async def test_a_telegram_user_with_no_account_gets_its_own_code(client: AsyncClient) -> None:
    """Not a plain 401: the site turns this one into "share your number with the bot",
    which is the only thing that can actually be done about it."""
    with patch("app.auth.router.TelegramLoginService") as service_cls:
        service_cls.return_value.find_by_telegram_id = AsyncMock(
            side_effect=TelegramAccountNotLinkedError
        )
        async with client as c:
            response = await c.post("/auth/telegram/mini-app", json={"initData": init_data()})

    assert response.status_code == 404
    assert response.json()["detail"] == "telegram_account_not_linked"
