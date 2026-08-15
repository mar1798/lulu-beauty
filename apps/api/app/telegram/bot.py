import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.config import settings
from app.telegram import keyboards, messages, webhook
from app.telegram.client import bot
from app.telegram.handlers import router as handlers_router

logger = logging.getLogger("app.telegram.bot")

dispatcher = Dispatcher()
dispatcher.include_router(handlers_router)

# Populates the "/" menu in the Telegram client. Two entries, because the bot is driven
# by the keyboard under the input field (`keyboards.main_menu`) and not by typing: the
# content commands still work as aliases (see handlers.py) but publishing them here would
# advertise a second, worse way to do the same five things.
#
# What stays is what the keyboard itself can't answer: /menu brings it back when it has
# been collapsed, and /help explains it. /start is absent for the older reason — Telegram
# offers it on an empty chat by itself, and in a linked chat it only invites re-linking.
BOT_COMMANDS = [
    BotCommand(command="menu", description="Показать кнопки"),
    BotCommand(command="help", description="Что умеет бот"),
]

_polling_task: asyncio.Task[None] | None = None
# Whether Telegram actually accepted the webhook. Config alone can't answer that — it
# validates the address on its side — and only a registration that happened should be
# taken down on shutdown.
_webhook_registered = False


async def _publish_menu(instance: Bot) -> None:
    """The "/" list and the button next to the input field.

    Both are cosmetic in the sense that the bot works without them, so a failure here is
    logged and swallowed: a menu that didn't publish must not be the reason the shop's
    only notification channel doesn't come up.
    """
    try:
        await instance.set_my_commands(BOT_COMMANDS)
    except Exception:  # noqa: BLE001 - a cosmetic menu must not stop the bot from starting
        logger.exception("Failed to publish the bot command menu")

    await _publish_mini_app_button(instance)


async def _publish_mini_app_button(instance: Bot) -> None:
    """The Mini App entry: the button left of the input field opens the site in Telegram.

    Set on every start rather than once by hand in BotFather, because the address it
    points at is configuration (`WEBSITE_BASE_URL`) and BotFather has no idea when that
    changes. Reset to the default when the site isn't openable as a Mini App — otherwise
    a dev token would leave a button pointing at somebody's old tunnel.
    """
    url = keyboards.mini_app_url()

    try:
        if url is None:
            await instance.set_chat_menu_button(menu_button=None)
            return
        await instance.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=messages.MINI_APP_BUTTON, web_app=WebAppInfo(url=url))
        )
    except Exception:  # noqa: BLE001 - same reasoning as the command menu
        logger.exception("Failed to publish the Mini App menu button")


async def _run(instance: Bot) -> None:
    await _publish_menu(instance)

    # A registration left over from a previous run — a webhook deploy rolled back, a
    # process killed before `stop()` — makes Telegram refuse `getUpdates` with a 409, and
    # polling then loops on that error while the shop's only notification channel is
    # silently dead. Taking it down first costs one call and is a no-op when there is none.
    try:
        await instance.delete_webhook()
    except Exception:  # noqa: BLE001 - the same reasoning as the menu: not a reason to stay down
        logger.exception("Failed to clear a stale webhook before polling")

    await dispatcher.start_polling(
        instance,
        # Off, because this process is not the bot's: uvicorn installs its own
        # SIGINT/SIGTERM handlers through the same `loop.add_signal_handler` slot, and
        # aiogram — starting later, inside the lifespan — replaced them. The signal then
        # only stopped polling, so the API itself never shut down: Ctrl+C did nothing in
        # dev and `docker stop` waited out its timeout and killed the container. Shutdown
        # is `stop()`'s job, which the lifespan already calls.
        handle_signals=False,
    )


async def start() -> None:
    """Brings the bot up in whichever mode is configured.

    Webhook is opt-in and falls back rather than raising: a misconfigured webhook would
    otherwise take the whole API down with it, and polling — noisy as it is — still
    delivers every notification this shop depends on.
    """
    global _polling_task

    if bot is None:
        logger.warning("TELEGRAM_BOT_TOKEN not set; Telegram bot disabled")
        return

    if settings.telegram_use_webhook and not webhook.is_enabled():
        logger.error(
            "TELEGRAM_USE_WEBHOOK is on but TELEGRAM_WEBHOOK_URL/TELEGRAM_WEBHOOK_SECRET "
            "are incomplete; falling back to polling"
        )

    if webhook.is_enabled() and await _start_webhook(bot):
        return

    _polling_task = asyncio.create_task(_run(bot))


async def _start_webhook(instance: Bot) -> bool:
    """Registers the address with Telegram. False means "use polling instead".

    Telegram validates the url on its own side — an address that doesn't resolve, or
    isn't HTTPS, comes back as a 400. Left to propagate, that failure happens inside the
    lifespan and takes the entire API down over a bot setting: `/health`, the catalog and
    the admin panel included. Observed, not imagined — it is how this branch was found.
    """
    global _webhook_registered
    url = settings.telegram_webhook_url.rstrip("/") + webhook.WEBHOOK_PATH

    try:
        await instance.set_webhook(
            url=url,
            secret_token=settings.telegram_webhook_secret,
            # The same list polling would have asked for. Left to Telegram's default, a
            # newly handled update type would silently never arrive.
            allowed_updates=dispatcher.resolve_used_update_types(),
            # Whatever piled up while the process was down is stale by definition: these
            # are presses on messages the person has long since scrolled past.
            drop_pending_updates=True,
        )
    except Exception:  # noqa: BLE001 - a bot setting must not take the API down with it
        logger.exception("Telegram refused the webhook at %s; falling back to polling", url)
        return False

    _webhook_registered = True
    logger.info("Telegram webhook registered at %s", url)
    # After the registration, not before: on the fallback path the menu is published by
    # the polling task instead, and publishing it twice is two pointless API calls.
    await _publish_menu(instance)
    return True


async def stop() -> None:
    global _polling_task, _webhook_registered

    if _polling_task is not None:
        _polling_task.cancel()
        try:
            await _polling_task
        except asyncio.CancelledError:
            pass
        _polling_task = None

    if bot is None:
        return

    if _webhook_registered:
        # Left in place, Telegram would keep posting to an address that is no longer
        # answering, and the updates would be lost rather than queued for the next start.
        _webhook_registered = False
        try:
            await bot.delete_webhook()
        except Exception:  # noqa: BLE001 - shutting down is not the time to raise
            logger.exception("Failed to remove the Telegram webhook")

    await bot.session.close()
