import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.auth.otp_service import OtpService
from app.config import settings
from app.cycles.scheduler_service import CycleSchedulerService
from app.db import async_session

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
        closed = await CycleSchedulerService(session).sweep_deadlines()
        await session.commit()
    if closed:
        logger.info("Deadline sweep closed %d cycle(s)", closed)


async def _run_otp_cleanup() -> None:
    async with async_session() as session:
        deleted = await OtpService(session).cleanup_expired()
        await session.commit()
    if deleted:
        logger.info("OTP cleanup removed %d expired/consumed code(s)", deleted)


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
        _run_otp_cleanup,
        "interval",
        seconds=settings.scheduler_interval_seconds,
        id="otp_cleanup",
    )
    scheduler.start()
    logger.info("Scheduler started (interval=%ds)", settings.scheduler_interval_seconds)


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
