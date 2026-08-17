import uuid
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User


class UserNotFoundError(Exception):
    pass


class OwnRoleChangeError(Exception):
    """The owner tried to change their own role.

    The only guard the role list needs: an admin who cannot demote themselves means the
    shop can never end up with zero admins, and the alternative (counting the remaining
    ones) forbids exactly the same move a step later, with a worse explanation.
    """


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

    async def list_page(
        self, page: int = 1, page_size: int = 20, search: str | None = None
    ) -> tuple[list[User], int]:
        """One page of accounts, admins first and newest next.

        Admins first because that is what the page is for — the owner opens it to see who
        else can get into the panel, and hunting for two rows among two hundred customers
        is the version of this list nobody would open twice.
        """
        query = select(User)
        if search:
            needle = f"%{search.strip()}%"
            query = query.where(or_(User.name.ilike(needle), User.phone.ilike(needle)))

        total = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self._session.execute(
            query.order_by(
                # ADMIN sorts before CUSTOMER alphabetically, but relying on that would be
                # a rule nobody wrote down: the ordering is spelled out instead.
                case((User.role == Role.ADMIN, 0), else_=1),
                User.created_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def set_role(self, actor_id: uuid.UUID, user_id: uuid.UUID, role: Role) -> User:
        """Grants or revokes admin rights. Refuses to touch the actor's own row."""
        if actor_id == user_id:
            raise OwnRoleChangeError

        user = await self.get(user_id)
        user.role = role
        await self._session.flush()
        return user

    async def update(self, user_id: uuid.UUID, updates: dict[str, Any]) -> User:
        user = await self.get(user_id)

        for field, value in updates.items():
            setattr(user, field, value)

        await self._session.flush()
        return user
