"""Everything the bot answers to.

Registered on a Router rather than straight onto the Dispatcher so that `bot.py` can own
the bot instance and the polling lifecycle without this module importing it back.

Each handler opens its own short-lived session, the way the scheduler jobs do: these run
outside any request, so there is no session to inherit.
"""

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.cart.service import CartService
from app.common.phone import normalize_phone
from app.cycles.service import CyclesService
from app.db import async_session
from app.orders.service import OrderNotFoundError, OrdersService
from app.telegram import keyboards, messages, recipients
from app.telegram.keyboards import OrderAction
from app.telegram.models import PendingTelegramContact
from app.telegram.notify import notify_order_status

logger = logging.getLogger("app.telegram.bot")

router = Router()


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    """CommandStart() rather than an exact text match on "/start".

    A deep link (t.me/<bot>?start=<payload>) sends "/start <payload>", which an exact
    match drops into the fallback: the person gets a reply with no share-contact button
    and no way forward. Nothing generates such links today, but the failure is silent.
    """
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=messages.SHARE_CONTACT_BUTTON, request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(messages.START, reply_markup=keyboard)


@router.message(F.contact)
async def handle_contact(message: Message) -> None:
    """Binds this chat to the phone number of whoever shared it — and only them.

    The share-contact button sends the person's own number, but nothing stops them from
    attaching any card out of their address book to the same chat, and Telegram delivers
    both as a plain `contact`. Binding on that number alone would hand the sender every
    OTP issued for it — i.e. anyone's account, for the price of having their number in
    your phone. `contact.user_id` is filled in by Telegram, not by the client, so it is
    the one part of the payload that says whose card this actually is.
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
        if user is not None:
            user.telegram_chat_id = chat_id
        else:
            # release_chat above only cleared rows for *this* chat; a pending row for
            # this phone left by some other chat is still there and must be re-pointed.
            result = await session.execute(
                select(PendingTelegramContact).where(PendingTelegramContact.phone == phone)
            )
            pending = result.scalar_one_or_none()
            if pending is not None:
                pending.chat_id = chat_id
            else:
                session.add(PendingTelegramContact(phone=phone, chat_id=chat_id))

        await session.commit()

    await message.answer(messages.LINKED, reply_markup=ReplyKeyboardRemove())


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
