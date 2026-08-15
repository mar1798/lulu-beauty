"""The HTTP end of the bot: Telegram POSTs updates here instead of being polled.

Why at all, since polling works: polling is a background task that owns a long-lived
`getUpdates` connection, and two of them on one token fight over the same updates. That
is what makes `uvicorn --reload` unusable while developing the bot (PLAN.md), and it is
also what makes running two API replicas impossible. A webhook has neither problem — the
process only answers requests it is handed.

The route is mounted unconditionally and answers 404 while the mode is off, so the app
has one shape in both configurations and nothing hints at an endpoint that isn't live.
"""

import logging
import secrets

from aiogram.types import Update
from fastapi import APIRouter, HTTPException, Request, Response, status

from app.config import settings
from app.telegram.client import bot

logger = logging.getLogger("app.telegram.webhook")

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Telegram sends the value configured in `setWebhook` in this header, and it is the only
# proof that a POST is from Telegram: the url itself is guessable, and nothing else in
# the payload is unforgeable.
SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"

WEBHOOK_PATH = "/telegram/webhook"


def is_enabled() -> bool:
    """Whether the webhook is configured well enough to be safe to serve.

    The secret counts as configuration, not as a nicety: without it the endpoint takes
    orders from whoever finds the path, and every handler behind it acts on `from_user`
    as though Telegram had vouched for it.
    """
    return bool(
        settings.telegram_use_webhook
        and settings.telegram_webhook_url
        and settings.telegram_webhook_secret
        and bot is not None
    )


@router.post("/webhook", include_in_schema=False)
async def telegram_webhook(request: Request) -> Response:
    """Feeds one update to the dispatcher and answers 200 no matter how that goes.

    Imported lazily, inside the function: `bot.py` imports the handlers, the handlers
    import `notify` — a module-level import here would put this router in that cycle for
    the sake of one attribute.

    Errors are swallowed on purpose. A non-2xx makes Telegram redeliver the same update,
    and the handlers behind this write to the database: a failure after a commit would
    be replayed as a second confirmation, a second unlink, a second status change. What
    a retry could fix here is nothing; what it can duplicate is everything.
    """
    if not is_enabled() or bot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Compared as bytes: `compare_digest` on `str` raises TypeError the moment either side
    # is not ASCII-only, and the header is attacker-controlled — a single Cyrillic letter
    # in it turned "wrong secret" into an unhandled 500 instead of the 403 below.
    provided = request.headers.get(SECRET_HEADER, "").encode()
    if not secrets.compare_digest(provided, settings.telegram_webhook_secret.encode()):
        logger.warning("Rejected a webhook call with a wrong or missing secret token")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "telegram_webhook_forbidden")

    from app.telegram.bot import dispatcher

    payload = await request.json()
    update = Update.model_validate(payload, context={"bot": bot})

    try:
        await dispatcher.feed_update(bot, update)
    except Exception:  # noqa: BLE001 - see the docstring: a retry costs more than the loss
        logger.exception("Failed to process Telegram update id=%s", update.update_id)

    return Response(status_code=status.HTTP_200_OK)
