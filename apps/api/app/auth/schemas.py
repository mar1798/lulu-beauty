import uuid
from datetime import datetime
from typing import Literal

from app.common.schemas import CamelModel


class RefreshRequest(CamelModel):
    refresh_token: str


class LogoutRequest(CamelModel):
    refresh_token: str


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TelegramLoginStartResponse(CamelModel):
    """Everything the site needs to put a person in front of the bot.

    `poll_secret` is returned exactly once and is meant for the Next layer, which keeps
    it in an httpOnly cookie — it must never reach browser JavaScript, and it is
    deliberately absent from the link the person actually opens.
    """

    session_id: uuid.UUID
    poll_secret: str
    bot_url: str
    expires_at: datetime


class TelegramLoginClaimRequest(CamelModel):
    session_id: uuid.UUID
    poll_secret: str


class TelegramMiniAppLoginRequest(CamelModel):
    """`window.Telegram.WebApp.initData`, verbatim.

    A string rather than the fields inside it: the signature covers the query string as
    Telegram built it, so anything that parses and re-serialises it on the way here is a
    chance to change one percent-encoded character and fail every login.
    """

    init_data: str


class TelegramLoginClaimResponse(CamelModel):
    """Waiting is a normal answer here, not an error.

    Hence a status field instead of an HTTP code: the tab polls this endpoint every
    couple of seconds, and a 4xx per poll would drown the real failures in the log —
    while a 2xx-with-no-tokens is a shape the client cannot mistake for success.
    """

    status: Literal["PENDING", "AUTHORIZED"]
    tokens: TokenResponse | None = None
