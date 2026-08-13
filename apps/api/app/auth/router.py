from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import (
    LogoutRequest,
    RefreshRequest,
    TelegramLoginClaimRequest,
    TelegramLoginClaimResponse,
    TelegramLoginStartResponse,
    TokenResponse,
)
from app.auth.service import AuthService, InvalidCredentialsError
from app.auth.telegram_login import (
    AuthSessionExpiredError,
    AuthSessionNotFoundError,
    AuthSessionPendingError,
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
