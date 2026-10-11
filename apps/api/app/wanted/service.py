import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.wanted.models import WantedProduct


class AccountGoneError(Exception):
    """The writer's account is missing or erased: there is no contact to copy."""


class WantedProductsService:
    """Wishes for things the catalog does not stock yet.

    One method, and it only ever inserts: nothing in the shop reads this table back, and
    the owner is told over Telegram (see `telegram/notify.notify_wanted_product`).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def submit(self, *, message: str, user_id: uuid.UUID) -> WantedProduct:
        """Records one wish, answering with the row the notification will be built from.

        The name and the number are copied off the account: those two fields are the only
        way the owner has of getting back to the person, and a customer's number is one
        they have already proved in the bot. An erased account is refused rather than
        copied — what is left on that row is a placeholder name and a filled hole where
        the phone was, and putting either in front of the owner is what the erasure was
        for. The router's `require_live_user` turns most of those away first; this covers
        an erasure that lands between the two reads.
        """
        user = await self._session.get(User, user_id)
        if user is None or user.deleted_at is not None:
            raise AccountGoneError

        wanted = WantedProduct(
            user_id=user_id,
            name=user.name,
            phone=user.phone,
            message=message.strip(),
        )
        self._session.add(wanted)
        await self._session.flush()
        return wanted
