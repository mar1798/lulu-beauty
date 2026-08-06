"""Inline keyboards, and the callback payloads that come back from them.

Deliberately not in `messages.py`: that module is words. A keyboard is the one part of a
notification that is also an interface — its `callback_data` outlives the message it was
attached to and has to stay parseable by whatever the handler looks like months later, so
the format lives next to the filter that decodes it rather than next to prose.
"""

import logging
import uuid
from typing import Literal
from urllib.parse import urlparse

from aiogram.filters.callback_data import CallbackData
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.config import settings
from app.orders.models import OrderStatus
from app.telegram import messages

logger = logging.getLogger("app.telegram.keyboards")

OrderActionName = Literal["confirm", "cancel"]


class OrderAction(CallbackData, prefix="order"):
    """What the owner pressed, and which order they pressed it on.

    Telegram caps `callback_data` at 64 bytes; this packs to "order:confirm:" plus a
    dash-less UUID — 46 — so the order id travels whole and the handler needs no
    server-side table mapping short tokens back to orders.
    """

    action: OrderActionName
    order_id: uuid.UUID


# The only two moves worth making without opening the admin panel: everything past
# CONFIRMED (READY, COMPLETED) happens when the goods are physically in hand, which is
# not a moment anyone spends looking at a week-old notification.
ACTION_STATUS: dict[OrderActionName, OrderStatus] = {
    "confirm": OrderStatus.CONFIRMED,
    "cancel": OrderStatus.CANCELLED,
}


def order_actions(order_id: uuid.UUID) -> InlineKeyboardMarkup:
    """Confirm/cancel under the owner's new-order notification."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=messages.CONFIRM_BUTTON,
                    callback_data=OrderAction(action="confirm", order_id=order_id).pack(),
                ),
                InlineKeyboardButton(
                    text=messages.CANCEL_BUTTON,
                    callback_data=OrderAction(action="cancel", order_id=order_id).pack(),
                ),
            ]
        ]
    )


CHECKOUT_PATH = "/checkout"


def checkout_link() -> InlineKeyboardMarkup | None:
    """A link straight to checkout under the cart reminder — or nothing, if the site
    isn't publicly addressable.

    The reminder exists to be acted on, and "go find the site yourself" is most of the
    friction between reading it and checking out.
    """
    base = settings.website_base_url.rstrip("/")
    url = f"{base}{CHECKOUT_PATH}"
    if not _is_public_url(url):
        # Once per reminder sweep at most, and only in local dev — see _is_public_url.
        logger.debug("WEBSITE_BASE_URL %r is not linkable from Telegram; sending no button", base)
        return None

    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=messages.CHECKOUT_BUTTON, url=url)]]
    )


def _is_public_url(url: str) -> bool:
    """Whether Telegram will accept this as a url button.

    Telegram validates url buttons on its own side and rejects hosts it can't treat as
    public — `localhost`, a bare hostname, anything without a dot — with
    BUTTON_URL_INVALID, which fails the whole `sendMessage`, not just the button. The
    dev site lives on localhost, so the choice there is between a reminder without a
    button and no reminder at all.
    """
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and "." in (parsed.hostname or "")
