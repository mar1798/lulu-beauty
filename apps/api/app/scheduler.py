import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.auth.service import AuthService
from app.auth.telegram_login import TelegramLoginService
from app.config import settings
from app.cycles.scheduler_service import CycleSchedulerService
from app.db import async_session
from app.telegram.notify import (
    notify_carts_rescued,
    notify_cycle_closed,
    notify_cycle_closed_for_customers,
    notify_cycle_opened,
    notify_cycle_reminders,
)

logger = logging.getLogger("app.scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")


async def _run_announcement_sweep() -> None:
    """Finishes an opening announcement that never got through.

    Normally finds nothing: `notify_cycle_opened` is fired from the request that creates
    the cycle and stamps itself when its fan-out is done. This is what turns a process
    that died partway through that fan-out from "half the shop never heard the cycle
    opened" into "the next tick tells the rest".

    The session is closed before anything is sent — `notify_cycle_opened` opens its own,
    and holding this one across a broadcast over every customer would keep a connection
    idle in a transaction for the length of it.
    """
    async with async_session() as session:
        cycle_ids = await CycleSchedulerService(session).unannounced_cycles()

    for cycle_id in cycle_ids:
        # Logged after the call and on its answer, not before it: a cycle created moments
        # ago is still being announced by the request's own background task, and
        # `notify_cycle_opened` quietly steps aside for it — a warning written ahead of
        # that would report a resumed announcement on every ordinary opening.
        if await notify_cycle_opened(cycle_id):
            logger.warning("Cycle %s was never fully announced; announced it again", cycle_id)


async def _run_reminder_sweep() -> None:
    """Plan, send, then record — in that order, and never inside one transaction.

    The order is the whole design. Planning is read-only, so the fan-out that follows
    holds no write transaction open across a Telegram round-trip per recipient. And the
    stamps go in only once the messages are out: if this process dies mid-sweep, the next
    tick sends again rather than silently swallowing the reminder — for a deadline nudge,
    a duplicate is a nuisance and a miss is a lost order.
    """
    async with async_session() as session:
        service = CycleSchedulerService(session)
        reminders = await service.plan_reminders()
        # Only what actually went out is stamped: a stamp is permanent and a reminder is
        # sent once, so stamping the whole plan after a partial fan-out lost the rest.
        sent = await notify_cycle_reminders(session, reminders)
        await service.mark_reminders_sent(sent)
        await session.commit()
    if sent:
        logger.info(
            "Reminder sweep notified %d of %d cycle(s), %d recipient(s)",
            len(sent),
            len(reminders),
            sum(len(reminder.user_ids) for reminder in sent),
        )


async def _run_deadline_sweep() -> None:
    async with async_session() as session:
        closures = await CycleSchedulerService(session).sweep_deadlines()
        await session.commit()
        # After the commit, not inside the sweep: a summary of a close that then rolled
        # back would send the owner shopping against a cycle still collecting orders —
        # and would tell customers their carts are in the wishlist when they aren't.
        for closure in closures:
            await notify_cycle_closed(
                session, closure.cycle, closure.orders_count, closure.total_cents
            )
            await notify_carts_rescued(session, closure.cycle, closure.rescued_carts)
            # Cart holders have just been told the same thing with more detail; this is
            # for the people whose orders are in the cycle and who would otherwise learn
            # that it ended only by finding their order no longer editable.
            await notify_cycle_closed_for_customers(session, closure.cycle)
    if closures:
        logger.info("Deadline sweep closed %d cycle(s)", len(closures))


async def _run_cycle_notice_sweep() -> None:
    """Announcements first, then reminders — one job rather than two.

    For the order, which matters on the one tick where both have work to do: a cycle whose
    opening was lost must not have its "последний шанс" arrive before anyone has been told
    it exists. Two jobs on the same interval give no such guarantee.

    It also keeps these two fan-outs off each other's pacing, though only these two —
    `deadline_sweep` still runs alongside on the same interval and broadcasts its own
    closings, so a tick where a cycle closes and another is due a nudge still puts two
    broadcasts over the same bot at once. That overlap is absorbed per-chat rather than
    prevented (`telegram/service._deliver` waits out `TelegramRetryAfter` once).
    """
    await _run_announcement_sweep()
    await _run_reminder_sweep()


async def _run_auth_session_cleanup() -> None:
    async with async_session() as session:
        deleted = await TelegramLoginService(session).cleanup_expired()
        pruned = await AuthService(session).prune_refresh_tokens()
        await session.commit()
    if deleted:
        logger.info("Auth cleanup removed %d login session(s) past retention", deleted)
    if pruned:
        logger.info("Auth cleanup pruned %d dead refresh token(s)", pruned)


def start() -> None:
    if not settings.scheduler_enabled or scheduler.running:
        return

    scheduler.add_job(
        _run_cycle_notice_sweep,
        "interval",
        seconds=settings.scheduler_interval_seconds,
        id="cycle_notice_sweep",
    )
    scheduler.add_job(
        _run_deadline_sweep,
        "interval",
        seconds=settings.scheduler_interval_seconds,
        id="deadline_sweep",
    )
    scheduler.add_job(
        _run_auth_session_cleanup,
        "interval",
        seconds=settings.scheduler_interval_seconds,
        id="auth_session_cleanup",
    )
    scheduler.start()
    logger.info("Scheduler started (interval=%ds)", settings.scheduler_interval_seconds)


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
