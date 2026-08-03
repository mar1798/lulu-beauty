import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User


class UserNotFoundError(Exception):
    pass


class UsersService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self._session.get(User, user_id)
        if user is None:
            # Reachable with a still-valid access token for a deleted user: access tokens
            # are verified cryptographically without a DB lookup (see auth/dependencies.py).
            raise UserNotFoundError
        return user

    async def update(self, user_id: uuid.UUID, updates: dict[str, Any]) -> User:
        user = await self.get(user_id)

        for field, value in updates.items():
            setattr(user, field, value)

        await self._session.flush()
        return user
