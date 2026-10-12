"""Everything the bot answers to.

Registered on a Router rather than straight onto the Dispatcher so that `bot.py` can own
the bot instance and the polling lifecycle without this module importing it back.

Each handler opens its own short-lived session, the way the scheduler jobs do: these run
outside any request, so there is no session to inherit.

**Buttons first, commands as aliases.** Everything reachable here is reachable by tapping
a label on the persistent menu (`keyboards.main_menu`); the slash commands that used to
be the only way in still work — people who learned them shouldn't find them gone — but
they are no longer published or explained. Hence the `or_f(Command(...), F.text == ...)`
on every handler: one behaviour, two ways to trigger it, and no chance of the tap and the
command drifting apart into two implementations.
"""

import logging
import math
import re
import time
import uuid
from collections import OrderedDict
from datetime import UTC, datetime

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart, or_f
from aiogram.types import (
    CallbackQuery,
    ForceReply,
    InlineKeyboardMarkup,
    Message,
    ReplyKeyboardRemove,
)
from aiogram.types import User as TelegramUser
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import ADMIN_ROLES, User
from app.auth.service import AuthService
from app.auth.telegram_login import TelegramLoginService
from app.cart.schemas import CartResponse
from app.cart.service import CartService
from app.common.phone import normalize_phone
from app.cycles.service import CyclesService
from app.db import async_session
from app.orders.models import OPEN_STATUSES
from app.orders.service import OrderNotFoundError, OrdersService, StatusTransitionError
from app.payments.models import ReceiptKind
from app.payments.service import (
    AddedReceipt,
    OrderNotAwaitingPaymentError,
    PaymentAlreadyAcceptedError,
    PaymentsService,
    ReceiptFile,
    ReceiptNotFoundError,
)
from app.telegram import keyboards, messages, recipients
from app.telegram.client import notifications_service
from app.telegram.concurrency import ConcurrencyLimitMiddleware
from app.telegram.keyboards import (
    LoginAction,
    MenuAction,
    OrderAction,
    PaymentAction,
    ReceiptAction,
    ReceiptOrderChoice,
    ReplyAction,
)
from app.telegram.notify import (
    notify_order_status,
    notify_payment_reviewed,
    notify_receipt_received,
)
from app.telegram.service import Delivery
from app.telegram.throttling import ThrottlingMiddleware
from app.wishlist.service import WishlistService

logger = logging.getLogger("app.telegram.bot")

router = Router()

# Outer, so a throttled update is dropped before any filter looks at it — and registered
# here rather than in `bot.py` because everything else assumes that importing this module
# yields a router that is ready to serve. Both update types the bot subscribes to are
# covered: the callbacks write, so leaving them out would guard the cheaper half only.
#
# One instance for both, not two: separate middlewares would keep separate buckets, and
# the limit a person actually gets would be twice the one written down.
throttling = ThrottlingMiddleware()
router.message.outer_middleware(throttling)
router.callback_query.outer_middleware(throttling)
# After the throttle, so a dropped update never waits for a slot; one instance for both
# update types for the same reason as the throttle — two would mean twice the slots.
concurrency = ConcurrencyLimitMiddleware()
router.message.outer_middleware(concurrency)
router.callback_query.outer_middleware(concurrency)

# Telegram guarantees a first name and nothing else; the last name is optional and the
# username is not a name at all. Falls back to the phone-less placeholder rather than an
# empty string, which would render as a blank line in the owner's order list.
DEFAULT_NAME = "Покупатель"


def _profile_name(from_user: TelegramUser | None) -> str:
    if from_user is None:
        return DEFAULT_NAME
    parts = [from_user.first_name, from_user.last_name or ""]
    name = " ".join(part for part in parts if part).strip()
    return name or DEFAULT_NAME


@router.message(CommandStart())
async def handle_start(message: Message, command: CommandObject) -> None:
    """Entry point for signing in: the site's link lands here as "/start <payload>".

    CommandStart() rather than an exact text match, precisely because of that payload —
    an exact match on "/start" would drop every login link into the fallback handler.

    Two paths, and which one applies is not the person's business to know: a chat that
    is already bound is a sign-in (nothing to ask), a chat that is not is a sign-up, and
    the only visible difference is one extra tap on "share my number".
    """
    payload = (command.args or "").strip()

    async with async_session() as session:
        auth = TelegramLoginService(session)
        # Attached before we know whether an account exists: if the contact has to be
        # shared first, that message arrives separately and finds its way back by chat id.
        auth_session = await auth.attach_chat(payload, message.chat.id) if payload else None
        user = await recipients.find_user_by_chat_id(session, message.chat.id)

        if user is not None and auth_session is not None:
            await auth.authorize(auth_session, user)
            await session.commit()
            authorized_at = auth_session.authorized_at or datetime.now(UTC)
            session_id = auth_session.id
            await message.answer(messages.LOGIN_CONFIRMED, reply_markup=keyboards.main_menu())
            # A second message, because the first one carries the reply keyboard and a
            # message has room for only one markup. It is also the only warning there is:
            # the tab that gets let in is whichever one produced the link, not necessarily
            # the one in front of the person tapping it.
            await message.answer(
                messages.login_alert(authorized_at),
                reply_markup=keyboards.login_reject(session_id),
            )
            return

        await session.commit()

    if user is not None:
        # Bound already and no login waiting — /start typed out of habit, not a dead end.
        # Answered with the menu rather than a bare line: the likeliest reason someone
        # types /start into a linked chat is that they lost the keyboard.
        await message.answer(messages.ALREADY_LINKED, reply_markup=keyboards.main_menu())
        return

    await message.answer(messages.START, reply_markup=keyboards.share_contact())
    # Split for the same reason as the login warning above: one markup per message, and
    # the greeting spends it on the reply keyboard with «Поделиться номером». The consent
    # goes second on purpose — last before the input field, right over the button it is
    # about, and still before the tap that creates the account.
    await message.answer(messages.CONSENT, reply_markup=keyboards.privacy_link())


@router.message(F.contact)
async def handle_contact(message: Message) -> None:
    """Binds this chat to the phone number of whoever shared it — and only them.

    This is also where accounts are born: there is no registration form anywhere, so a
    shared contact either finds an account by phone or creates one, taking the name from
    the Telegram profile (the person can change it later in their profile on the site).

    The share-contact button sends the person's own number, but nothing stops them from
    attaching any card out of their address book to the same chat, and Telegram delivers
    both as a plain `contact`. Binding on that number alone would hand the sender the
    account behind it — anyone's, for the price of having their number in your phone.
    `contact.user_id` is filled in by Telegram, not by the client, so it is the one part
    of the payload that says whose card this actually is.
    """
    if message.contact is None:
        return

    if message.from_user is None or message.contact.user_id != message.from_user.id:
        # Keyboard stays: the share button is exactly what they should press next.
        await message.answer(messages.FOREIGN_CONTACT, reply_markup=keyboards.share_contact())
        return

    phone = normalize_phone(message.contact.phone_number)
    chat_id = message.chat.id

    async with async_session() as session:
        # Before binding, not after: both chat_id columns are UNIQUE, and this same chat
        # may already be bound to a different number (see recipients.release_chat).
        await recipients.release_chat(session, chat_id)

        user = await recipients.find_user_by_phone(session, phone)
        if user is None:
            user = User(phone=phone, name=_profile_name(message.from_user))
            session.add(user)
        user.telegram_chat_id = chat_id
        await session.flush()

        # The /start that opened the login came in an earlier message; this is the point
        # where it finally has an account to point at.
        auth = TelegramLoginService(session)
        auth_session = await auth.find_pending_for_chat(chat_id)
        if auth_session is not None:
            await auth.authorize(auth_session, user)

        await session.commit()
        login = auth_session

    await message.answer(
        messages.LOGIN_CONFIRMED if login is not None else messages.LINKED,
        reply_markup=keyboards.main_menu(),
    )

    if login is not None:
        # The same warning `handle_start` sends, and for the same reason: this branch is
        # a sign-in too, just one that had to create the account on the way. Leaving it
        # out meant the person whose very first login was opened from somebody else's
        # forwarded link — the likeliest victim of all, since they have never seen the
        # bot before — was the one with no way to take it back.
        await message.answer(
            messages.login_alert(login.authorized_at or datetime.now(UTC)),
            reply_markup=keyboards.login_reject(login.id),
        )


async def _linked_user(message: Message, session: AsyncSession) -> User | None:
    """The account behind this chat, or None after telling the person there isn't one.

    The reply carries the share-contact keyboard, not an instruction to send /start:
    an unlinked chat has exactly one thing to do next, and it should be a button.
    """
    user = await recipients.find_user_by_chat_id(session, message.chat.id)
    if user is None:
        await message.answer(messages.NOT_LINKED, reply_markup=keyboards.share_contact())
    return user


@router.message(Command("menu"))
async def handle_menu(message: Message) -> None:
    """Puts the keyboard back.

    The one thing a menu made of buttons needs that a menu made of commands didn't: a
    reply keyboard can be collapsed from the client, and then the bot looks mute. This
    is the published way back, and `handle_fallback` is the accidental one — any stray
    text restores the menu too, because someone whose keyboard is gone types words.
    """
    await message.answer(messages.MENU_PROMPT, reply_markup=keyboards.main_menu())


@router.message(or_f(Command("help"), F.text == messages.MENU_HELP))
async def handle_help(message: Message) -> None:
    """The help screen, which is also where unlinking lives (see keyboards.help_actions)."""
    await message.answer(messages.HELP, reply_markup=keyboards.help_actions())


@router.message(or_f(Command("orders"), F.text == messages.MENU_ORDERS))
async def handle_orders(message: Message) -> None:
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        # Only the page the message shows: the bot never listed more than
        # MAX_LISTED_ORDERS, and `total` is what the "…и ещё N" line needs.
        #
        # OPEN_STATUSES because five lines is not a history: someone who has ordered in
        # every cycle for a year has the five newest all finished, and the one order they
        # are actually waiting on ends up hidden behind "…и ещё N". Cancelled and handed
        # over orders are still on the site, which is what the button underneath is for.
        orders, total = await OrdersService(session).list_for_user(
            user.id, page=1, page_size=messages.MAX_LISTED_ORDERS, statuses=OPEN_STATUSES
        )
        # Only asked for when there are no orders: the button under an empty list is an
        # invitation to make one, and inviting into a catalog that can't take an order
        # (no cycle open) is the same mistake `_cart_actions` avoids.
        cycle = None if orders else await CyclesService(session).get_active_cycle()

    # "Все заявки на сайте" only when there is a list to be a truncation of — under
    # "у вас пока нет заявок" it would point at the same nothing.
    await message.answer(
        messages.my_orders(orders, total),
        reply_markup=keyboards.orders_link()
        if orders
        else (keyboards.catalog_link() if cycle is not None else None),
    )


@router.message(or_f(Command("cart"), F.text == messages.MENU_CART))
async def handle_cart(message: Message) -> None:
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        cart = await CartService(session).get_cart(user.id)

    await message.answer(messages.my_cart(cart), reply_markup=_cart_actions(cart))


def _cart_actions(cart: CartResponse) -> InlineKeyboardMarkup | None:
    """Which button a cart deserves — and the empty-with-no-cycle case deserves none.

    Same distinction `messages.my_cart` draws between its two empties: with no cycle
    open there is nothing to add to, so «Открыть каталог» would lead to a catalog that
    can't take the order anyway.
    """
    if cart.items:
        return keyboards.checkout_link()
    if cart.cycle_deadline_at is None:
        return None
    return keyboards.catalog_link()


@router.message(Command("wishlist"))
async def handle_wishlist(message: Message) -> None:
    """Saved products. New with the menu: the sweep has been moving abandoned carts into
    the wishlist for a while, and until now the bot could only mention it, never show it.

    Typed only: its menu button gave way to «Ссылки», and the site shows the same list.
    """
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        wishlist = await WishlistService(session).get_wishlist(user.id)

    await message.answer(
        messages.my_wishlist(wishlist),
        reply_markup=keyboards.wishlist_link() if wishlist.items else keyboards.catalog_link(),
    )


@router.message(or_f(Command("deadline"), F.text == messages.MENU_DEADLINE))
async def handle_deadline(message: Message) -> None:
    # Deliberately open to unlinked chats: when the next cycle closes is public
    # information, and it's the one question worth answering before linking.
    async with async_session() as session:
        cycle = await CyclesService(session).get_active_cycle()

    # An open cycle is an invitation, not a fact: a deadline with no way into the catalog
    # leaves someone holding a date and nothing to do about it. Between cycles the
    # catalog is still worth opening — saving to the wishlist works with no cycle at all —
    # but the wording there is about the shop, not about ordering, so the button is too.
    await message.answer(
        messages.current_deadline(cycle),
        reply_markup=keyboards.catalog_link() if cycle is not None else keyboards.site_link(),
    )


@router.message(or_f(Command("links"), Command("site"), F.text == messages.MENU_LINKS))
async def handle_links(message: Message) -> None:
    """Both ways out of the chat — the shop and the Instagram — and deliberately a whole
    reply rather than keyboard buttons, because a reply keyboard cannot carry a url and
    an inline one cannot stay.

    `/site` still answers next to `/links`: it is what the button used to be called, it
    is published nowhere (`BOT_COMMANDS` lists only /menu and /help), and keeping it
    costs one filter against a chat where someone typed it once out of habit.

    Open to unlinked chats too: the storefront is public, and asking for a phone number
    first would be a step in front of the one action that needs no account at all.
    """
    keyboard = keyboards.site_links()
    if not keyboards.site_is_linkable():
        # Telegram refuses a button pointing at a non-addressable host (local dev) — and
        # refuses the whole message, not just the button. The Instagram button survives
        # that (its host is public either way), so only the shop moves into the text.
        await message.answer(
            messages.site_unavailable(keyboards.site_url()), reply_markup=keyboard
        )
        return

    await message.answer(messages.LINKS_PROMPT, reply_markup=keyboard)


@router.message(F.text == messages.MENU_REPLY)
async def handle_reply_menu(message: Message) -> None:
    """«✍️ Написать Sululu» in the menu: asks for the message, as a ForceReply.

    Whatever the customer sends next is a reply to the prompt, and `handle_customer_reply`
    passes it to the owner — so a plain text typed into the chat stays the fallback's,
    and only what was meant for the shop reaches it. No order named: from the menu the
    customer writes to the shop in general.
    """
    async with async_session() as session:
        if await _linked_user(message, session) is None:
            return
    await _ask_for_reply(message, None)


async def _ask_for_reply(message: Message, order_id: uuid.UUID | None) -> None:
    await message.answer(
        messages.reply_prompt(order_id),
        reply_markup=ForceReply(input_field_placeholder=messages.REPLY_PLACEHOLDER),
    )


@router.message(Command("unlink"))
async def handle_unlink(message: Message) -> None:
    """The typed alias for the button on the help screen — it asks the same question.

    Kept because it was documented for a while, but it no longer unlinks on the spot:
    two paths to one destructive action must not differ in whether they confirm.
    """
    async with async_session() as session:
        if await _linked_user(message, session) is None:
            return

    await message.answer(messages.UNLINK_CONFIRM, reply_markup=keyboards.unlink_confirm())


@router.callback_query(MenuAction.filter())
async def handle_menu_action(query: CallbackQuery, callback_data: MenuAction) -> None:
    """Unlinking, in two steps — the ask and the answer.

    A chat_id is UNIQUE, so a binding left on the wrong account doesn't just send
    notifications to a stranger: it also blocks that chat from ever linking to a new
    number. Which is why there is a way out at all, and why it is behind a question.
    """
    origin = query.message if isinstance(query.message, Message) else None

    if callback_data.action == "unlink":
        await query.answer()
        if origin is not None:
            await origin.answer(messages.UNLINK_CONFIRM, reply_markup=keyboards.unlink_confirm())
        return

    if callback_data.action == "unlink_cancel":
        await query.answer(messages.UNLINK_KEPT)
        if origin is not None:
            # Drops the buttons with the edit: a question that has been answered must
            # stop offering both answers.
            await origin.edit_text(messages.UNLINK_KEPT)
        return

    async with async_session() as session:
        # from_user, same as the order buttons: the binding belongs to whoever pressed,
        # and in the private chat where a binding is made the two ids are identical.
        chat_id = query.from_user.id
        if await recipients.find_user_by_chat_id(session, chat_id) is None:
            await query.answer(messages.CALLBACK_NOT_LINKED, show_alert=True)
            return
        await recipients.release_chat(session, chat_id)
        await session.commit()

    await query.answer()
    if origin is not None:
        await origin.edit_text(messages.UNLINKED)
        # The keyboard belongs to the chat rather than to the message, so it survives
        # the edit and has to be taken down by a message of its own.
        await origin.answer(messages.UNLINK_NEXT, reply_markup=ReplyKeyboardRemove())


@router.callback_query(LoginAction.filter())
async def handle_login_action(query: CallbackQuery, callback_data: LoginAction) -> None:
    """«Это не я» under the login confirmation: close the sign-in and every session with it.

    Both halves matter. Spending the auth session stops a tab that is still polling from
    ever being let in; revoking the refresh tokens ends the ones that already were. What
    cannot be taken back is an access token already issued — those are stateless and run
    out on their own within `JWT_ACCESS_TTL_SECONDS`.
    """
    async with async_session() as session:
        auth = TelegramLoginService(session)
        # from_user rather than chat, like the other callbacks: the binding and the login
        # both belong to whoever pressed, and in a private chat the two ids are the same.
        user_id = await auth.reject(callback_data.session_id, query.from_user.id)
        if user_id is None:
            await query.answer(messages.CALLBACK_LOGIN_GONE, show_alert=True)
            return

        await AuthService(session).revoke_all_for_user(user_id)
        await session.commit()

    await query.answer()
    if isinstance(query.message, Message):
        # Rewriting drops the button: an offer that has been taken must stop standing.
        await query.message.edit_text(messages.LOGIN_REJECTED)


@router.callback_query(OrderAction.filter())
async def handle_order_action(query: CallbackQuery, callback_data: OrderAction) -> None:
    """The owner confirming or cancelling an order straight from the notification.

    Every branch answers the query. An unanswered callback leaves the client spinning on
    the button for half a minute, which reads as the bot having died — so "you may not do
    this" and "it worked" are equally worth a reply.
    """
    new_status = keyboards.ACTION_STATUS[callback_data.action]

    async with async_session() as session:
        # from_user, not chat: the chat is only where the message happens to sit, while
        # from_user is who pressed. For the private chat an owner binds via /start the
        # two ids are the same, and a button that leaks into a group stays inert.
        actor = await recipients.find_user_by_chat_id(session, query.from_user.id)
        if actor is None or actor.role not in ADMIN_ROLES:
            await query.answer(messages.CALLBACK_NOT_FOR_YOU, show_alert=True)
            return

        try:
            order, changed = await OrdersService(session).update_status(
                callback_data.order_id, new_status
            )
        except OrderNotFoundError:
            # The owner deleted it from the admin panel and the notification outlived it.
            await query.answer(messages.CALLBACK_ORDER_GONE, show_alert=True)
            return
        except StatusTransitionError:
            # The order moved on (or was withdrawn) since the notification was sent —
            # the button is a week-old snapshot of a decision that is no longer open.
            await query.answer(messages.CALLBACK_ORDER_MOVED_ON, show_alert=True)
            return

        await session.commit()
        order_id = order.id

    await query.answer(messages.callback_applied(new_status))

    if isinstance(query.message, Message):
        # Rewriting the text drops the keyboard with it: left in place, the message would
        # keep offering both actions as though nothing had been decided.
        #
        # Swallowed on failure, because the status change is already committed and the
        # customer's notification is still to come: Telegram refuses to edit a message
        # older than 48 hours (and answers "message is not modified" on a repeat press),
        # and letting that escape meant a stale button in the owner's chat cost the
        # customer the only word they get about their order.
        text = query.message.text or ""
        try:
            await query.message.edit_text(f"{text}\n\n{messages.order_resolution(new_status)}")
        except Exception:  # noqa: BLE001 - cosmetic; the notification below is not
            logger.exception("Failed to rewrite the order notification for %s", order_id)

    if changed:
        # Same customer-facing notification the admin panel triggers — pressing the button
        # here has to mean exactly what pressing it there means.
        await notify_order_status(order_id)


# Telegram sends an album as one message per file, each carrying the same
# `media_group_id`. Every file is filed and forwarded, but the customer is thanked once
# per album, not once per page. In memory, like `notify._announcing`: losing it to a
# restart costs at most a repeated «спасибо».
_MAX_REMEMBERED_ALBUMS = 256
_acknowledged_albums: OrderedDict[str, None] = OrderedDict()


def _first_of_album(message: Message) -> bool:
    album = message.media_group_id
    if album is None:
        return True
    if album in _acknowledged_albums:
        return False
    _acknowledged_albums[album] = None
    if len(_acknowledged_albums) > _MAX_REMEMBERED_ALBUMS:
        _acknowledged_albums.popitem(last=False)
    return True


def _receipt_file(message: Message) -> ReceiptFile | None:
    """The receipt in a message, or None when what it carries can't be one.

    A photo comes in several sizes, smallest first; the owner needs to read the digits,
    so the largest. A document has to be a PDF or a picture sent "as a file" — anything
    else is not something the owner can check against a bank transfer.
    """
    if message.photo:
        photo = message.photo[-1]
        return ReceiptFile(ReceiptKind.PHOTO, photo.file_id, photo.file_unique_id)
    document = message.document
    if document is None:
        return None
    mime = document.mime_type or ""
    if mime != "application/pdf" and not mime.startswith("image/"):
        return None
    return ReceiptFile(ReceiptKind.DOCUMENT, document.file_id, document.file_unique_id)


async def _file_receipt(
    session: AsyncSession, user: User, order_id: uuid.UUID, file: ReceiptFile
) -> AddedReceipt | None:
    """Files the receipt and commits; None when the order stopped taking payment."""
    try:
        added = await PaymentsService(session).add_receipt(user.id, order_id, file)
    except OrderNotAwaitingPaymentError:
        return None
    await session.commit()
    return added


async def _acknowledge(message: Message, added: AddedReceipt, *, first_of_album: bool) -> None:
    order_id = added.receipt.order_id
    # With the menu: the receipt prompt's ForceReply takes the place of the reply
    # keyboard, and this is the first message after it to hand the buttons back.
    if not added.created:
        await message.answer(
            messages.receipt_duplicate(order_id), reply_markup=keyboards.main_menu()
        )
    elif first_of_album:
        await message.answer(
            messages.receipt_received(order_id), reply_markup=keyboards.main_menu()
        )
    if added.created:
        await notify_receipt_received(added.receipt.id)


@router.callback_query(ReceiptAction.filter())
async def handle_receipt_prompt(query: CallbackQuery, callback_data: ReceiptAction) -> None:
    """«📎 Отправить чек»: says what to send, as a ForceReply.

    The customer's client then sends the file as a reply to this prompt, and the prompt
    names the order — so `handle_receipt` knows which one without asking and without
    anything remembered here, which a restart between the tap and the photo would lose.
    """
    # Checked here as well as on arrival: a bill keeps its button after the order was
    # paid or cancelled, and asking for a file only to refuse it would waste a photo.
    async with async_session() as session:
        user = await recipients.find_user_by_chat_id(session, query.from_user.id)
        order = (
            await PaymentsService(session).payable_order(user.id, callback_data.order_id)
            if user is not None
            else None
        )
    if order is None:
        await query.answer(messages.CALLBACK_RECEIPT_NOT_AWAITED, show_alert=True)
        return

    await query.answer()
    if isinstance(query.message, Message):
        await query.message.answer(
            messages.receipt_prompt(callback_data.order_id),
            reply_markup=ForceReply(input_field_placeholder=messages.RECEIPT_PLACEHOLDER),
        )


# `messages.order_reference`: «#» and the first eight hex digits of the order's UUID.
_ORDER_REFERENCE = re.compile(r"#([0-9a-f]{8})(?![0-9a-f])")


def _reference_replied_to(message: Message) -> str | None:
    """The order a receipt names, when it is a reply to one of the bot's messages that
    names exactly one — the receipt prompt, or the bill itself."""
    replied = message.reply_to_message
    if replied is None or replied.from_user is None or not replied.from_user.is_bot:
        return None
    references = set(_ORDER_REFERENCE.findall(replied.text or replied.caption or ""))
    return references.pop() if len(references) == 1 else None


@router.callback_query(ReplyAction.filter())
async def handle_reply_button(query: CallbackQuery, callback_data: ReplyAction) -> None:
    """«✍️ Ответить» under the owner's message: the same prompt as the menu's, naming
    the order, so the answer arrives at the owner with its number."""
    async with async_session() as session:
        user = await recipients.find_user_by_chat_id(session, query.from_user.id)
    if user is None:
        await query.answer(messages.NOT_LINKED, show_alert=True)
        return

    await query.answer()
    if isinstance(query.message, Message):
        await _ask_for_reply(query.message, callback_data.order_id)


# The customer's phone on the second line of `messages.customer_reply_for_owner`, or of
# `messages.wanted_product_for_owner`.
_CUSTOMER_PHONE = re.compile(r"^(?:Покупатель|От кого): .*, (\+\d+)$", re.MULTILINE)


@router.message(
    F.reply_to_message.from_user.is_bot
    & (
        F.reply_to_message.text.startswith(messages.OWNER_REPLYABLE_TITLES)
        | F.reply_to_message.caption.startswith(messages.OWNER_REPLYABLE_TITLES)
    )
)
async def handle_owner_reply(message: Message) -> None:
    """The owner answering, by a reply in the chat, a customer's message passed on to them
    — or a wish for the next cycle (`messages.wanted_product_for_owner`).

    The obvious thing to do with «💬 Ответ покупателя», and before this it got «не понял».
    Nothing remembers whose message that was: the header names the customer by phone and
    the order by number, the way the receipt prompt names its order — no state for a
    restart to lose. Registered before `handle_customer_reply` and `handle_receipt`, so
    an owner's photo in reply is passed on rather than filed as a receipt.
    """
    replied = message.reply_to_message
    header = (replied.text or replied.caption or "") if replied is not None else ""
    phone = _CUSTOMER_PHONE.search(header)
    # The title line only: the customer's own words below it may hold a «#…» too.
    reference = _ORDER_REFERENCE.search(header.split("\n", 1)[0])
    wish = header.startswith(messages.WANTED_PRODUCT_TITLE)

    async with async_session() as session:
        owner = await _linked_user(message, session)
        if owner is None:
            return
        if owner.role not in ADMIN_ROLES:
            # Only owners receive these headers; anyone else quoting one is just typing.
            await message.answer(messages.FALLBACK, reply_markup=keyboards.main_menu())
            return
        customer = (
            await recipients.find_user_by_phone(session, phone.group(1))
            if phone is not None
            else None
        )
        order = (
            await PaymentsService(session).order_by_reference(customer.id, reference.group(1))
            if customer is not None and reference is not None
            else None
        )

    if customer is None or customer.telegram_chat_id is None:
        if wish and phone is not None:
            # The writer unlinked the bot, or the wish predates the sign-in requirement
            # and its number was typed by a guest: either way, a call still reaches them.
            await message.answer(messages.owner_reply_wish_unreachable(phone.group(1)))
        else:
            await message.answer(messages.OWNER_REPLY_CUSTOMER_GONE)
        return

    chat_id = customer.telegram_chat_id
    first = _first_of_album(message)
    outcome = await notifications_service.send_owner_reply(
        customer,
        reference.group(0) if reference is not None else None,
        order.id if order is not None else None,
        message,
        with_header=first,
        wish=wish,
    )
    if outcome is Delivery.BLOCKED:
        # The same answer every broadcast acts on: the binding is dead, so drop it.
        async with async_session() as session:
            await recipients.clear_stale_bindings(session, [chat_id])
            await session.commit()
        await message.answer(messages.OWNER_REPLY_BLOCKED)
    elif outcome is not Delivery.SENT:
        await message.answer(messages.OWNER_REPLY_FAILED)
    elif first:
        await message.answer(messages.OWNER_REPLY_SENT)


@router.message(
    F.reply_to_message.from_user.is_bot
    & (
        F.reply_to_message.text.startswith(messages.CUSTOMER_REPLY_HEADERS)
        # The owner's photo or voice note, with the header in its caption.
        | F.reply_to_message.caption.startswith(messages.CUSTOMER_REPLY_HEADERS)
    )
)
async def handle_customer_reply(message: Message) -> None:
    """The customer writing to the shop: a reply to the owner's own message
    (`messages.owner_message`) or to the «Ответить» prompt (`messages.reply_prompt`).

    Only a reply, never plain text typed into the chat — that one gets the fallback,
    which says how to do this instead. It goes to every owner, whatever it is — text,
    photo, voice.

    Except a receipt: a photo or a file for an order still waiting for money is what
    `handle_receipt` exists for, and passing it on as chat would leave it unfiled and
    the owner without the accept/reject buttons.
    """
    replied = message.reply_to_message
    header = (replied.text or replied.caption or "") if replied is not None else ""
    # The first line only: the owner's own words below it may hold a «#…» too.
    match = _ORDER_REFERENCE.search(header.split("\n", 1)[0])
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        payments = PaymentsService(session)
        order = (
            await payments.order_by_reference(user.id, match.group(1))
            if match is not None
            else None
        )
        is_receipt = (
            (message.photo is not None or message.document is not None)
            and order is not None
            and payments.takes_payment(order)
        )
        owners = [] if is_receipt else await recipients.get_owners(session)

    if is_receipt:
        await handle_receipt(message)
        return

    now = _clock()
    continues_album = _continues_shop_album(message)
    wait = 0 if continues_album else _shop_message_wait(message.chat.id, now)
    if wait > 0:
        await message.answer(
            messages.shop_message_too_soon(int(SHOP_MESSAGE_INTERVAL_SECONDS), wait),
            reply_markup=keyboards.main_menu(),
        )
        return
    if not continues_album:
        # Taken before the send, not after: an album's photos arrive together and are
        # handled concurrently, and the second has to find the first's mark already set.
        _remember_shop_message(message, now)

    reference = match.group(0) if match is not None else None
    delivered = False
    for owner in owners:
        if await notifications_service.send_customer_reply(owner, user, reference, message):
            delivered = True
    if not delivered:
        if not continues_album:
            # Nothing reached the shop, so nothing to wait out before trying again.
            _last_shop_message.pop(message.chat.id, None)
        await message.answer(
            messages.CUSTOMER_REPLY_NOT_DELIVERED, reply_markup=keyboards.main_menu()
        )
        return
    if continues_album:
        # The album's first photo was acknowledged already; one «передал» per message.
        return
    await message.answer(messages.CUSTOMER_REPLY_FORWARDED, reply_markup=keyboards.main_menu())


# One message for the shop per customer per this long. The owner reads them by hand, and
# without a limit a held-down send key fills every owner's chat — the bot's own throttle
# (`throttling.py`) allows a message a second, which is a lot of them to scroll past.
# Counted from the last one sent on, so a refused or undelivered message costs nothing.
SHOP_MESSAGE_INTERVAL_SECONDS = 30.0

# chat id → when its last message reached the shop, and the album it started, if any.
# In memory, like the throttle: a restart forgets it, which at worst lets one message
# through early. Bounded, since chat ids are unbounded input from outside.
_last_shop_message: OrderedDict[int, tuple[float, str | None]] = OrderedDict()
_MAX_REMEMBERED_SENDERS = 1000
# A seam for the tests, which cannot patch `time.monotonic` without stopping asyncio too.
_clock = time.monotonic


def _shop_message_wait(chat_id: int, now: float) -> int:
    """Whole seconds before this chat may write to the shop again; 0 when it may."""
    last = _last_shop_message.get(chat_id)
    if last is None:
        return 0
    left = SHOP_MESSAGE_INTERVAL_SECONDS - (now - last[0])
    return math.ceil(left) if left > 0 else 0


def _continues_shop_album(message: Message) -> bool:
    """A later photo of an album whose first one already went to the shop.

    An album arrives as one message per photo, seconds apart at most; the customer sent
    it as one, so it is let through whole rather than refused from its second photo on.
    """
    last = _last_shop_message.get(message.chat.id)
    return (
        last is not None
        and message.media_group_id is not None
        and last[1] == message.media_group_id
    )


def _remember_shop_message(message: Message, now: float) -> None:
    _last_shop_message[message.chat.id] = (now, message.media_group_id)
    _last_shop_message.move_to_end(message.chat.id)
    if len(_last_shop_message) > _MAX_REMEMBERED_SENDERS:
        _last_shop_message.popitem(last=False)


@router.message(F.photo | F.document)
async def handle_receipt(message: Message) -> None:
    """A photo or a file sent to the bot: taken to be a payment receipt.

    Which order it pays for is decided here rather than remembered from a button press:
    a reply to the prompt or the bill names it; otherwise one recently confirmed order
    waiting for money takes it, several get asked about, none gets told so.
    """
    file = _receipt_file(message)
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        if file is None:
            await message.answer(messages.RECEIPT_UNSUPPORTED)
            return

        payments = PaymentsService(session)
        reference = _reference_replied_to(message)
        named = (
            await payments.order_by_reference(user.id, reference) if reference is not None else None
        )
        if named is not None and not payments.takes_payment(named):
            # A reply to the bill of an order paid or cancelled since: the customer meant
            # that one, and guessing another in its place would file the money wrongly.
            await message.answer(messages.CALLBACK_RECEIPT_NOT_AWAITED)
            return
        orders = [named] if named is not None else await payments.awaiting_payment(user.id)
        if len(orders) > 1:
            # A reply, so the answer to the question can find the file again: Telegram
            # sends the replied-to message back along with the callback.
            await message.reply(
                messages.RECEIPT_WHICH_ORDER,
                reply_markup=keyboards.receipt_order_choice(orders),
            )
            return
        added = await _file_receipt(session, user, orders[0].id, file) if orders else None

    if added is None:
        await message.answer(messages.RECEIPT_NOTHING_AWAITING)
        return
    await _acknowledge(message, added, first_of_album=_first_of_album(message))


@router.callback_query(ReceiptOrderChoice.filter())
async def handle_receipt_choice(query: CallbackQuery, callback_data: ReceiptOrderChoice) -> None:
    """The answer to «за какую заявку этот чек?» — the file is the message it replied to."""
    question = query.message if isinstance(query.message, Message) else None
    source = question.reply_to_message if question is not None else None
    file = _receipt_file(source) if source is not None else None
    if question is None or file is None:
        await query.answer(messages.CALLBACK_RECEIPT_FILE_GONE, show_alert=True)
        return

    async with async_session() as session:
        user = await recipients.find_user_by_chat_id(session, query.from_user.id)
        added = (
            await _file_receipt(session, user, callback_data.order_id, file)
            if user is not None
            else None
        )
    if added is None:
        await query.answer(messages.CALLBACK_RECEIPT_NOT_AWAITED, show_alert=True)
        return

    await query.answer()
    try:
        # Drops the buttons: the question has been answered.
        await question.edit_text(messages.receipt_filed(callback_data.order_id))
    except Exception:  # noqa: BLE001 - cosmetic; the receipt is filed either way
        logger.exception("Failed to close the receipt question for %s", callback_data.order_id)
    await _acknowledge(question, added, first_of_album=True)


@router.callback_query(PaymentAction.filter())
async def handle_payment_action(query: CallbackQuery, callback_data: PaymentAction) -> None:
    """The owner's verdict on a receipt, from under the receipt itself.

    Shaped like `handle_order_action`: the role is checked on the presser, every branch
    answers the query, and the customer hears about it only after the commit.
    """
    accept = callback_data.action == "accept"

    async with async_session() as session:
        actor = await recipients.find_user_by_chat_id(session, query.from_user.id)
        if actor is None or actor.role not in ADMIN_ROLES:
            await query.answer(messages.CALLBACK_NOT_FOR_YOU, show_alert=True)
            return

        try:
            reviewed = await PaymentsService(session).review(
                callback_data.receipt_id, accept=accept
            )
        except ReceiptNotFoundError:
            await query.answer(messages.CALLBACK_ORDER_GONE, show_alert=True)
            return
        except OrderNotAwaitingPaymentError:
            await query.answer(messages.CALLBACK_ORDER_MOVED_ON, show_alert=True)
            return
        except PaymentAlreadyAcceptedError:
            await query.answer(messages.CALLBACK_PAYMENT_ALREADY_ACCEPTED, show_alert=True)
            return

        await session.commit()
        order_id = reviewed.order.id
        changed = reviewed.changed

    if accept and not changed:
        await query.answer(messages.CALLBACK_PAYMENT_ALREADY_ACCEPTED)
    elif not changed:
        # Rejected already, and the customer was told then: «покупатель получит
        # сообщение» would promise a second message that is not coming.
        await query.answer(messages.payment_resolution(accepted=False))
    else:
        await query.answer(
            messages.CALLBACK_PAYMENT_ACCEPTED if accept else messages.CALLBACK_RECEIPT_REJECTED
        )

    if isinstance(query.message, Message):
        # Same reasoning as in `handle_order_action`: the edit drops the buttons, and a
        # failure to make it must not cost the customer their notification.
        caption = query.message.caption or ""
        try:
            await query.message.edit_caption(
                caption=f"{caption}\n\n{messages.payment_resolution(accepted=accept)}"
            )
        except Exception:  # noqa: BLE001 - cosmetic; the notification below is not
            logger.exception("Failed to rewrite the receipt message for order %s", order_id)

    if changed:
        await notify_payment_reviewed(order_id, accepted=accept)


@router.message()
async def handle_fallback(message: Message) -> None:
    """Anything that isn't a button or a command — answered with the buttons.

    Typing at a bot that is driven by taps almost always means the keyboard isn't
    showing (collapsed, or a chat opened from a notification), so the useful reply is
    the menu itself rather than a sentence about it.
    """
    logger.info(
        "Unhandled message: content_type=%s has_contact=%s text=%r",
        message.content_type,
        message.contact is not None,
        message.text,
    )

    # Costs a lookup, and earns it: offering the menu to a chat that has no account
    # behind it is offering five buttons that all answer "вы не привязаны". The
    # unlinked chat gets the one button that works instead.
    async with async_session() as session:
        if await _linked_user(message, session) is None:
            return

    await message.answer(messages.FALLBACK, reply_markup=keyboards.main_menu())
