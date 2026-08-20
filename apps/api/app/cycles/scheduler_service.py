import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.cart.models import Cart, CartItem
from app.catalog.models import Product
from app.common.limits import MAX_WISHLIST_ITEMS
from app.cycles.models import CycleStatus, OrderCycle
from app.cycles.reminders import REMINDER_STAGES, WIDEST_REMINDER_WINDOW
from app.cycles.service import CycleAlreadyClosedError, CycleNotFoundError
from app.orders.models import CANCELLED_STATUSES, Order
from app.wishlist.models import WishlistItem


@dataclass(frozen=True)
class CycleReminder:
    """One cycle's nudge: who gets it, and which stages it settles once it has gone out.

    Carries user ids rather than User rows: the recipients are re-read in the sending
    session, which by then is the only one that still has a live transaction.

    `sent_at_fields` is every stage this nudge answers for — the one being sent plus any
    wider ones it overtook — so that stamping stays the same decision the planning was,
    rather than being re-derived against a clock that has moved on since.
    """

    cycle: OrderCycle
    user_ids: list[uuid.UUID]
    last_chance: bool
    sent_at_fields: tuple[str, ...]


@dataclass(frozen=True)
class CartRescue:
    """What became of one customer's cart when its cycle closed under it.

    `saved` counts the products that are in their wishlist now — including any that were
    already there, because "3 товара сохранены" has to match the three they had in the
    cart, not the subset that happened to be new. `dropped` is the overflow past
    MAX_WISHLIST_ITEMS, which the message owes them honestly.
    """

    user_id: uuid.UUID
    saved: int
    dropped: int


@dataclass(frozen=True)
class CycleClosure:
    """A cycle that just closed, with the tally the owner needs to start buying.

    Counted here, where the closing transaction is, but reported back rather than sent:
    nothing here must go out before the commit that produced it (see telegram/notify).
    """

    cycle: OrderCycle
    orders_count: int
    total_cents: int
    rescued_carts: list[CartRescue]


class CycleSchedulerService:
    """DB sweeps for cycle lifecycle: reminders, deadline close + cart cleanup.

    Deliberately re-reads state from the DB on every sweep rather than scheduling
    per-cycle timers, so a restart never loses a pending reminder/close (see PLAN.md).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def plan_reminders(self) -> list[CycleReminder]:
        """Works out who is due a nudge. Writes nothing and sends nothing.

        Planning, sending and stamping are three steps on purpose, in that order. The
        sending cannot happen here because a Telegram round-trip per recipient inside an
        open write transaction held that transaction for as long as the fan-out took. And
        the stamping cannot happen here either, because a stamp that lands before the
        message means an outage loses the reminder outright — the shop would rather send
        one twice than not at all, so the stamp follows the send (see `mark_reminders_sent`).
        """
        now = datetime.now(UTC)
        result = await self._session.execute(
            select(OrderCycle).where(
                OrderCycle.deadline_at > now,
                OrderCycle.deadline_at <= now + WIDEST_REMINDER_WINDOW,
                or_(
                    *(
                        getattr(OrderCycle, stage.sent_at_field).is_(None)
                        for stage in REMINDER_STAGES
                    )
                ),
            )
        )
        cycles = list(result.scalars().all())

        reminders = []
        for cycle in cycles:
            due = [
                stage
                for stage in REMINDER_STAGES
                if cycle.deadline_at <= now + stage.window
                and getattr(cycle, stage.sent_at_field) is None
            ]
            if not due:
                continue

            # Only the most urgent stage is actually sent; the wider ones it overtook are
            # settled along with it. A cycle opened three hours before its deadline would
            # otherwise fire both texts in the same tick — the day-ahead warning first,
            # immediately contradicted by "последний шанс".
            #
            # A cycle with nobody to notify is planned too, with an empty audience: there
            # is no reminder to send, but the stages still have to be marked, or every
            # later tick would re-examine the same cycle for as long as its window lasts.
            reminders.append(
                CycleReminder(
                    cycle=cycle,
                    user_ids=await self._reminder_recipients(cycle),
                    last_chance=due[0].last_chance,
                    sent_at_fields=tuple(stage.sent_at_field for stage in due),
                )
            )

        return reminders

    async def mark_reminders_sent(self, reminders: Sequence[CycleReminder]) -> None:
        """Closes the stages a nudge has answered for. Call it after the send, not before.

        Deliberately not idempotence-by-timestamp: the stamp is what makes the reminder
        idempotent, and it is written once the message is out. A crash in between means
        the next tick sends again — chosen over the alternative, where the same crash
        means the reminder is never sent at all and nobody finds out.
        """
        now = datetime.now(UTC)
        for reminder in reminders:
            for field in reminder.sent_at_fields:
                setattr(reminder.cycle, field, now)
        await self._session.flush()

    async def _reminder_recipients(self, cycle: OrderCycle) -> list[uuid.UUID]:
        """Who still has something in a cart for this cycle and hasn't checked out."""
        has_checked_out = select(Order.id).where(
            Order.user_id == User.id, Order.cycle_id == cycle.id
        )
        result = await self._session.execute(
            select(User.id)
            .join(Cart, Cart.user_id == User.id)
            .join(CartItem, CartItem.cart_id == Cart.id)
            .where(Cart.cycle_id == cycle.id, ~has_checked_out.exists())
            .distinct()
        )
        return list(result.scalars().all())

    async def sweep_deadlines(self) -> list[CycleClosure]:
        now = datetime.now(UTC)
        result = await self._session.execute(
            select(OrderCycle).where(
                OrderCycle.deadline_at <= now,
                OrderCycle.status != CycleStatus.CLOSED,
            )
        )
        cycles = list(result.scalars().all())

        closures = [await self._close_cycle(cycle, now) for cycle in cycles]
        # Always resync, not just when a cycle closed this tick: otherwise a cycle created
        # without any other cycle expiring at the same moment would show UPCOMING forever,
        # even though get_active_cycle() already treats it as the active one.
        await self._activate_next_upcoming(now)

        await self._session.flush()
        return closures

    async def close_now(self, cycle_id: uuid.UUID) -> CycleClosure:
        """Closes a cycle before its deadline, on the owner's say-so.

        Exactly what the deadline sweep does to it — carts into wishlists, tally counted,
        the next cycle promoted — because half of that would be worse than none: a cycle
        that stops taking orders while its carts sit in it is a cart nobody can rescue
        later (the sweep skips anything already CLOSED).

        The deadline is left alone. `get_active_cycle` checks the status too, so the
        cycle stops collecting either way, and rewriting the date would erase what the
        customers were promised — `closed_at` is where "actually ended" lives.
        """
        cycle = await self._session.get(OrderCycle, cycle_id)
        if cycle is None:
            raise CycleNotFoundError
        if cycle.status is CycleStatus.CLOSED:
            raise CycleAlreadyClosedError

        now = datetime.now(UTC)
        closure = await self._close_cycle(cycle, now)
        await self._activate_next_upcoming(now)
        await self._session.flush()
        return closure

    async def _close_cycle(self, cycle: OrderCycle, now: datetime) -> CycleClosure:
        rescued = await self.rescue_carts(cycle)

        cycle.status = CycleStatus.CLOSED
        cycle.closed_at = now
        return await self._tally(cycle, rescued)

    async def rescue_carts(self, cycle: OrderCycle) -> list[CartRescue]:
        """Empties the carts left in a cycle — into wishlists, not into nothing.

        A cart belongs to its cycle, so it cannot outlive it. But picking the products was
        the customer's work, and deleting the lot made them redo it from memory next time
        round. The wishlist is the one list here that is deliberately cycle-independent
        (see wishlist/models.py), which is exactly what that needs.

        Every cart that still holds something, whoever owns it. It used to skip anyone who
        had checked out in this cycle, on the theory that their cart was empty anyway —
        and empty carts are skipped further down regardless (`_save_to_wishlists`). What
        the filter actually did was lose the carts of the people who *kept shopping after
        ordering*: they placed an order, went on adding to the cart for the next one, and
        at the deadline that second selection was deleted without ever reaching a wishlist.
        """
        result = await self._session.execute(
            select(Cart.id, Cart.user_id).where(Cart.cycle_id == cycle.id)
        )
        # One cart per user per cycle (Unique(user_id, cycle_id)), so this stays 1:1.
        user_by_cart = {cart_id: user_id for cart_id, user_id in result.all()}
        if not user_by_cart:
            return []

        rescues = await self._save_to_wishlists(user_by_cart)
        await self._session.execute(
            delete(CartItem).where(CartItem.cart_id.in_(list(user_by_cart)))
        )
        return rescues

    async def _abandoned_products(
        self, cart_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        """Live products per cart, in the order they'd be saved.

        Discontinued ones are left out for the same reason the cart response and checkout
        leave them out: they are already not part of the cart the customer can see, so
        neither moving nor counting them would mean anything to them.
        """
        result = await self._session.execute(
            select(CartItem.cart_id, CartItem.product_id)
            .join(Product, Product.id == CartItem.product_id)
            .where(CartItem.cart_id.in_(cart_ids), Product.deleted_at.is_(None))
            # Only decides who survives the MAX_WISHLIST_ITEMS cut, which all but never
            # happens — but an arbitrary order there would be one nobody could explain.
            .order_by(Product.name)
        )
        by_cart: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        for cart_id, product_id in result.all():
            by_cart[cart_id].append(product_id)
        return by_cart

    async def _save_to_wishlists(
        self, user_by_cart: dict[uuid.UUID, uuid.UUID]
    ) -> list[CartRescue]:
        by_cart = await self._abandoned_products(list(user_by_cart))
        result = await self._session.execute(
            select(WishlistItem.user_id, WishlistItem.product_id).where(
                WishlistItem.user_id.in_(list(user_by_cart.values()))
            )
        )
        already_saved: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
        for user_id, product_id in result.all():
            already_saved[user_id].add(product_id)

        rescues = []
        for cart_id, user_id in user_by_cart.items():
            product_ids = by_cart.get(cart_id, [])
            if not product_ids:
                continue  # nothing left to save, and so nothing to tell them about

            saved_ids = already_saved[user_id]
            # The cap is the wishlist's own rule (a shortlist returned whole on every
            # call); a sweep is not a reason to quietly break it for one user.
            room = MAX_WISHLIST_ITEMS - len(saved_ids)
            saved = dropped = 0
            for product_id in product_ids:
                if product_id in saved_ids:
                    saved += 1  # already hearted — still theirs, still worth counting
                elif room > 0:
                    self._session.add(WishlistItem(user_id=user_id, product_id=product_id))
                    saved_ids.add(product_id)
                    room -= 1
                    saved += 1
                else:
                    dropped += 1
            rescues.append(CartRescue(user_id=user_id, saved=saved, dropped=dropped))

        await self._session.flush()
        return rescues

    async def _tally(self, cycle: OrderCycle, rescued: list[CartRescue]) -> CycleClosure:
        """What the owner now has to buy. Cancelled orders are excluded — they're the one
        thing on the list that isn't going to be purchased."""
        row = (
            await self._session.execute(
                select(
                    func.count(Order.id),
                    func.coalesce(func.sum(Order.total_cents), 0),
                ).where(Order.cycle_id == cycle.id, Order.status.notin_(CANCELLED_STATUSES))
            )
        ).one()
        return CycleClosure(
            cycle=cycle, orders_count=row[0], total_cents=row[1], rescued_carts=rescued
        )

    async def _activate_next_upcoming(self, now: datetime) -> None:
        result = await self._session.execute(
            select(OrderCycle)
            .where(OrderCycle.deadline_at > now, OrderCycle.status == CycleStatus.UPCOMING)
            .order_by(OrderCycle.deadline_at.asc())
            .limit(1)
        )
        next_cycle = result.scalar_one_or_none()
        if next_cycle is not None:
            next_cycle.status = CycleStatus.ACTIVE
