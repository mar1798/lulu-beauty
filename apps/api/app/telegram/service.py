import asyncio
import enum
import logging
import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import datetime

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import InlineKeyboardMarkup

from app.auth.models import User
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderStatus
from app.payments.models import PaymentReceipt, ReceiptKind
from app.telegram import keyboards, messages
from app.wanted.models import WantedProduct

logger = logging.getLogger("app.telegram")

# Telegram tolerates roughly 30 messages/second to distinct chats; 25 leaves headroom
# so a broadcast doesn't spend its time being throttled and retried.
BROADCAST_DELAY_SECONDS = 1 / 25


class Delivery(enum.Enum):
    SENT = "SENT"
    NO_BINDING = "NO_BINDING"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class CartRescueNotice:
    """One customer's share of a closed cycle's cart rescue, ready to be worded.

    Carries the counts rather than the `CartRescue` the sweep produced: importing that
    would point this module back at `cycles.scheduler_service`, which imports this one.
    """

    user: User
    saved: int
    dropped: int


@dataclass(frozen=True)
class BroadcastResult:
    """What a fan-out achieved, plus the bindings it proved dead.

    The chat ids come back rather than being cleaned up here: this service has no
    session, and deciding that a row should be written is not a transport concern.
    """

    sent: int
    blocked_chat_ids: list[int]


# Telegram's limit on one text message, counted in UTF-16 code units, not characters.
MAX_MESSAGE_LENGTH = 4096


def _telegram_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def split_message(text: str, limit: int = MAX_MESSAGE_LENGTH) -> list[str]:
    """`text` in as few messages as Telegram takes, cut between lines.

    A line longer than a whole message on its own is cut where it has to be; none of the
    texts here has one, but sending nothing at all would be the worse failure.
    """
    parts: list[str] = []
    current: list[str] = []
    length = 0
    for line in text.split("\n"):
        while _telegram_length(line) > limit:
            cut = limit
            while _telegram_length(line[:cut]) > limit:
                cut -= 1
            text_before, line = line[:cut], line[cut:]
            if current:
                parts.append("\n".join(current))
                current, length = [], 0
            parts.append(text_before)
        added = _telegram_length(line) + (1 if current else 0)
        if current and length + added > limit:
            parts.append("\n".join(current))
            current, length = [], 0
            added = _telegram_length(line)
        current.append(line)
        length += added
    if current:
        parts.append("\n".join(current))
    return parts


class NotificationsService:
    """Sends via Telegram when a chat is bound; otherwise logs why it could not.

    A binding is no longer optional — an account cannot come into existence without one
    (see `handle_contact`) — but it can die: the person blocks the bot, or deletes the
    chat. Then a notification has nowhere to go, and saying so in the log beats an
    exception from a background sweep.
    """

    def __init__(self, bot: Bot | None) -> None:
        self._bot = bot

    # ─── Point-to-point ──────────────────────────────────────────────────────────

    async def send_reminder(
        self, user: User, cycle: OrderCycle, *, last_chance: bool = False
    ) -> None:
        message = (
            messages.cart_last_chance(cycle) if last_chance else messages.cart_reminder(cycle)
        )
        keyboard = keyboards.checkout_link()
        # The log names the cycle the way `cycle_title` does — by its deadline when it has
        # no label — because an unnamed cycle in a log line identifies nothing.
        title = messages.cycle_title(cycle)
        if await self._try_send(user.telegram_chat_id, message, reply_markup=keyboard):
            logger.info("Sent reminder for cycle %s to %s via Telegram", title, user.phone)
            return
        logger.warning("%s; reminder for %s not sent", self._fallback_reason(user), title)

    async def send_new_order(
        self, owner: User, order: Order, customer: User | None, cycle: OrderCycle | None
    ) -> None:
        message = messages.new_order_for_owner(order, customer, cycle)
        # Confirm/cancel travel with the notification: the owner reads it on a phone, and
        # the alternative is opening the admin panel to press the same two buttons.
        keyboard = keyboards.order_actions(order.id)
        if await self._try_send(owner.telegram_chat_id, message, reply_markup=keyboard):
            logger.info("Notified owner %s about order %s", owner.phone, order.id)
            return
        logger.warning("%s; new order %s not announced", self._fallback_reason(owner), order.id)

    async def send_customer_cancellation(
        self, owner: User, order: Order, customer: User | None, *, restored: bool
    ) -> None:
        """The other direction from `send_order_status`: what the customer did, to the owner.

        Without buttons to act on, unlike a new order — there is nothing for the owner to
        confirm here, and a cancelled order is precisely the one whose «Подтвердить» must
        not be one tap away. The admin list is the only thing to offer.
        """
        message = messages.customer_cancellation_for_owner(order, customer, restored=restored)
        if await self._try_send(
            owner.telegram_chat_id, message, reply_markup=keyboards.admin_orders_link()
        ):
            logger.info(
                "Notified owner %s that order %s was %s by its customer",
                owner.phone,
                order.id,
                "restored" if restored else "cancelled",
            )
            return
        logger.warning(
            "%s; the customer's own change to order %s not announced",
            self._fallback_reason(owner),
            order.id,
        )

    async def send_order_status(
        self, user: User, order: Order, *, first_cycle: bool = False
    ) -> None:
        # Always unpaid here: going back to PENDING clears `paid_at`, and only PENDING
        # leads to CONFIRMED.
        if order.status is OrderStatus.CONFIRMED:
            await self._send_bill(user, order, first_cycle=first_cycle)
            return

        message = messages.order_status_changed(order)
        if message is None:
            return
        # With the link: a status change is precisely the reason to open the list, and
        # without a button that means going to find the site by hand. The owner's own
        # cancellation also asks the customer to write if it is a mistake, so that one
        # carries the address the text promises.
        keyboard = (
            keyboards.owner_contact_actions()
            if order.status is OrderStatus.CANCELLED_BY_OWNER
            else keyboards.orders_link()
        )
        if await self._try_send(user.telegram_chat_id, message, reply_markup=keyboard):
            logger.info("Notified %s about order %s → %s", user.phone, order.id, order.status)
            return
        logger.warning(
            "%s; status %s of order %s not announced",
            self._fallback_reason(user),
            order.status,
            order.id,
        )

    async def _send_bill(self, user: User, order: Order, *, first_cycle: bool) -> None:
        """Confirmation is where the customer is asked to pay, so it carries the bill and
        the button that sends the receipt back.

        Every line is listed, so a big order outgrows one message: the bill then goes out
        in parts, with the button under the last — next to the total and the requisites.
        """
        parts = split_message(messages.order_confirmed(order, first_cycle=first_cycle))
        for index, part in enumerate(parts):
            last = index == len(parts) - 1
            keyboard = keyboards.receipt_actions(order.id) if last else None
            if not await self._try_send(user.telegram_chat_id, part, reply_markup=keyboard):
                logger.warning(
                    "%s; bill for order %s not sent (part %d of %d)",
                    self._fallback_reason(user),
                    order.id,
                    index + 1,
                    len(parts),
                )
                return
        logger.info("Sent the bill for order %s to %s", order.id, user.phone)

    async def send_receipt(
        self, owner: User, receipt: PaymentReceipt, order: Order, customer: User | None
    ) -> None:
        """The customer's receipt, re-sent by `file_id` with the order under it.

        Sent rather than forwarded: a forward carries no buttons, and a customer with
        forwarding privacy on would arrive as a name with no link anyway.
        """
        caption = messages.receipt_for_owner(order, customer)
        keyboard = keyboards.payment_actions(receipt.id)

        async def send(bot: Bot, chat_id: int) -> object:
            if receipt.kind is ReceiptKind.PHOTO:
                return await bot.send_photo(
                    chat_id, receipt.file_id, caption=caption, reply_markup=keyboard
                )
            return await bot.send_document(
                chat_id, receipt.file_id, caption=caption, reply_markup=keyboard
            )

        if await self._attempt(owner.telegram_chat_id, send) is Delivery.SENT:
            logger.info("Sent receipt %s for order %s to %s", receipt.id, order.id, owner.phone)
            return
        logger.warning(
            "%s; receipt %s for order %s not delivered",
            self._fallback_reason(owner),
            receipt.id,
            order.id,
        )

    async def send_payment_reviewed(self, user: User, order: Order, *, accepted: bool) -> None:
        if accepted:
            message = messages.payment_accepted(order)
            keyboard = keyboards.orders_link()
        else:
            # The text sends them to the owner if the receipt was right after all.
            message = messages.payment_rejected(order)
            keyboard = keyboards.owner_contact_actions()
        if await self._try_send(user.telegram_chat_id, message, reply_markup=keyboard):
            logger.info(
                "Told %s the payment for order %s was %s",
                user.phone,
                order.id,
                "accepted" if accepted else "rejected",
            )
            return
        logger.warning(
            "%s; payment verdict on order %s not announced", self._fallback_reason(user), order.id
        )

    async def send_order_deleted(
        self, user: User, order_id: uuid.UUID, status: OrderStatus
    ) -> None:
        """Takes the id and the last status, not an Order: the row is already gone."""
        message = messages.order_deleted(order_id, status)
        if message is None:
            return
        # Not `orders_link` like a status change: the message asks the customer to write
        # to the owner, and Instagram is the only place they can. The keyboard carries
        # both — the list, and the address the text promises.
        if await self._try_send(
            user.telegram_chat_id, message, reply_markup=keyboards.owner_contact_actions()
        ):
            logger.info("Notified %s that order %s was deleted", user.phone, order_id)
            return
        logger.warning(
            "%s; deletion of order %s not announced", self._fallback_reason(user), order_id
        )

    async def send_account_deleted(self, owner: User, order_ids: Sequence[uuid.UUID]) -> None:
        """A customer erased their account; these orders left the purchase list with them.

        The admin link, like every other piece of news about orders the owner has to act
        on — here it is the only thing offered, since there is no customer left to contact
        about it.
        """
        message = messages.account_deleted_for_owner(order_ids)
        if await self._try_send(
            owner.telegram_chat_id, message, reply_markup=keyboards.admin_orders_link()
        ):
            logger.info(
                "Notified owner %s that an erased account withdrew %d orders",
                owner.phone,
                len(order_ids),
            )
            return
        logger.warning(
            "%s; an erased account's %d withdrawn orders not announced",
            self._fallback_reason(owner),
            len(order_ids),
        )

    async def send_wanted_product(self, owner: User, wanted: WantedProduct) -> None:
        """A wish for something the catalog does not have, on its way to the owner.

        Without a keyboard, and it is the only owner-facing notice here that has none:
        there is no row in the panel to open and nothing to confirm. What it asks for is
        done in the next import, or in a reply to the number in the message.
        """
        message = messages.wanted_product_for_owner(wanted)
        if await self._try_send(owner.telegram_chat_id, message):
            logger.info("Notified owner %s about wish %s", owner.phone, wanted.id)
            return
        logger.warning("%s; wish %s not passed on", self._fallback_reason(owner), wanted.id)

    async def send_cycle_closed(
        self, owner: User, cycle: OrderCycle, orders_count: int, total_cents: int
    ) -> None:
        message = messages.cycle_closed_for_owner(cycle, orders_count, total_cents)
        # The tally is read in the chat and worked through in the admin panel.
        if await self._try_send(
            owner.telegram_chat_id, message, reply_markup=keyboards.admin_orders_link()
        ):
            logger.info("Sent closing summary for cycle %s to owner %s", cycle.id, owner.phone)
            return
        logger.warning(
            "%s; closing summary for cycle %s not sent", self._fallback_reason(owner), cycle.id
        )

    async def send_stale_orders(self, owner: User, cycle: OrderCycle, count: int) -> bool:
        """The nudge about a closed cycle nobody finished answering.

        Carries the same button as the closing tally: what it asks for is done in the
        orders panel, and the owner reads this on a phone.

        Reports whether it arrived, unlike its neighbours here: the caller stamps the
        cycle on the strength of that answer, and a stamp is what stops this nudge from
        ever being sent again.
        """
        message = messages.stale_orders_for_owner(cycle, count)
        if await self._try_send(
            owner.telegram_chat_id, message, reply_markup=keyboards.admin_orders_link()
        ):
            logger.info(
                "Nudged owner %s about %d unanswered order(s) in cycle %s",
                owner.phone,
                count,
                cycle.id,
            )
            return True
        logger.warning(
            "%s; stale-order nudge for cycle %s not sent", self._fallback_reason(owner), cycle.id
        )
        return False

    # ─── Fan-out ─────────────────────────────────────────────────────────────────

    async def send_cycle_opened(self, users: list[User], cycle: OrderCycle) -> BroadcastResult:
        """The one announcement that exists to be acted on: the catalog is taking orders
        right now, and the button saves the whole way from "oh, it's open" to a cart."""
        message = messages.cycle_opened(cycle)
        return await self._broadcast(
            [(user, message) for user in users], reply_markup=keyboards.catalog_link()
        )

    async def send_cycle_deadline_changed(
        self, users: Sequence[User], cycle: OrderCycle, previous_deadline_at: datetime
    ) -> BroadcastResult:
        """Tells the people already in a cycle that its deadline moved.

        A fan-out rather than point-to-point for the same reason as the reminder: it goes
        to everyone holding a cart or an order in that cycle at once. The button is
        checkout, because a moved deadline is only ever acted on in one place.
        """
        message = messages.cycle_deadline_changed(cycle, previous_deadline_at)
        return await self._broadcast(
            [(user, message) for user in users], reply_markup=keyboards.checkout_link()
        )

    async def send_cycle_closed_for_customers(
        self, users: Sequence[User], cycle: OrderCycle
    ) -> BroadcastResult:
        """The closing, to the customers who did place an order in the cycle.

        The ones who left a cart instead hear about the same event from
        `send_cart_rescued`, which has more to tell them; these people would otherwise
        learn that the cycle ended only by finding the edit buttons gone.
        """
        message = messages.cycle_closed_for_customer(cycle)
        return await self._broadcast(
            [(user, message) for user in users], reply_markup=keyboards.orders_link()
        )

    async def broadcast_reminder(self, users: Sequence[User], message: str) -> BroadcastResult:
        """The deadline nudge, fanned out under the same throttle as any other broadcast.

        Kept apart from `send_reminder` (which is one message, to one person, and reports
        through the log) because a sweep-driven reminder goes to a whole cycle's worth of
        abandoned carts at once and has to be paced and to report dead bindings back.
        """
        return await self._broadcast(
            [(user, message) for user in users], reply_markup=keyboards.checkout_link()
        )

    async def send_cart_rescued(
        self, notices: Sequence[CartRescueNotice], cycle_title: str
    ) -> BroadcastResult:
        """A fan-out of *different* texts: each customer is told about their own cart.

        Same throttle and the same dead-binding bookkeeping as the shop-wide broadcast —
        this goes out to everyone who abandoned a cart in the closing cycle at once, so
        the counts differ but the rate limit does not.
        """
        keyboard = keyboards.wishlist_link()
        return await self._broadcast(
            [
                (
                    notice.user,
                    messages.cart_moved_to_wishlist(cycle_title, notice.saved, notice.dropped),
                )
                for notice in notices
            ],
            reply_markup=keyboard,
        )

    async def send_order_notices(self, deliveries: Sequence[tuple[User, str]]) -> BroadcastResult:
        """Per-order news to whoever it concerns — one text each, one catalog edit behind.

        A fan-out rather than a loop of `_try_send`: repricing or discontinuing a popular
        product touches every pending order that holds it at once, which is broadcast
        volume even though each message is personal. Texts arrive ready-made, like
        `broadcast_reminder`'s — deciding what to say about an order is not a transport
        concern.
        """
        return await self._broadcast(deliveries, reply_markup=keyboards.orders_link())

    async def _broadcast(
        self,
        deliveries: Sequence[tuple[User, str]],
        *,
        reply_markup: InlineKeyboardMarkup | None = None,
    ) -> BroadcastResult:
        sent = 0
        blocked: list[int] = []

        for index, (user, message) in enumerate(deliveries):
            if index:
                await asyncio.sleep(BROADCAST_DELAY_SECONDS)

            outcome = await self._deliver(user.telegram_chat_id, message, reply_markup=reply_markup)
            if outcome is Delivery.SENT:
                sent += 1
            elif outcome is Delivery.BLOCKED and user.telegram_chat_id is not None:
                blocked.append(user.telegram_chat_id)

        return BroadcastResult(sent=sent, blocked_chat_ids=blocked)

    # ─── Delivery ────────────────────────────────────────────────────────────────

    async def _try_send(
        self, chat_id: int | None, message: str, *, reply_markup: InlineKeyboardMarkup | None = None
    ) -> bool:
        return await self._deliver(chat_id, message, reply_markup=reply_markup) is Delivery.SENT

    async def _deliver(
        self,
        chat_id: int | None,
        message: str,
        *,
        reply_markup: InlineKeyboardMarkup | None = None,
        retry_on_flood: bool = True,
    ) -> Delivery:
        async def send(bot: Bot, chat_id: int) -> object:
            return await bot.send_message(chat_id, message, reply_markup=reply_markup)

        return await self._attempt(chat_id, send, retry_on_flood=retry_on_flood)

    async def _attempt(
        self,
        chat_id: int | None,
        send: Callable[[Bot, int], Awaitable[object]],
        *,
        retry_on_flood: bool = True,
    ) -> Delivery:
        """One delivery of anything — a text, a photo, a document — with the same
        failure handling for all of them."""
        if self._bot is None or chat_id is None:
            return Delivery.NO_BINDING

        try:
            await send(self._bot, chat_id)
        except TelegramForbiddenError:
            # The user blocked the bot or deleted the chat. Nothing to retry — the
            # binding itself is dead, and the caller is expected to drop it.
            logger.info("Telegram chat %s unreachable (blocked); binding is stale", chat_id)
            return Delivery.BLOCKED
        except TelegramRetryAfter as error:
            if not retry_on_flood:
                logger.warning("Still rate-limited on chat_id=%s; giving up", chat_id)
                return Delivery.FAILED
            # Telegram states exactly how long to wait, and one retry clears the bursts
            # that cause this. Anything past that is the broadcast's problem, not ours.
            await asyncio.sleep(error.retry_after)
            return await self._attempt(chat_id, send, retry_on_flood=False)
        except Exception:  # noqa: BLE001 - delivery is best-effort; any failure falls back to the log
            logger.exception("Failed to send Telegram message to chat_id=%s", chat_id)
            return Delivery.FAILED
        return Delivery.SENT

    def _fallback_reason(self, user: User) -> str:
        if self._bot is None:
            return f"Telegram bot not configured (user {user.phone})"
        return f"No Telegram binding for {user.phone}"
