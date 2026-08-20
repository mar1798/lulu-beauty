import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cycles.models import CycleStatus, OrderCycle
from app.cycles.reminders import REMINDER_STAGES
from app.orders.models import Order


class CycleNotFoundError(Exception):
    pass


class PastDeadlineError(Exception):
    pass


class CycleHasOrdersError(Exception):
    pass


class CycleAlreadyClosedError(Exception):
    """Closing a closed cycle: nothing to do, and the second tally would be a lie."""


class ActiveCycleExistsError(Exception):
    """There is already a cycle collecting orders, and there can only be one.

    Two open cycles do not divide the shop in two — they break it. A cart belongs to one
    cycle (`Unique(user_id, cycle_id)`), and `get_active_cycle` picks the nearest deadline,
    so a second cycle created with an earlier deadline silently becomes *the* cycle and
    every cart collected under the first one drops out of sight. Editing the open cycle's
    deadline is the operation the owner actually wanted.
    """


class CyclesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[OrderCycle]:
        result = await self._session.execute(select(OrderCycle).order_by(OrderCycle.deadline_at))
        return list(result.scalars().all())

    async def get_active_cycle(self) -> OrderCycle | None:
        """The cycle currently collecting orders, if any.

        Not by deadline alone: the owner can close a cycle before its deadline (see
        `CycleSchedulerService.close_now`), and a cycle whose carts have already been
        emptied into wishlists must not go on accepting new ones just because the date
        it was going to end on hasn't arrived yet.
        """
        result = await self._session.execute(
            select(OrderCycle)
            .where(
                OrderCycle.deadline_at > datetime.now(UTC),
                OrderCycle.status != CycleStatus.CLOSED,
            )
            .order_by(OrderCycle.deadline_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get(self, cycle_id: uuid.UUID) -> OrderCycle | None:
        return await self._session.get(OrderCycle, cycle_id)

    async def _other_open_cycle(self, cycle_id: uuid.UUID, now: datetime) -> OrderCycle | None:
        """Any cycle other than this one that is still collecting.

        Not `get_active_cycle()`: that answers "which cycle is *the* one" by nearest
        deadline, and the question here is whether some *other* row already holds that
        position — which is a different query the moment the cycle being edited would
        itself win the comparison.
        """
        result = await self._session.execute(
            select(OrderCycle)
            .where(
                OrderCycle.id != cycle_id,
                OrderCycle.deadline_at > now,
                OrderCycle.status != CycleStatus.CLOSED,
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, deadline_at: datetime, label: str | None) -> OrderCycle:
        if deadline_at <= datetime.now(UTC):
            raise PastDeadlineError
        if await self.get_active_cycle() is not None:
            raise ActiveCycleExistsError

        cycle = OrderCycle(deadline_at=deadline_at, label=label)
        self._session.add(cycle)
        await self._session.flush()
        return cycle

    async def update(self, cycle_id: uuid.UUID, updates: dict[str, Any]) -> OrderCycle:
        cycle = await self._session.get(OrderCycle, cycle_id)
        if cycle is None:
            raise CycleNotFoundError

        # create() refuses a deadline in the past; update() used to accept one silently,
        # and on a cycle customers are still ordering in that is not a shorter cycle but a
        # closed one — the next sweep shuts it and empties every cart collected under it.
        #
        # Only *open* cycles are guarded. A cycle whose deadline has already passed is
        # history, and the owner still edits those: the calendar's form saves the label
        # and the deadline together, so refusing a past date there would make renaming a
        # finished cycle impossible.
        now = datetime.now(UTC)
        previous_deadline_at = cycle.deadline_at
        deadline_at = updates.get("deadline_at")
        if deadline_at is not None and deadline_at <= now and cycle.deadline_at > now:
            raise PastDeadlineError

        # The same rule `create()` enforces, on the one path that could get around it.
        # Moving a finished cycle's deadline into the future reopens it (see below), and
        # nothing here checked whether the shop already had a cycle collecting — so the
        # calendar could produce by edit exactly the state `ActiveCycleExistsError`
        # exists to prevent, with the earlier-deadline row silently becoming *the* cycle
        # and every cart gathered under the other one dropping out of sight.
        #
        # Only a cycle that is *becoming* open is checked. Editing one that is already
        # collecting — extending its deadline, renaming it — is the ordinary use of this
        # endpoint and must stay free of a guard that would refuse it against itself.
        was_open = cycle.deadline_at > now and cycle.status is not CycleStatus.CLOSED
        will_be_open = (deadline_at or cycle.deadline_at) > now
        if will_be_open and not was_open and await self._other_open_cycle(cycle.id, now):
            raise ActiveCycleExistsError

        # Closed *early* — by `close_now`, which deliberately leaves the deadline alone —
        # is exactly the shape the reopen rule below looks for: CLOSED with a deadline
        # still ahead. Without remembering that from before the edit, renaming such a
        # cycle (and the calendar always sends the deadline together with the label)
        # silently put it back to collecting orders the owner had already bought for.
        was_closed_early = cycle.status is CycleStatus.CLOSED and cycle.deadline_at > now

        for field, value in updates.items():
            setattr(cycle, field, value)

        # A deadline stage the cycle has moved out of has to be announced again — the
        # sweep selects on these stamps alone, so extending a deadline after the day-out
        # reminder went out meant no reminder on the new date at all. Cleared only for
        # the stages the new deadline has not entered yet; a stamp inside its own window
        # was earned.
        if deadline_at is not None and deadline_at != previous_deadline_at:
            self._clear_passed_reminders(cycle, now)

        # Moving a closed cycle's deadline back into the future reopens it — and until the
        # rest of the row followed, that reopening was only half real: `get_active_cycle()`
        # goes by the deadline alone, so the cycle started collecting orders again, while
        # `sweep_deadlines` skips anything already CLOSED and so would never close it a
        # second time. It also kept `closed_at` and both reminder stamps, so the new
        # deadline would pass unannounced. UPCOMING rather than ACTIVE for the same reason
        # `create()` leaves it there: the sweep promotes whichever cycle is next.
        if not was_closed_early and cycle.status is CycleStatus.CLOSED and cycle.deadline_at > now:
            cycle.status = CycleStatus.UPCOMING
            cycle.closed_at = None
            cycle.reminder_sent_at = None
            cycle.final_reminder_sent_at = None

        await self._session.flush()
        return cycle

    @staticmethod
    def _clear_passed_reminders(cycle: OrderCycle, now: datetime) -> None:
        """Reopens the reminder stages the new deadline is no longer inside.

        `plan_reminders` picks cycles by "stamp is NULL and the deadline is within the
        window", so a stamp left over from the old date is indistinguishable from a
        reminder already delivered for the new one — and a deadline pushed a week out
        after the day-ahead nudge went out would arrive with no warning at all.

        Only the stages the new deadline has left behind are cleared. A stamp for a stage
        whose window the cycle is still inside describes a message that is still true.
        """
        for stage in REMINDER_STAGES:
            if cycle.deadline_at > now + stage.window:
                setattr(cycle, stage.sent_at_field, None)

    async def delete(self, cycle_id: uuid.UUID) -> None:
        cycle = await self._session.get(OrderCycle, cycle_id)
        if cycle is None:
            raise CycleNotFoundError

        has_orders = await self._session.scalar(
            select(Order.id).where(Order.cycle_id == cycle_id).limit(1)
        )
        if has_orders is not None:
            raise CycleHasOrdersError

        await self._session.delete(cycle)
