import uuid
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User


class UserNotFoundError(Exception):
    pass


class SuperAdminImmutableError(Exception):
    """Somebody tried to change the role on the shop's own account.

    The rule that keeps the panel reachable: SUPER_ADMIN is the one row no role change
    can touch, so the shop can never end up with zero admins — not by demoting the last
    one, and not by demoting the person doing the demoting. It replaces the older
    "you can't change your own role" guard, which protected the same invariant only as
    long as every admin could hand out the role.
    """


class SuperAdminNotAssignableError(Exception):
    """SUPER_ADMIN was asked for as a target role.

    It is granted by deployment (`app/scripts/seed.py`, from OWNER_PHONE), never through
    the panel: a role nobody can take back is not something to hand out with one click,
    and a second one would be a second person who can strip the first of everything.
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
        if search and search.strip():
            # Wildcards escaped, like the catalogue search does it: "%" and "_" are LIKE
            # syntax, so an owner typing "_" into the box matched every single-character
            # difference and a bare "%" matched the whole table.
            needle = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{needle}%"
            query = query.where(
                or_(
                    User.name.ilike(pattern, escape="\\"),
                    User.phone.ilike(pattern, escape="\\"),
                )
            )

        total = await self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        result = await self._session.execute(
            query.order_by(
                # Spelled out rather than left to the enum's alphabet: SUPER_ADMIN, ADMIN
                # and CUSTOMER happen to sort that way as text only by accident, and the
                # shop's own account belongs at the top of its own list.
                case((User.role == Role.SUPER_ADMIN, 0), (User.role == Role.ADMIN, 1), else_=2),
                User.created_at.desc(),
                # Same tiebreak the order listings need: accounts created in one tick
                # (the seed, a burst of sign-ups) otherwise straddle the page boundary
                # differently on each request.
                User.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def set_role(self, user_id: uuid.UUID, role: Role) -> User:
        """Grants or revokes admin rights. Only the caller's rights are not checked here —
        that is the router's `require_super_admin`.

        No actor argument any more: the "not your own row" guard it existed for is now
        covered by SUPER_ADMIN being unchangeable, and the only account that reaches this
        method is a SUPER_ADMIN one.
        """
        if role is Role.SUPER_ADMIN:
            raise SuperAdminNotAssignableError

        user = await self.get(user_id)
        if user.role is Role.SUPER_ADMIN:
            raise SuperAdminImmutableError

        user.role = role
        await self._session.flush()
        return user

    async def update(self, user_id: uuid.UUID, updates: dict[str, Any]) -> User:
        user = await self.get(user_id)

        for field, value in updates.items():
            setattr(user, field, value)

        await self._session.flush()
        return user
