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

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart, or_f
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message, ReplyKeyboardRemove
from aiogram.types import User as TelegramUser
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.auth.telegram_login import TelegramLoginService
from app.cart.schemas import CartResponse
from app.cart.service import CartService
from app.common.phone import normalize_phone
from app.cycles.service import CyclesService
from app.db import async_session
from app.orders.service import OrderNotFoundError, OrdersService
from app.telegram import keyboards, messages, recipients
from app.telegram.keyboards import MenuAction, OrderAction
from app.telegram.notify import notify_order_status
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
            await message.answer(messages.LOGIN_CONFIRMED, reply_markup=keyboards.main_menu())
            return

        await session.commit()

    if user is not None:
        # Bound already and no login waiting — /start typed out of habit, not a dead end.
        # Answered with the menu rather than a bare line: the likeliest reason someone
        # types /start into a linked chat is that they lost the keyboard.
        await message.answer(messages.ALREADY_LINKED, reply_markup=keyboards.main_menu())
        return

    await message.answer(messages.START, reply_markup=keyboards.share_contact())


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
        is_login = auth_session is not None

    await message.answer(
        messages.LOGIN_CONFIRMED if is_login else messages.LINKED,
        reply_markup=keyboards.main_menu(),
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
        orders, total = await OrdersService(session).list_for_user(
            user.id, page=1, page_size=messages.MAX_LISTED_ORDERS
        )

    # The link only when there is a list to be a truncation of — under "у вас пока нет
    # заявок" a button promising the full list would be pointing at the same nothing.
    await message.answer(
        messages.my_orders(orders, total),
        reply_markup=keyboards.orders_link() if orders else None,
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


@router.message(or_f(Command("wishlist"), F.text == messages.MENU_WISHLIST))
async def handle_wishlist(message: Message) -> None:
    """Saved products. New with the menu: the sweep has been moving abandoned carts into
    the wishlist for a while, and until now the bot could only mention it, never show it.
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

    await message.answer(messages.current_deadline(cycle))


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
        if actor is None or actor.role is not Role.ADMIN:
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

        await session.commit()
        order_id = order.id

    await query.answer(messages.callback_applied(new_status))

    if isinstance(query.message, Message):
        # Rewriting the text drops the keyboard with it: left in place, the message would
        # keep offering both actions as though nothing had been decided.
        text = query.message.text or ""
        await query.message.edit_text(f"{text}\n\n{messages.order_resolution(new_status)}")

    if changed:
        # Same customer-facing notification the admin panel triggers — pressing the button
        # here has to mean exactly what pressing it there means.
        await notify_order_status(order_id)


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
