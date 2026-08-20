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
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from app.config import settings
from app.orders.models import OrderStatus
from app.telegram import messages

logger = logging.getLogger("app.telegram.keyboards")

OrderActionName = Literal["confirm", "cancel"]


# ─── The menu itself ─────────────────────────────────────────────────────────────
#
# A reply keyboard rather than an inline one, and that is the whole design decision
# here: an inline menu lives inside one message and scrolls away with it, so the way
# back to it is remembering which message it was — the same problem typed commands
# have. A reply keyboard sits under the input field, survives every message, and is
# the only thing in Telegram that is always in the same place.
#
# Cost of the choice: a reply keyboard occupies the message's single `reply_markup`
# slot, so a message carrying it cannot also carry inline buttons. Hence the split
# below — the menu ships with the framing replies (linked / login / menu / fallback),
# while content replies (cart, orders, wishlist) carry their own inline link buttons
# and simply leave the persistent menu standing underneath.


def main_menu() -> ReplyKeyboardMarkup:
    """Everything the bot can show, two taps deep at most.

    Pairs per row so the labels stay readable on a narrow phone; `is_persistent` keeps
    it up instead of collapsing back to the letter keyboard after every tap.
    """
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=messages.MENU_CART), KeyboardButton(text=messages.MENU_ORDERS)],
            [
                KeyboardButton(text=messages.MENU_WISHLIST),
                KeyboardButton(text=messages.MENU_DEADLINE),
            ],
            # Next to help rather than first in the list: the bot answers everything
            # people come here for on its own, and leaving for a browser is the last
            # option, not the first. A reply-keyboard button cannot be a url, so the
            # address itself arrives as an inline button in the answer (`handle_site`).
            [KeyboardButton(text=messages.MENU_SITE), KeyboardButton(text=messages.MENU_HELP)],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


def share_contact() -> ReplyKeyboardMarkup:
    """The only keyboard an unlinked chat gets: there is nothing else to offer it.

    `one_time_keyboard` because this button is pressed exactly once per account — the
    menu takes its place the moment the contact arrives.
    """
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=messages.SHARE_CONTACT_BUTTON, request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


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
    "cancel": OrderStatus.CANCELLED_BY_OWNER,
}


def order_actions(order_id: uuid.UUID) -> InlineKeyboardMarkup:
    """Confirm/cancel under the owner's new-order notification, plus the way in.

    The admin link is a second row rather than a third button: the two decisions belong
    together, and "look at it properly first" is what the owner does when neither of them
    is obvious from the notification alone. It is dropped when the site isn't addressable
    from Telegram (`_site_button`), like every other link here.
    """
    rows = [
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
    admin = _site_button(ADMIN_ORDERS_PATH, messages.ADMIN_ORDERS_BUTTON)
    if admin is not None:
        rows.append([admin])
    return InlineKeyboardMarkup(inline_keyboard=rows)


class LoginAction(CallbackData, prefix="login"):
    """Disowning a sign-in the bot has just vouched for.

    Packs to "login:" plus a dash-less UUID — 38 bytes, inside Telegram's 64 — so the
    session id travels whole and the handler needs no table of short tokens. One action
    only: the affirmative answer is the tap that already happened.
    """

    session_id: uuid.UUID


def login_reject(session_id: uuid.UUID) -> InlineKeyboardMarkup:
    """The single button under the post-login warning.

    Alone in its markup, and without a matching «это я»: an honest sign-in needs no
    second press, and offering one would turn every login into a two-step flow to guard
    against a case that is rare and reversible.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=messages.LOGIN_REJECT_BUTTON,
                    callback_data=LoginAction(session_id=session_id).pack(),
                )
            ]
        ]
    )


MenuActionName = Literal["unlink", "unlink_confirm", "unlink_cancel"]


class MenuAction(CallbackData, prefix="menu"):
    """Presses that belong to the menu itself rather than to an order.

    Only unlinking needs one so far: it is the single destructive thing in here, and a
    button is easier to hit by accident than a typed `/unlink` ever was — so it asks
    first, and the question and the answer both travel as callbacks.
    """

    action: MenuActionName


CHECKOUT_PATH = "/checkout"
WISHLIST_PATH = "/wishlist"
CATALOG_PATH = "/catalog"
ORDERS_PATH = "/orders"
ADMIN_ORDERS_PATH = "/admin/orders"


def help_actions() -> InlineKeyboardMarkup:
    """Under the help text: the site, and the way out of the binding.

    Unlink lives here rather than in the menu on purpose — it is used once, if ever,
    and a permanent button for it would sit next to «Корзина» being mistyped.
    """
    rows = [
        [
            InlineKeyboardButton(
                text=messages.UNLINK_BUTTON,
                callback_data=MenuAction(action="unlink").pack(),
            )
        ]
    ]
    site = _site_button(path="", text=messages.SITE_BUTTON)
    if site is not None:
        rows.insert(0, [site])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def unlink_confirm() -> InlineKeyboardMarkup:
    """Yes/no on unlinking. "Оставить как есть" first — the harmless answer is the one
    a thumb lands on when the message is read too fast."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=messages.UNLINK_KEEP_BUTTON,
                    callback_data=MenuAction(action="unlink_cancel").pack(),
                ),
                InlineKeyboardButton(
                    text=messages.UNLINK_CONFIRM_BUTTON,
                    callback_data=MenuAction(action="unlink_confirm").pack(),
                ),
            ]
        ]
    )


def catalog_link() -> InlineKeyboardMarkup | None:
    """Under an empty cart — the only useful thing to do about one."""
    return _site_link(CATALOG_PATH, messages.CATALOG_BUTTON)


def orders_link() -> InlineKeyboardMarkup | None:
    """Under the order list, which the bot deliberately truncates to five."""
    return _site_link(ORDERS_PATH, messages.ORDERS_BUTTON)


def site_link() -> InlineKeyboardMarkup | None:
    """The site itself — under the «Сайт» reply, and wherever there is nowhere more
    specific to point."""
    return _site_link("", messages.SITE_BUTTON)


def site_url() -> str:
    """The address in words, for when Telegram won't take the button (`_is_public_url`)."""
    return settings.website_base_url.rstrip("/")


def admin_orders_link() -> InlineKeyboardMarkup | None:
    """Under the owner's summaries: the tally is read in the chat, worked through here."""
    return _site_link(ADMIN_ORDERS_PATH, messages.ADMIN_ORDERS_BUTTON)


def checkout_link() -> InlineKeyboardMarkup | None:
    """A link straight to checkout under the cart reminder — or nothing, if the site
    isn't publicly addressable.

    The reminder exists to be acted on, and "go find the site yourself" is most of the
    friction between reading it and checking out.
    """
    return _site_link(CHECKOUT_PATH, messages.CHECKOUT_BUTTON)


def wishlist_link() -> InlineKeyboardMarkup | None:
    """Under "your cart moved to the wishlist" — the one thing to do about that news."""
    return _site_link(WISHLIST_PATH, messages.WISHLIST_BUTTON)


def mini_app_url() -> str | None:
    """Where the Mini App button opens, or None when the site can't be one.

    Stricter than a url button: Telegram opens a Mini App inside its own webview and
    requires HTTPS for it, so plain http — which is what local development runs on —
    is not merely unlinkable but unopenable. The catalog rather than the home page:
    a Mini App is entered to shop, and the landing is a step on the way there.
    """
    base = settings.website_base_url.rstrip("/")
    url = f"{base}{CATALOG_PATH}"
    if not _is_public_url(url) or not url.startswith("https://"):
        logger.info("WEBSITE_BASE_URL %r is not https; the Mini App button is not published", base)
        return None
    return url


def _site_link(path: str, text: str) -> InlineKeyboardMarkup | None:
    button = _site_button(path, text)
    if button is None:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def _site_button(path: str, text: str) -> InlineKeyboardButton | None:
    """One url button, or None when the configured site isn't publicly addressable.

    Split out of `_site_link` for the help keyboard, which mixes a link with a callback
    button in the same markup and so can't take a whole markup back.
    """
    base = settings.website_base_url.rstrip("/")
    url = f"{base}{path}"
    if not _is_public_url(url):
        # Once per sweep at most, and only in local dev — see _is_public_url.
        logger.debug("WEBSITE_BASE_URL %r is not linkable from Telegram; sending no button", base)
        return None

    return InlineKeyboardButton(text=text, url=url)


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
