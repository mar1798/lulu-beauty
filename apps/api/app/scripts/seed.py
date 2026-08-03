"""Upserts the single ADMIN owner account from OWNER_* env vars.

Run with: uv run python -m app.scripts.seed
"""

import asyncio

from sqlalchemy import select

from app.auth.models import Role, User
from app.auth.security import hash_password
from app.config import settings
from app.db import async_session


async def seed_owner() -> None:
    async with async_session() as session:
        result = await session.execute(select(User).where(User.phone == settings.owner_phone))
        owner = result.scalar_one_or_none()

        if owner is None:
            owner = User(phone=settings.owner_phone)
            session.add(owner)

        owner.name = settings.owner_name
        owner.password_hash = hash_password(settings.owner_password)
        owner.role = Role.ADMIN
        owner.phone_verified = True

        await session.commit()


def main() -> None:
    asyncio.run(seed_owner())


if __name__ == "__main__":
    main()
