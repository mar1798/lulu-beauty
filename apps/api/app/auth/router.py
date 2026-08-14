from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import (
    LogoutRequest,
    RefreshRequest,
    TelegramLoginClaimRequest,
    TelegramLoginClaimResponse,
    TelegramLoginStartResponse,
    TelegramMiniAppLoginRequest,
    TokenResponse,
)
from app.auth.service import AuthService, InvalidCredentialsError
from app.auth.telegram_identity import (
    InvalidTelegramAuthError,
    TelegramAuthExpiredError,
    verify_init_data,
    verify_widget_payload,
)
from app.auth.telegram_login import (
    AuthSessionExpiredError,
    AuthSessionNotFoundError,
    AuthSessionPendingError,
    TelegramAccountNotLinkedError,
    TelegramLoginService,
)
from app.db import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/telegram/session", response_model=TelegramLoginStartResponse)
async def start_telegram_login(
    session: AsyncSession = Depends(get_session),
) -> TelegramLoginStartResponse:
    """Opens a sign-in attempt. Anonymous by design — it identifies nobody yet."""
    service = TelegramLoginService(session)
    started = await service.start()
    await session.commit()

    return TelegramLoginStartResponse(
        session_id=started.session.id,
        poll_secret=started.poll_secret,
        bot_url=service.bot_url(started.link_payload),
        expires_at=started.session.expires_at,
    )


@router.post("/telegram/claim", response_model=TelegramLoginClaimResponse)
async def claim_telegram_login(
    body: TelegramLoginClaimRequest, session: AsyncSession = Depends(get_session)
) -> TelegramLoginClaimResponse:
    """Asked on a loop by the waiting tab until the bot confirms.

    A link that is gone (expired, spent, never existed) *is* an error — the tab has to
    stop polling and offer a fresh one. Still waiting is not.
    """
    service = TelegramLoginService(session)
    try:
        user = await service.claim(str(body.session_id), body.poll_secret)
    except AuthSessionPendingError:
        return TelegramLoginClaimResponse(status="PENDING")
    except AuthSessionExpiredError as error:
        raise HTTPException(status.HTTP_410_GONE, "auth_session_expired") from error
    except AuthSessionNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "auth_session_not_found") from error

    tokens = await AuthService(session).issue_tokens(user)
    await session.commit()
    return TelegramLoginClaimResponse(status="AUTHORIZED", tokens=tokens)


@router.post("/telegram/widget", response_model=TokenResponse)
async def telegram_widget_login(
    payload: dict[str, Any] = Body(...), session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    """Sign-in from the Telegram Login Widget on the site — no bot round trip.

    An untyped body on purpose: the signature covers every field the widget sent, so a
    schema listing the fields we know about would reject a login the day Telegram adds
    one. What the payload has to contain is checked by the verification itself.
    """
    telegram_id = _verified_telegram_id(lambda: verify_widget_payload(payload))
    return await _sign_in_by_telegram_id(telegram_id, session)


@router.post("/telegram/mini-app", response_model=TokenResponse)
async def telegram_mini_app_login(
    body: TelegramMiniAppLoginRequest, session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    """Sign-in from inside Telegram's webview, where `initData` is the proof."""
    telegram_id = _verified_telegram_id(lambda: verify_init_data(body.init_data))
    return await _sign_in_by_telegram_id(telegram_id, session)


def _verified_telegram_id(verify: Callable[[], int]) -> int:
    try:
        return verify()
    except TelegramAuthExpiredError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "telegram_auth_expired") from error
    except InvalidTelegramAuthError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "telegram_auth_invalid") from error


async def _sign_in_by_telegram_id(telegram_id: int, session: AsyncSession) -> TokenResponse:
    """Telegram proved who this is; the shop still has to know them.

    A distinct code rather than a generic 401: the site turns it into "share your number
    with the bot first", which is the only thing that can actually be done about it.
    """
    try:
        user = await TelegramLoginService(session).find_by_telegram_id(telegram_id)
    except TelegramAccountNotLinkedError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "telegram_account_not_linked") from error

    tokens = await AuthService(session).issue_tokens(user)
    await session.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest, session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    service = AuthService(session)
    try:
        tokens = await service.refresh(body.refresh_token)
    except InvalidCredentialsError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_refresh_token") from error

    await session.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, session: AsyncSession = Depends(get_session)) -> None:
    service = AuthService(session)
    await service.logout(body.refresh_token)
    await session.commit()
