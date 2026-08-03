from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import OtpCode, OtpPurpose, User
from app.auth.security import generate_otp_code, hash_password, verify_password
from app.config import settings
from app.telegram.bot import notifications_service

RESEND_INTERVAL_SECONDS = 30


class OtpResendTooSoonError(Exception):
    pass


class OtpInvalidError(Exception):
    pass


class OtpService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def send(self, user: User, purpose: OtpPurpose) -> None:
        now = datetime.now(UTC)
        resend_interval = timedelta(seconds=RESEND_INTERVAL_SECONDS)
        latest = await self._latest_active(user.id, purpose)
        if latest is not None and (now - latest.created_at) < resend_interval:
            raise OtpResendTooSoonError

        code = generate_otp_code()
        self._session.add(
            OtpCode(
                user_id=user.id,
                code_hash=hash_password(code),
                purpose=purpose,
                expires_at=now + timedelta(seconds=settings.otp_ttl_seconds),
            )
        )
        await self._session.flush()

        await notifications_service.send_otp(user, code, purpose)

    async def verify(self, user: User, code: str, purpose: OtpPurpose) -> None:
        otp = await self._latest_active(user.id, purpose)
        now = datetime.now(UTC)

        if otp is None or otp.expires_at < now:
            raise OtpInvalidError("otp_expired_or_not_found")
        if otp.attempts >= settings.otp_max_attempts:
            raise OtpInvalidError("otp_too_many_attempts")

        if not verify_password(otp.code_hash, code):
            otp.attempts += 1
            raise OtpInvalidError("otp_invalid_code")

        otp.consumed_at = now

    async def _latest_active(self, user_id: UUID, purpose: OtpPurpose) -> OtpCode | None:
        result = await self._session.execute(
            select(OtpCode)
            .where(
                OtpCode.user_id == user_id,
                OtpCode.purpose == purpose,
                OtpCode.consumed_at.is_(None),
            )
            .order_by(OtpCode.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
