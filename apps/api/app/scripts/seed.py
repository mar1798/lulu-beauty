"""Upserts the first ADMIN owner account from OWNER_* env vars.

The first, not the only one: further owners are granted in the admin panel
(`PATCH /admin/users/{id}/role`), and every notification meant for "the owner" already
goes to every ADMIN (`telegram/recipients.get_owners`). This script exists to bootstrap
the very first one, who has nobody to be granted access by.

No credentials to seed: the owner signs in through the bot like everyone else, so the
one thing this cannot do is bind their Telegram — that happens the first time they share
their contact with the bot from the phone registered as OWNER_PHONE.

Run with: uv run python -m app.scripts.seed
"""

import asyncio

from sqlalchemy import select

from app.auth.models import Role, User
from app.common.phone import normalize_phone
from app.config import settings
from app.db import async_session


async def seed_owner() -> None:
    async with async_session() as session:
        # Normalized to the same E.164 the bot writes when a contact is shared. Stored raw,
        # an OWNER_PHONE written as "+996 555 123456" or "0555123456" never matched the row
        # the bot went on to create — so the owner quietly ended up with a second, CUSTOMER
        # account and no way into the admin panel.
        phone = normalize_phone(settings.owner_phone)

        result = await session.execute(select(User).where(User.phone == phone))
        owner = result.scalar_one_or_none()

        if owner is None:
            owner = User(phone=phone)
            session.add(owner)

        owner.name = settings.owner_name
        owner.role = Role.ADMIN

        await session.commit()


def main() -> None:
    asyncio.run(seed_owner())


if __name__ == "__main__":
    main()
