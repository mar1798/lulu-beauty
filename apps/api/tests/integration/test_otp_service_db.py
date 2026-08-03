from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import OtpCode, OtpPurpose, User
from app.auth.otp_service import OtpInvalidError, OtpResendTooSoonError, OtpService
from app.config import settings
from tests.integration.factories import make_user


async def _send_and_capture_code(
    monkeypatch: pytest.MonkeyPatch, session: AsyncSession, purpose: OtpPurpose = OtpPurpose.LOGIN
) -> tuple[OtpService, User, str]:
    user = await make_user(session)
    captured: dict[str, str] = {}

    async def fake_send_otp(_user: object, code: str, _purpose: OtpPurpose) -> None:
        captured["code"] = code

    monkeypatch.setattr("app.auth.otp_service.notifications_service.send_otp", fake_send_otp)

    service = OtpService(session)
    await service.send(user, purpose)
    return service, user, captured["code"]


async def _only_otp(session: AsyncSession) -> OtpCode:
    return (await session.execute(select(OtpCode))).scalar_one()


async def test_verify_succeeds_with_correct_code(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, user, code = await _send_and_capture_code(monkeypatch, db_session)

    await service.verify(user, code, OtpPurpose.LOGIN)

    otp = await _only_otp(db_session)
    assert otp.consumed_at is not None


async def test_verify_wrong_code_increments_attempts_and_persists(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, user, _code = await _send_and_capture_code(monkeypatch, db_session)

    with pytest.raises(OtpInvalidError):
        await service.verify(user, "000000", OtpPurpose.LOGIN)

    # Mirrors the router's explicit commit-on-failure (see PLAN.md step 5): the caller is
    # expected to commit even when verify() raises, or the attempts increment is lost.
    await db_session.commit()

    otp = await _only_otp(db_session)
    assert otp.attempts == 1


async def test_verify_rejects_expired_code(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, user, _code = await _send_and_capture_code(monkeypatch, db_session)
    otp = await _only_otp(db_session)
    otp.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.flush()

    with pytest.raises(OtpInvalidError):
        await service.verify(user, "000000", OtpPurpose.LOGIN)


async def test_verify_rejects_after_max_attempts(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, user, code = await _send_and_capture_code(monkeypatch, db_session)
    otp = await _only_otp(db_session)
    otp.attempts = settings.otp_max_attempts
    await db_session.flush()

    with pytest.raises(OtpInvalidError):
        await service.verify(user, code, OtpPurpose.LOGIN)


async def test_send_rejects_resend_within_interval(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await make_user(db_session)
    monkeypatch.setattr(
        "app.auth.otp_service.notifications_service.send_otp", AsyncMock(return_value=None)
    )
    service = OtpService(db_session)

    await service.send(user, OtpPurpose.LOGIN)
    with pytest.raises(OtpResendTooSoonError):
        await service.send(user, OtpPurpose.LOGIN)


async def test_cleanup_expired_removes_expired_and_consumed_codes(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    service, user, code = await _send_and_capture_code(monkeypatch, db_session)
    await service.verify(user, code, OtpPurpose.LOGIN)
    await db_session.flush()

    deleted = await service.cleanup_expired()
    await db_session.commit()

    assert deleted == 1
    remaining = (await db_session.execute(select(OtpCode))).scalars().all()
    assert remaining == []
