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
    notify_cycle_reminders,
)

logger = logging.getLogger("app.scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")


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
        await notify_cycle_reminders(session, reminders)
        await service.mark_reminders_sent(reminders)
        await session.commit()
    if reminders:
        logger.info(
            "Reminder sweep notified %d cycle(s), %d recipient(s)",
            len(reminders),
            sum(len(reminder.user_ids) for reminder in reminders),
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


async def _run_auth_session_cleanup() -> None:
    async with async_session() as session:
        deleted = await TelegramLoginService(session).cleanup_expired()
        pruned = await AuthService(session).prune_refresh_tokens()
        await session.commit()
    if deleted:
        logger.info("Auth cleanup removed %d expired/spent login session(s)", deleted)
    if pruned:
        logger.info("Auth cleanup pruned %d dead refresh token(s)", pruned)


def start() -> None:
    if not settings.scheduler_enabled or scheduler.running:
        return

    scheduler.add_job(
        _run_reminder_sweep,
        "interval",
        seconds=settings.scheduler_interval_seconds,
        id="reminder_sweep",
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
