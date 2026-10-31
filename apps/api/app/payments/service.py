import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import String, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.orders.models import PAYABLE_STATUSES, Order, OrderStatus
from app.payments.models import PaymentReceipt, ReceiptKind, ReceiptVerdict

# How far back the bot looks when it has to guess which order a receipt pays for. A
# receipt comes within days of the bill; an order billed in a cycle long gone and
# never paid is the owner's to chase, not a button under every new receipt.
RECEIPT_GUESS_WINDOW = timedelta(weeks=1)

# How many receipts one bill may have waiting for the owner at once. Every new file is a
# row and a message to each owner, and the bot's own throttle still lets through one a
# second — so without a ceiling a customer with a billed order could fill the owners'
# chats with photos for as long as they liked. Counted against what is still undecided,
# so the owner's verdict is what frees room: a real payment is a screenshot or two, a
# long PDF statement maybe a few pages more.
MAX_PENDING_RECEIPTS = 10


class ReceiptNotFoundError(Exception):
    """The receipt is gone — deleted together with its order."""


class OrderNotAwaitingPaymentError(Exception):
    """Not this customer's order, or not one that is waiting for money.

    One error for both, like `AuthSessionNotFoundError`: the bot has nothing different to
    say about them, and telling them apart would let a replayed callback probe for orders.
    """


class PaymentAlreadyAcceptedError(Exception):
    """A receipt rejected after the order was already marked paid."""


class TooManyPendingReceiptsError(Exception):
    """`MAX_PENDING_RECEIPTS` already wait for the owner on this bill."""


@dataclass(frozen=True)
class ReceiptFile:
    kind: ReceiptKind
    file_id: str
    file_unique_id: str


@dataclass(frozen=True)
class AddedReceipt:
    receipt: PaymentReceipt
    # False when the same file was already filed against this order and still waits for
    # the owner: nothing new to look at, and the customer is told so instead of being
    # thanked twice. A file already decided on, or sent against an earlier bill, counts
    # as new when sent again.
    created: bool


@dataclass(frozen=True)
class ReviewedReceipt:
    receipt: PaymentReceipt
    order: Order
    # False on a repeat press, or a second owner pressing the same thing: the customer
    # has already been told.
    changed: bool


class PaymentsService:
    """Receipts and the owner's verdict on them. Mutates, never commits."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def takes_payment(order: Order) -> bool:
        return order.status in PAYABLE_STATUSES and order.paid_at is None

    @staticmethod
    def for_current_bill(receipt: PaymentReceipt, order: Order) -> bool:
        """Whether the receipt was sent after the order's last confirmation.

        An order taken back to PENDING and confirmed again gets a fresh bill, possibly
        for a different sum, while its earlier receipts keep their rows — and their
        buttons in every owner's chat. Accepting one of those would mark the new bill
        paid with money sent against the old one. The same file sent again after the
        new bill counts, since `add_receipt` moves `submitted_at` when it reopens it.
        """
        return order.confirmed_at is not None and receipt.submitted_at >= order.confirmed_at

    async def awaiting_payment(self, user_id: uuid.UUID) -> list[Order]:
        """The orders a receipt sent with no order named may be for, newest first.

        Narrower than what `add_receipt` accepts: billed within
        `RECEIPT_GUESS_WINDOW`. A receipt that names its order — a reply to the bill or
        the prompt — is not limited by this.
        """
        result = await self._session.execute(
            select(Order)
            .where(
                Order.user_id == user_id,
                Order.status == OrderStatus.AWAITING_PAYMENT,
                Order.confirmed_at >= datetime.now(UTC) - RECEIPT_GUESS_WINDOW,
            )
            .order_by(Order.confirmed_at.desc())
        )
        return list(result.scalars().all())

    async def payable_order(self, user_id: uuid.UUID, order_id: uuid.UUID) -> Order | None:
        """This customer's order, if it still takes a receipt."""
        order = await self._session.get(Order, order_id, populate_existing=True)
        if order is None or order.user_id != user_id or not self.takes_payment(order):
            return None
        return order

    async def order_by_reference(self, user_id: uuid.UUID, reference: str) -> Order | None:
        """The customer's order behind a short reference (`messages.order_reference`,
        without the «#»), whatever its status; None when it names none or several."""
        result = await self._session.execute(
            select(Order).where(
                Order.user_id == user_id, cast(Order.id, String).startswith(reference)
            )
        )
        orders = result.scalars().all()
        return orders[0] if len(orders) == 1 else None

    async def add_receipt(
        self, user_id: uuid.UUID, order_id: uuid.UUID, file: ReceiptFile
    ) -> AddedReceipt:
        # populate_existing: the handler has usually loaded this order in the same session
        # already, and without it the lock would be taken but the stale status and
        # `paid_at` kept — a payment accepted in between would go unseen.
        order = await self._session.get(
            Order, order_id, with_for_update=True, populate_existing=True
        )
        if order is None or order.user_id != user_id or not self.takes_payment(order):
            raise OrderNotAwaitingPaymentError

        existing = await self._session.scalar(
            select(PaymentReceipt).where(
                PaymentReceipt.order_id == order_id,
                PaymentReceipt.file_unique_id == file.file_unique_id,
            )
        )
        if (
            existing is not None
            and existing.verdict is None
            and self.for_current_bill(existing, order)
        ):
            return AddedReceipt(receipt=existing, created=False)

        # Counted under the order's lock taken above, so the pages of an album, which
        # arrive together, are counted one after another rather than all against zero.
        if await self._pending_receipts(order) >= MAX_PENDING_RECEIPTS:
            raise TooManyPendingReceiptsError

        if existing is not None:
            # Already decided, yet the order is unpaid: the owner rejected the file, or
            # accepted it before the order went back to PENDING and lost its payment. Or
            # still undecided, but sent against the bill before that, so `review` refuses
            # it. Sent again, «уже у нас - сверяем» would promise a review nobody is going
            # to make. The unique constraint keeps it one row, so that row goes back.
            existing.verdict = None
            existing.reviewed_at = None
            existing.file_id = file.file_id
            existing.submitted_at = datetime.now(UTC)
            await self._session.flush()
            return AddedReceipt(receipt=existing, created=True)

        receipt = PaymentReceipt(
            order_id=order_id,
            kind=file.kind,
            file_id=file.file_id,
            file_unique_id=file.file_unique_id,
            # Set here rather than left to the server default: `for_current_bill` compares
            # it with `confirmed_at`, which comes from this same clock.
            submitted_at=datetime.now(UTC),
        )
        self._session.add(receipt)
        await self._session.flush()
        return AddedReceipt(receipt=receipt, created=True)

    async def _pending_receipts(self, order: Order) -> int:
        """Receipts for the order's current bill that the owner has not decided on."""
        query = (
            select(func.count())
            .select_from(PaymentReceipt)
            .where(PaymentReceipt.order_id == order.id, PaymentReceipt.verdict.is_(None))
        )
        if order.confirmed_at is not None:
            query = query.where(PaymentReceipt.submitted_at >= order.confirmed_at)
        return int(await self._session.scalar(query) or 0)

    async def review(self, receipt_id: uuid.UUID, *, accept: bool) -> ReviewedReceipt:
        """The owner's «Оплата получена» or «Чек не подходит».

        Accepting marks the order paid and moves it AWAITING_PAYMENT → CONFIRMED; rejecting
        only marks the receipt, so the customer can send another one. Either way the order
        has to still be one that takes money: a payment confirmed on an order the owner has
        since cancelled would promise goods nobody is going to hand over.
        """
        receipt = await self._session.get(PaymentReceipt, receipt_id)
        if receipt is None:
            raise ReceiptNotFoundError

        # Locked: two owners pressing at once must not both decide the same order.
        order = (
            await self._session.execute(
                select(Order)
                .options(selectinload(Order.items))
                .where(Order.id == receipt.order_id)
                .with_for_update(of=Order)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        if order.status not in PAYABLE_STATUSES and order.paid_at is None:
            raise OrderNotAwaitingPaymentError
        # Read again under the lock: it was loaded before the wait, and a second owner
        # rejecting the same receipt would otherwise see no verdict and tell the
        # customer twice.
        await self._session.refresh(receipt)
        if not self.for_current_bill(receipt, order):
            raise OrderNotAwaitingPaymentError

        now = datetime.now(UTC)
        if accept:
            if order.paid_at is not None:
                return ReviewedReceipt(receipt=receipt, order=order, changed=False)
            order.paid_at = now
            order.status = OrderStatus.CONFIRMED
            receipt.verdict = ReceiptVerdict.ACCEPTED
        else:
            if order.paid_at is not None:
                raise PaymentAlreadyAcceptedError
            if receipt.verdict is ReceiptVerdict.REJECTED:
                return ReviewedReceipt(receipt=receipt, order=order, changed=False)
            receipt.verdict = ReceiptVerdict.REJECTED
        receipt.reviewed_at = now
        await self._session.flush()
        return ReviewedReceipt(receipt=receipt, order=order, changed=True)

    async def orders_with_receipts(self, order_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
        """Which of these orders have a receipt waiting for the owner — for the admin
        table, which shows a paid order as paid whatever its receipts say.

        Only orders that still take payment, and only receipts for their current bill:
        one left undecided on an order cancelled or taken back to PENDING since is no
        longer the owner's to check, and `review` would refuse it anyway.
        """
        ids = list(order_ids)
        if not ids:
            return set()
        result = await self._session.execute(
            select(PaymentReceipt.order_id)
            .join(
                Order,
                and_(
                    Order.id == PaymentReceipt.order_id,
                    Order.status.in_(PAYABLE_STATUSES),
                    Order.paid_at.is_(None),
                    PaymentReceipt.submitted_at >= Order.confirmed_at,
                ),
            )
            .where(
                PaymentReceipt.order_id.in_(ids),
                PaymentReceipt.verdict.is_(None),
            )
            .distinct()
        )
        return set(result.scalars().all())
