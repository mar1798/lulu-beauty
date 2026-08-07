from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import token_service
from app.auth.models import OtpPurpose, RefreshToken, User
from app.auth.otp_service import OtpService
from app.auth.schemas import TokenResponse
from app.auth.security import hash_password, hash_token, verify_password
from app.telegram.models import PendingTelegramContact


class PhoneAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class PhoneNotVerifiedError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._otp = OtpService(session)

    async def register(self, phone: str, name: str, password: str) -> None:
        user = await self._get_user_by_phone(phone)

        if user is not None and user.phone_verified:
            raise PhoneAlreadyRegisteredError

        if user is None:
            user = User(phone=phone, name=name, password_hash=hash_password(password))
            pending = await self._pop_pending_telegram_contact(phone)
            if pending is not None:
                user.telegram_chat_id = pending.chat_id
            self._session.add(user)
        else:
            user.name = name
            user.password_hash = hash_password(password)
        await self._session.flush()

        await self._otp.send(user, OtpPurpose.REGISTER)

    async def login(self, phone: str, password: str) -> None:
        user = await self._get_user_by_phone(phone)
        if user is None or not verify_password(user.password_hash, password):
            raise InvalidCredentialsError
        if not user.phone_verified:
            raise PhoneNotVerifiedError

        await self._otp.send(user, OtpPurpose.LOGIN)

    async def verify_otp(self, phone: str, code: str, purpose: OtpPurpose) -> TokenResponse:
        user = await self._get_user_by_phone(phone)
        if user is None:
            raise UserNotFoundError

        await self._otp.verify(user, code, purpose)

        if purpose == OtpPurpose.REGISTER:
            user.phone_verified = True

        return await self._issue_tokens(user)

    async def forgot_password(self, phone: str) -> None:
        user = await self._get_user_by_phone(phone)
        if user is None:
            raise UserNotFoundError

        await self._otp.send(user, OtpPurpose.RESET_PASSWORD)

    async def reset_password(self, phone: str, code: str, new_password: str) -> TokenResponse:
        user = await self._get_user_by_phone(phone)
        if user is None:
            raise UserNotFoundError

        await self._otp.verify(user, code, OtpPurpose.RESET_PASSWORD)

        user.password_hash = hash_password(new_password)

        return await self._issue_tokens(user)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = token_service.decode_refresh_token(refresh_token)
        except token_service.InvalidTokenError as error:
            raise InvalidCredentialsError from error

        token_hash = hash_token(refresh_token)
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored = result.scalar_one_or_none()

        now = datetime.now(UTC)
        if (
            stored is None
            or stored.revoked_at is not None
            or stored.expires_at < now
            or str(stored.user_id) != payload.sub
        ):
            raise InvalidCredentialsError
        stored.revoked_at = now

        user = await self._session.get(User, stored.user_id)
        if user is None:
            raise InvalidCredentialsError

        return await self._issue_tokens(user)

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored = result.scalar_one_or_none()
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)

    async def _issue_tokens(self, user: User) -> TokenResponse:
        access_token = token_service.create_access_token(user.id, user.role)
        refresh_token, expires_at = token_service.create_refresh_token(user.id)

        self._session.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(refresh_token),
                expires_at=expires_at,
            )
        )

        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    async def _get_user_by_phone(self, phone: str) -> User | None:
        result = await self._session.execute(select(User).where(User.phone == phone))
        return result.scalar_one_or_none()

    async def _pop_pending_telegram_contact(self, phone: str) -> PendingTelegramContact | None:
        result = await self._session.execute(
            select(PendingTelegramContact).where(PendingTelegramContact.phone == phone)
        )
        pending = result.scalar_one_or_none()
        if pending is not None:
            await self._session.delete(pending)
        return pending
