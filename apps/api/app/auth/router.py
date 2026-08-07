from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import OtpPurpose
from app.auth.otp_service import OtpInvalidError, OtpResendTooSoonError
from app.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    OtpSentResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyOtpRequest,
)
from app.auth.service import (
    AuthService,
    InvalidCredentialsError,
    PhoneAlreadyRegisteredError,
    PhoneNotVerifiedError,
    UserNotFoundError,
)
from app.db import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=OtpSentResponse)
async def register(
    body: RegisterRequest, session: AsyncSession = Depends(get_session)
) -> OtpSentResponse:
    service = AuthService(session)
    try:
        await service.register(body.phone, body.name, body.password)
    except PhoneAlreadyRegisteredError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "phone_already_registered") from error
    except OtpResendTooSoonError as error:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "otp_resend_too_soon") from error

    await session.commit()
    return OtpSentResponse(message="otp_sent", purpose=OtpPurpose.REGISTER)


@router.post("/login", response_model=OtpSentResponse)
async def login(
    body: LoginRequest, session: AsyncSession = Depends(get_session)
) -> OtpSentResponse:
    service = AuthService(session)
    try:
        await service.login(body.phone, body.password)
    except InvalidCredentialsError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials") from error
    except PhoneNotVerifiedError as error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "phone_not_verified") from error
    except OtpResendTooSoonError as error:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "otp_resend_too_soon") from error

    await session.commit()
    return OtpSentResponse(message="otp_sent", purpose=OtpPurpose.LOGIN)


@router.post("/forgot-password", response_model=OtpSentResponse)
async def forgot_password(
    body: ForgotPasswordRequest, session: AsyncSession = Depends(get_session)
) -> OtpSentResponse:
    service = AuthService(session)
    try:
        await service.forgot_password(body.phone)
    except UserNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error
    except OtpResendTooSoonError as error:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "otp_resend_too_soon") from error

    await session.commit()
    return OtpSentResponse(message="otp_sent", purpose=OtpPurpose.RESET_PASSWORD)


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(
    body: ResetPasswordRequest, session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    service = AuthService(session)
    try:
        tokens = await service.reset_password(body.phone, body.code, body.new_password)
    except UserNotFoundError as error:
        await session.commit()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error
    except OtpInvalidError as error:
        # Persist the attempts increment from the failed check even though we reject the request.
        await session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

    await session.commit()
    return tokens


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: VerifyOtpRequest, session: AsyncSession = Depends(get_session)
) -> TokenResponse:
    service = AuthService(session)
    try:
        tokens = await service.verify_otp(body.phone, body.code, body.purpose)
    except UserNotFoundError as error:
        await session.commit()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error
    except OtpInvalidError as error:
        # Persist the attempts increment from the failed check even though we reject the request.
        await session.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error

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
