import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.auth.telegram_login import TelegramLoginService
from app.config import settings
from app.cycles.scheduler_service import CycleSchedulerService
from app.db import async_session
from app.telegram.notify import notify_cycle_closed

logger = logging.getLogger("app.scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")


async def _run_reminder_sweep() -> None:
    async with async_session() as session:
        sent = await CycleSchedulerService(session).sweep_reminders()
        await session.commit()
    if sent:
        logger.info("Reminder sweep sent %d reminder(s)", sent)


async def _run_deadline_sweep() -> None:
    async with async_session() as session:
        closures = await CycleSchedulerService(session).sweep_deadlines()
        await session.commit()
        # After the commit, not inside the sweep: a summary of a close that then rolled
        # back would send the owner shopping against a cycle still collecting orders.
        for closure in closures:
            await notify_cycle_closed(
                session, closure.cycle, closure.orders_count, closure.total_cents
            )
    if closures:
        logger.info("Deadline sweep closed %d cycle(s)", len(closures))


async def _run_auth_session_cleanup() -> None:
    async with async_session() as session:
        deleted = await TelegramLoginService(session).cleanup_expired()
        await session.commit()
    if deleted:
        logger.info("Auth cleanup removed %d expired/spent login session(s)", deleted)


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
