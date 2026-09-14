"""Upserts the shop's SUPER_ADMIN account from OWNER_* env vars.

The first owner, and the only one this script makes: further owners are granted ADMIN in
the admin panel (`PATCH /admin/users/{id}/role`), and every notification meant for "the
owner" goes to all of them (`telegram/recipients.get_owners`). This script exists to
bootstrap the one account that has nobody to be granted access by — and, because
SUPER_ADMIN is the role the panel cannot hand out or take away, it is also the only way
that account ever moves. Running it again on a shop that already has one is a no-op.

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
        # Overwrites ADMIN as readily as CUSTOMER: on a shop that predates the role this
        # is the step that promotes the owner, and re-running it is how an owner locked
        # out by a botched role change gets back in.
        owner.role = Role.SUPER_ADMIN

        await session.commit()


def main() -> None:
    asyncio.run(seed_owner())


if __name__ == "__main__":
    main()
