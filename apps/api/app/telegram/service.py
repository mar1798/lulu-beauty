import asyncio
import enum
import logging
from dataclasses import dataclass
from datetime import datetime

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import InlineKeyboardMarkup

from app.auth.models import OtpPurpose, User
from app.cycles.models import OrderCycle
from app.orders.models import Order
from app.telegram import keyboards, messages

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
class BroadcastResult:
    """What a fan-out achieved, plus the bindings it proved dead.

    The chat ids come back rather than being cleaned up here: this service has no
    session, and deciding that a row should be written is not a transport concern.
    """

    sent: int
    blocked_chat_ids: list[int]


class NotificationsService:
    """Sends via Telegram when a chat is bound; otherwise falls back to console/log.

    The fallback keeps register/login/reminders usable in local dev without a live bot,
    and until a user has pressed Start + shared their contact.
    """

    def __init__(self, bot: Bot | None) -> None:
        self._bot = bot

    # ─── Point-to-point ──────────────────────────────────────────────────────────

    async def send_otp(self, user: User, code: str, purpose: OtpPurpose) -> None:
        if await self._try_send(user.telegram_chat_id, messages.otp(code, purpose)):
            logger.info("Sent %s OTP to %s via Telegram", purpose.value, user.phone)
            return
        logger.warning("%s; %s OTP: %s", self._fallback_reason(user), purpose.value, code)

    async def send_reminder(self, user: User, cycle_label: str, deadline_at: datetime) -> None:
        message = messages.cart_reminder(cycle_label, deadline_at)
        keyboard = keyboards.checkout_link()
        if await self._try_send(user.telegram_chat_id, message, reply_markup=keyboard):
            logger.info("Sent reminder for cycle %s to %s via Telegram", cycle_label, user.phone)
            return
        logger.warning("%s; reminder for %s not sent", self._fallback_reason(user), cycle_label)

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

    async def send_order_status(self, user: User, order: Order) -> None:
        message = messages.order_status_changed(order)
        if message is None:
            return
        if await self._try_send(user.telegram_chat_id, message):
            logger.info("Notified %s about order %s → %s", user.phone, order.id, order.status)
            return
        logger.warning(
            "%s; status %s of order %s not announced",
            self._fallback_reason(user),
            order.status,
            order.id,
        )

    async def send_cycle_closed(
        self, owner: User, cycle: OrderCycle, orders_count: int, total_cents: int
    ) -> None:
        message = messages.cycle_closed_for_owner(cycle, orders_count, total_cents)
        if await self._try_send(owner.telegram_chat_id, message):
            logger.info("Sent closing summary for cycle %s to owner %s", cycle.id, owner.phone)
            return
        logger.warning(
            "%s; closing summary for cycle %s not sent", self._fallback_reason(owner), cycle.id
        )

    # ─── Fan-out ─────────────────────────────────────────────────────────────────

    async def send_cycle_opened(
        self, users: list[User], cycle: OrderCycle
    ) -> BroadcastResult:
        return await self._broadcast(users, messages.cycle_opened(cycle))

    async def _broadcast(self, users: list[User], message: str) -> BroadcastResult:
        sent = 0
        blocked: list[int] = []

        for index, user in enumerate(users):
            if index:
                await asyncio.sleep(BROADCAST_DELAY_SECONDS)

            outcome = await self._deliver(user.telegram_chat_id, message)
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
        if self._bot is None or chat_id is None:
            return Delivery.NO_BINDING

        try:
            await self._bot.send_message(chat_id, message, reply_markup=reply_markup)
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
            return await self._deliver(
                chat_id, message, reply_markup=reply_markup, retry_on_flood=False
            )
        except Exception:  # noqa: BLE001 - delivery is best-effort; any failure falls back to the log
            logger.exception("Failed to send Telegram message to chat_id=%s", chat_id)
            return Delivery.FAILED
        return Delivery.SENT

    def _fallback_reason(self, user: User) -> str:
        if self._bot is None:
            return f"Telegram bot not configured (user {user.phone})"
        return f"No Telegram binding for {user.phone}"
