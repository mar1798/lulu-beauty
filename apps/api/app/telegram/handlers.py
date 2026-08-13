"""Everything the bot answers to.

Registered on a Router rather than straight onto the Dispatcher so that `bot.py` can own
the bot instance and the polling lifecycle without this module importing it back.

Each handler opens its own short-lived session, the way the scheduler jobs do: these run
outside any request, so there is no session to inherit.
"""

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from aiogram.types import User as TelegramUser
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.auth.telegram_login import TelegramLoginService
from app.cart.service import CartService
from app.common.phone import normalize_phone
from app.cycles.service import CyclesService
from app.db import async_session
from app.orders.service import OrderNotFoundError, OrdersService
from app.telegram import keyboards, messages, recipients
from app.telegram.keyboards import OrderAction
from app.telegram.notify import notify_order_status

logger = logging.getLogger("app.telegram.bot")

router = Router()

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


def _share_contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=messages.SHARE_CONTACT_BUTTON, request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


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
            await message.answer(messages.LOGIN_CONFIRMED, reply_markup=ReplyKeyboardRemove())
            return

        await session.commit()

    if user is not None:
        # Bound already and no login waiting — /start typed out of habit, not a dead end.
        await message.answer(messages.ALREADY_LINKED, reply_markup=ReplyKeyboardRemove())
        return

    await message.answer(messages.START, reply_markup=_share_contact_keyboard())


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
        await message.answer(messages.FOREIGN_CONTACT, reply_markup=ReplyKeyboardRemove())
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
        reply_markup=ReplyKeyboardRemove(),
    )


async def _linked_user(message: Message, session: AsyncSession) -> User | None:
    """The account behind this chat, or None after telling the person there isn't one."""
    user = await recipients.find_user_by_chat_id(session, message.chat.id)
    if user is None:
        await message.answer(messages.NOT_LINKED)
    return user


@router.message(Command("help"))
async def handle_help(message: Message) -> None:
    await message.answer(messages.HELP)


@router.message(Command("orders"))
async def handle_orders(message: Message) -> None:
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        orders = await OrdersService(session).list_for_user(user.id)

    await message.answer(messages.my_orders(orders))


@router.message(Command("cart"))
async def handle_cart(message: Message) -> None:
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        cart = await CartService(session).get_cart(user.id)

    await message.answer(messages.my_cart(cart))


@router.message(Command("deadline"))
async def handle_deadline(message: Message) -> None:
    # Deliberately open to unlinked chats: when the next cycle closes is public
    # information, and it's the one question worth answering before linking.
    async with async_session() as session:
        cycle = await CyclesService(session).get_active_cycle()

    await message.answer(messages.current_deadline(cycle))


@router.message(Command("unlink"))
async def handle_unlink(message: Message) -> None:
    """Undoes the binding. Until now there was no way out of one at all.

    A chat_id is UNIQUE, so a stale binding didn't just deliver codes to the wrong
    account — it also blocked that chat from ever linking to a new number.
    """
    async with async_session() as session:
        user = await _linked_user(message, session)
        if user is None:
            return
        await recipients.release_chat(session, message.chat.id)
        await session.commit()

    await message.answer(messages.UNLINKED, reply_markup=ReplyKeyboardRemove())


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
    logger.info(
        "Unhandled message: content_type=%s has_contact=%s text=%r",
        message.content_type,
        message.contact is not None,
        message.text,
    )
    await message.answer(messages.FALLBACK)
