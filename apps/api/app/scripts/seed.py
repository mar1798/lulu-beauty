"""Upserts the single ADMIN owner account from OWNER_* env vars.

No credentials to seed: the owner signs in through the bot like everyone else, so the
one thing this cannot do is bind their Telegram — that happens the first time they share
their contact with the bot from the phone registered as OWNER_PHONE.

Run with: uv run python -m app.scripts.seed
"""

import asyncio

from sqlalchemy import select

from app.auth.models import Role, User
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
        owner.role = Role.ADMIN

        await session.commit()


def main() -> None:
    asyncio.run(seed_owner())


if __name__ == "__main__":
    main()
