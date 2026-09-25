import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.wanted.models import WantedProduct


class ContactRequiredError(Exception):
    """A guest wrote in without leaving a name and a number to answer on."""


class WantedProductsService:
    """Wishes for things the catalog does not stock yet.

    One method, and it only ever inserts: nothing in the shop reads this table back, and
    the owner is told over Telegram (see `telegram/notify.notify_wanted_product`).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def submit(
        self,
        *,
        message: str,
        user_id: uuid.UUID | None,
        name: str | None,
        phone: str | None,
    ) -> WantedProduct:
        """Records one wish, answering with the row the notification will be built from.

        The account wins over the payload whenever there is one: those two fields are the
        only way the owner has of getting back to the person, and a signed-in customer has
        already proved the number in the bot. What the form sends is a fallback for guests,
        who are most of this endpoint's callers — the catalog and its search need no login.
        """
        contact = await self._account_contact(user_id)
        if contact is None:
            if name is None or phone is None:
                raise ContactRequiredError
            contact = (name.strip(), phone)

        wanted = WantedProduct(
            user_id=user_id,
            name=contact[0],
            phone=contact[1],
            message=message.strip(),
        )
        self._session.add(wanted)
        await self._session.flush()
        return wanted

    async def _account_contact(self, user_id: uuid.UUID | None) -> tuple[str, str] | None:
        """The signed-in writer's own name and number, or None when there is no account.

        An erased account reads as None like everywhere else a profile is read: what is left
        on that row is a placeholder name and a filled hole where the phone was, and putting
        either in front of the owner is precisely what the erasure was for. Its token can
        still be in flight — access tokens outlive the row by their expiry — and then the
        form's own fields answer for it, as they do for a guest.
        """
        if user_id is None:
            return None

        user = await self._session.get(User, user_id)
        if user is None or user.deleted_at is not None:
            return None
        return user.name, user.phone
