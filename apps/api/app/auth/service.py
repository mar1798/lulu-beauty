import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import CursorResult, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import token_service
from app.auth.models import RefreshToken, User
from app.auth.schemas import TokenResponse
from app.auth.security import hash_token


class InvalidCredentialsError(Exception):
    pass


class AuthService:
    """Issues and rotates the token pair. It does not decide *who* you are.

    That decision belongs to `TelegramLoginService`: identity here is whatever the bot
    vouched for, so there is nothing to check against — no password, no code, no phone
    lookup. What is left is bookkeeping on refresh tokens.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def issue_tokens(self, user: User) -> TokenResponse:
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

        return await self.issue_tokens(user)

    async def prune_refresh_tokens(self) -> int:
        """Drops refresh tokens that can no longer be exchanged for anything.

        Nothing used to remove them: every refresh writes a new row and only revokes the
        old one, so an active session left ~100 dead rows a day behind it and the table
        (plus its two indexes) grew without bound — the one table here whose size is
        driven by traffic rather than by the size of the shop. Expired rows are outside
        their TTL and revoked ones were already spent, so neither can authenticate.
        """
        result = await self._session.execute(
            delete(RefreshToken).where(
                or_(
                    RefreshToken.expires_at <= datetime.now(UTC),
                    RefreshToken.revoked_at.is_not(None),
                )
            )
        )
        # rowcount lives on the DBAPI cursor result, which Result only exposes for DML.
        return int(cast("CursorResult[Any]", result).rowcount)

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> int:
        """Ends every live session of one account at once.

        The one control the bot can offer over a sign-in it has already vouched for:
        "это не я" arrives after the tab was let in, so refusing the auth session is not
        enough — whatever tokens it already claimed have to stop working too. Access
        tokens are stateless and outlive this by up to `JWT_ACCESS_TTL_SECONDS`; the
        refresh tokens are what turn a stolen tab into a permanent one, and those are here.
        """
        now = datetime.now(UTC)
        result = await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        return int(cast("CursorResult[Any]", result).rowcount)

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored = result.scalar_one_or_none()
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
