import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import ADMIN_ROLES, RefreshToken, Role, TelegramAuthSession, User
from app.cart.models import Cart
from app.orders.models import Order, OrderStatus
from app.wanted.models import WantedProduct
from app.wishlist.models import WishlistItem

#: What replaces the name of an account that asked to be forgotten. Russian, because it
#: is read: the owner sees it against the orders that person left behind.
DELETED_NAME = "Удалённый аккаунт"

#: Statuses that stop an erasure until they resolve. The owner has already spent money
#: against these — CONFIRMED means the goods were bought, READY means they are lying on
#: the shelf waiting — and the person still has something of theirs to collect. Erasing
#: here would cancel a purchase that was already made and leave the owner without a name
#: or a number to ask about it, which is a loss the erasure has no right to cause.
#: PENDING is not among them: nothing is bought against it yet.
DELETION_BLOCKING_STATUSES = frozenset({OrderStatus.CONFIRMED, OrderStatus.READY})

#: What an erasure withdraws on the way out. Only PENDING can be here at all — the two
#: statuses above refuse the erasure outright — and it is named rather than derived so
#: the two lists are read side by side.
DELETION_WITHDRAWN_STATUSES = frozenset({OrderStatus.PENDING})


def _erased_phone(user_id: uuid.UUID) -> str:
    """What replaces the phone number of an erased account.

    `users.phone` is UNIQUE and NOT NULL, so erasing it means overwriting it with
    something — and that something has to stay unique, or the second person to delete
    their account would collide with the first. The row's own id is the one value already
    guaranteed unique; 24 of its hex digits behind the prefix fit the column's 32
    characters exactly. Nothing reads this value back: it is a filled hole, not an id.
    """
    return f"deleted:{user_id.hex[:24]}"


class UserNotFoundError(Exception):
    pass


class AccountHasUnfinishedOrdersError(Exception):
    """The caller still has orders the owner has already bought against.

    Carries the ids so the refusal can name them: "you have orders in progress" without
    saying which ones sends the person to the order list to guess.
    """

    def __init__(self, order_ids: list[uuid.UUID]) -> None:
        super().__init__("account has unfinished orders")
        self.order_ids = order_ids


class AccountNotDeletableError(Exception):
    """An account with admin rights tried to erase itself.

    Self-service erasure is a customer's right over their own data. An admin account is
    not that: it is a way into the shop's panel, granted by the owner, and giving it up
    is the owner's decision rather than a button its holder presses in a bad moment. The
    way out is `set_role` back to CUSTOMER first — after which erasure is available like
    to anybody else.

    SUPER_ADMIN is the same rule at its strongest: the shop must keep a way into its own
    panel, which is why its role is immutable too (`SuperAdminImmutableError`).

    This also holds an invariant the bot relies on: `recipients.get_owners` selects on
    role alone, and since no admin row can be erased, it can never hand back a nameless
    one with no chat to send to.
    """


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
        if user is None or user.deleted_at is not None:
            # Reachable with a still-valid access token for a deleted user: access tokens
            # are verified cryptographically without a DB lookup (see auth/dependencies.py),
            # so one keeps working for up to JWT_ACCESS_TTL_SECONDS after the account is
            # gone. An erased row is "not found" to everything that reads a profile — the
            # row exists only to hold the orders that cascade off it.
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
        # Erased accounts are out of the list entirely: it answers "who can get into the
        # panel" and "who signed up recently", and a row with no name and no number
        # answers neither.
        query = select(User).where(User.deleted_at.is_(None))
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

    async def deletion_blockers(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """The orders that stand between this account and its erasure, oldest first.

        Asked by the account page before it draws the button and by `delete_account`
        before it erases anything — one rule, one query, so the disabled button and the
        refusal can never disagree. An empty list means the account can be erased now.
        """
        result = await self._session.execute(
            select(Order.id)
            .where(Order.user_id == user_id, Order.status.in_(DELETION_BLOCKING_STATUSES))
            .order_by(Order.created_at)
        )
        return list(result.scalars().all())

    async def delete_account(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """Erases one account at its owner's request, and says which orders it withdrew.

        Not a `DELETE FROM users`: every order points at this row with `ON DELETE
        CASCADE`, so removing it would take the shop's record of goods it actually bought
        and handed over with it — including orders from cycles that closed months ago.
        What the person is entitled to have erased is the data *about them*, and that is
        what this removes: the phone, the name, the Telegram binding. What stays is a
        nameless row and the order history hanging off it, which is about the shop's
        purchases rather than about a person.

        An order the owner has already bought against (`DELETION_BLOCKING_STATUSES`)
        refuses the erasure instead of being cancelled by it: the goods exist, they were
        paid for, and they are still this person's to collect. The site says so and keeps
        the button disabled until those orders leave those statuses, so this is the same
        rule stated twice rather than a surprise at the end. Only the owner can move them
        — a customer may cancel a PENDING order and nothing later (`customer_flags`) — so
        what the site tells the person to do is collect the goods, or ask.

        What is left after that guard is PENDING and nothing else, and it is withdrawn on
        the way out, exactly as if the person had cancelled each one themselves: nothing
        is bought against it yet, and leaving it in the purchase list with nobody to hand
        it to is worse for the owner than the cancellation. The ids come back so the
        router can tell the owner after the commit; an empty list means there was nothing
        live to withdraw.

        Everything else the account owned goes for real: cart, wishlist, refresh tokens,
        and any login session still waiting in the bot. No commit here — the caller owns
        the transaction, as everywhere else.
        """
        user = await self.get(user_id)
        if user.role in ADMIN_ROLES:
            raise AccountNotDeletableError

        blocking = await self.deletion_blockers(user_id)
        if blocking:
            raise AccountHasUnfinishedOrdersError(blocking)

        open_orders = await self._session.execute(
            select(Order).where(
                Order.user_id == user_id, Order.status.in_(DELETION_WITHDRAWN_STATUSES)
            )
        )
        withdrawn = list(open_orders.scalars().all())
        for order in withdrawn:
            order.status = OrderStatus.CANCELLED_BY_CUSTOMER

        # Carts take their items with them at the database level (`ON DELETE CASCADE` on
        # cart_items.cart_id), so the rows go even though this never loads them.
        await self._session.execute(delete(Cart).where(Cart.user_id == user_id))
        await self._session.execute(delete(WishlistItem).where(WishlistItem.user_id == user_id))
        # Wishes for products the shop does not stock carry their own copy of the name and
        # the number (app/wanted/models.py) — the one thing this erasure is about — and
        # nothing anywhere reads them back except the notification that already went out.
        await self._session.execute(
            delete(WantedProduct).where(WantedProduct.user_id == user_id)
        )
        # Revoking would have been enough to end the sessions, but a revoked token row is
        # still a record that this account existed and when it last signed in.
        await self._session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
        await self._session.execute(
            delete(TelegramAuthSession).where(TelegramAuthSession.user_id == user_id)
        )

        user.phone = _erased_phone(user.id)
        user.name = DELETED_NAME
        # The binding goes last of the three, and it is the one that matters most: it is
        # what the bot looks up (`find_user_by_chat_id`), so from here the chat is simply
        # not attached to anything. The same number can start over from /start later, and
        # the account it gets will be a new one.
        user.telegram_chat_id = None
        user.deleted_at = datetime.now(UTC)
        await self._session.flush()

        return [order.id for order in withdrawn]
