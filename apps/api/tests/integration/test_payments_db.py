import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.types import Message
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Role, User
from app.db import async_session
from app.orders.models import Order, OrderItem, OrderStatus
from app.orders.service import OrdersService
from app.payments.models import PaymentReceipt, ReceiptKind, ReceiptVerdict
from app.payments.service import (
    MAX_PENDING_RECEIPTS,
    OrderNotAwaitingPaymentError,
    PaymentAlreadyAcceptedError,
    PaymentsService,
    ReceiptFile,
)
from app.telegram import handlers, messages
from app.telegram.handlers import (
    handle_payment_action,
    handle_receipt,
    handle_receipt_choice,
    handle_receipt_prompt,
)
from app.telegram.keyboards import PaymentAction, ReceiptAction, ReceiptOrderChoice
from app.telegram.notify import _is_first_cycle
from tests.integration.factories import make_cycle, make_user

CUSTOMER_CHAT = 777
OWNER_CHAT = 555


@pytest.fixture
def bot_session(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
    @asynccontextmanager
    async def factory() -> AsyncIterator[AsyncSession]:
        yield db_session

    monkeypatch.setattr("app.telegram.handlers.async_session", factory)
    return db_session


@pytest.fixture
def forwarded(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Handing the receipt to the owners opens its own session and talks to Telegram;
    here only the fact that it was triggered is under test."""
    notify = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.notify_receipt_received", notify)
    return notify


@pytest.fixture
def verdicts(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    notify = AsyncMock()
    monkeypatch.setattr("app.telegram.handlers.notify_payment_reviewed", notify)
    return notify


async def _customer(session: AsyncSession) -> User:
    return await make_user(session, phone="+996700333444", telegram_chat_id=CUSTOMER_CHAT)


async def _order(
    session: AsyncSession,
    customer: User,
    status: OrderStatus = OrderStatus.CONFIRMED,
    *,
    confirmed_ago: timedelta = timedelta(hours=1),
) -> Order:
    cycle = await make_cycle(session)
    order = Order(
        user_id=customer.id,
        cycle_id=cycle.id,
        status=status,
        total_cents=421_000,
        confirmed_at=datetime.now(UTC) - confirmed_ago,
    )
    session.add(order)
    await session.flush()
    return order


def _photo_message(unique_id: str = "U1", *, album: str | None = None) -> MagicMock:
    message = MagicMock(spec=Message)
    message.chat = MagicMock()
    message.chat.id = CUSTOMER_CHAT
    small, large = MagicMock(), MagicMock()
    small.file_id, small.file_unique_id = "small", "small-u"
    large.file_id, large.file_unique_id = "large", unique_id
    message.photo = [small, large]
    message.document = None
    message.media_group_id = album
    message.reply_to_message = None
    message.answer = AsyncMock()
    message.reply = AsyncMock()
    return message


def _pdf_message(mime: str = "application/pdf") -> MagicMock:
    message = _photo_message()
    message.photo = None
    message.document = MagicMock()
    message.document.mime_type = mime
    message.document.file_id = "doc"
    message.document.file_unique_id = "doc-u"
    return message


async def _receipts(session: AsyncSession) -> list[PaymentReceipt]:
    return list((await session.scalars(select(PaymentReceipt))).all())


async def test_a_photo_is_filed_against_the_one_order_awaiting_payment(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    await bot_session.commit()

    message = _photo_message()
    await handle_receipt(message)

    (receipt,) = await _receipts(bot_session)
    assert (receipt.order_id, receipt.kind, receipt.file_id) == (
        order.id,
        ReceiptKind.PHOTO,
        "large",
    )
    message.answer.assert_awaited_once()
    assert message.answer.await_args.args[0] == messages.receipt_received(order.id)
    forwarded.assert_awaited_once_with(receipt.id)


async def test_a_pdf_is_a_receipt_and_any_other_file_is_not(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    await bot_session.commit()

    await handle_receipt(_pdf_message())
    other = _pdf_message("application/zip")
    await handle_receipt(other)

    (receipt,) = await _receipts(bot_session)
    assert receipt.kind is ReceiptKind.DOCUMENT
    other.answer.assert_awaited_once_with(messages.RECEIPT_UNSUPPORTED)


async def test_the_same_file_twice_is_one_receipt(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    await bot_session.commit()

    await handle_receipt(_photo_message())
    again = _photo_message()
    await handle_receipt(again)

    assert len(await _receipts(bot_session)) == 1
    again.answer.assert_awaited_once()
    assert again.answer.await_args.args[0] == messages.receipt_duplicate(order.id)
    forwarded.assert_awaited_once()


async def test_a_rejected_file_sent_again_goes_back_to_the_owner(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    await bot_session.commit()

    await handle_receipt(_photo_message())
    (receipt,) = await _receipts(bot_session)
    await PaymentsService(bot_session).review(receipt.id, accept=False)
    await bot_session.commit()

    again = _photo_message()
    await handle_receipt(again)

    (receipt,) = await _receipts(bot_session)
    await bot_session.refresh(receipt)
    assert (receipt.verdict, receipt.reviewed_at) == (None, None)
    again.answer.assert_awaited_once()
    assert again.answer.await_args.args[0] == messages.receipt_received(order.id)
    assert forwarded.await_count == 2
    assert await PaymentsService(bot_session).orders_with_receipts([order.id]) == {order.id}


async def test_an_album_is_filed_page_by_page_and_thanked_for_once(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    await bot_session.commit()

    album = str(uuid.uuid4())
    first, second = _photo_message("P1", album=album), _photo_message("P2", album=album)
    await handle_receipt(first)
    await handle_receipt(second)

    assert len(await _receipts(bot_session)) == 2
    assert forwarded.await_count == 2
    first.answer.assert_awaited_once()
    second.answer.assert_not_awaited()


async def test_receipts_past_the_ceiling_wait_for_the_owners_verdict(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """Every new file is a row and a message to each owner: the owner's verdict, not the
    customer's patience, is what makes room for more."""
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    await bot_session.commit()
    for index in range(MAX_PENDING_RECEIPTS):
        await handle_receipt(_photo_message(f"P{index}"))

    refused = _photo_message("one-too-many")
    await handle_receipt(refused)

    assert len(await _receipts(bot_session)) == MAX_PENDING_RECEIPTS
    assert forwarded.await_count == MAX_PENDING_RECEIPTS
    assert refused.answer.await_args.args[0] == messages.receipt_too_many(order.id)

    first = (await _receipts(bot_session))[0]
    await PaymentsService(bot_session).review(first.id, accept=False)
    await bot_session.commit()
    await handle_receipt(_photo_message("after-the-verdict"))

    assert len(await _receipts(bot_session)) == MAX_PENDING_RECEIPTS + 1


async def test_a_file_already_waiting_is_still_acknowledged_at_the_ceiling(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    await bot_session.commit()
    for index in range(MAX_PENDING_RECEIPTS):
        await handle_receipt(_photo_message(f"P{index}"))

    again = _photo_message("P0")
    await handle_receipt(again)

    assert again.answer.await_args.args[0] == messages.receipt_duplicate(order.id)


async def test_an_album_past_the_ceiling_is_refused_once(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    await bot_session.commit()
    album = str(uuid.uuid4())
    pages = [_photo_message(f"P{i}", album=album) for i in range(MAX_PENDING_RECEIPTS + 3)]

    for page in pages:
        await handle_receipt(page)

    assert len(await _receipts(bot_session)) == MAX_PENDING_RECEIPTS
    refusals = [page for page in pages if page.answer.await_count]
    # The first page is thanked for, the first page past the ceiling says why the rest
    # were not filed, and the others are silent.
    assert refusals == [pages[0], pages[MAX_PENDING_RECEIPTS]]


@pytest.mark.parametrize(
    "status", [OrderStatus.PENDING, OrderStatus.COMPLETED, OrderStatus.CANCELLED_BY_OWNER]
)
async def test_nothing_is_filed_without_an_order_awaiting_payment(
    bot_session: AsyncSession, forwarded: AsyncMock, status: OrderStatus
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer, status)
    await bot_session.commit()

    message = _photo_message()
    await handle_receipt(message)

    assert await _receipts(bot_session) == []
    message.answer.assert_awaited_once_with(messages.RECEIPT_NOTHING_AWAITING)
    forwarded.assert_not_awaited()


async def test_a_paid_order_takes_no_more_receipts(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    order = await _order(bot_session, customer)
    order.paid_at = func.now()
    await bot_session.commit()

    message = _photo_message()
    await handle_receipt(message)

    message.answer.assert_awaited_once_with(messages.RECEIPT_NOTHING_AWAITING)


async def test_several_orders_get_asked_about_and_the_answer_files_the_receipt(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    second = await _order(bot_session, customer)
    await bot_session.commit()

    photo = _photo_message()
    await handle_receipt(photo)

    assert await _receipts(bot_session) == []
    assert photo.reply.await_args.args[0] == messages.RECEIPT_WHICH_ORDER

    question = MagicMock(spec=Message)
    question.reply_to_message = photo
    question.edit_text = AsyncMock()
    question.answer = AsyncMock()
    query = MagicMock()
    query.from_user.id = CUSTOMER_CHAT
    query.message = question
    query.answer = AsyncMock()
    await handle_receipt_choice(query, ReceiptOrderChoice(order_id=second.id))

    (receipt,) = await _receipts(bot_session)
    assert receipt.order_id == second.id
    question.edit_text.assert_awaited_once_with(messages.receipt_filed(second.id))
    forwarded.assert_awaited_once_with(receipt.id)


def _bot_message(text: str) -> MagicMock:
    replied = MagicMock(spec=Message)
    replied.from_user = MagicMock()
    replied.from_user.is_bot = True
    replied.text = text
    replied.caption = None
    return replied


async def test_a_reply_to_the_receipt_prompt_files_against_its_order_unasked(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """The prompt goes out as a ForceReply, so the photo arrives as a reply to it — and
    the prompt has already named the order."""
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    second = await _order(bot_session, customer, OrderStatus.READY)
    await bot_session.commit()

    photo = _photo_message()
    photo.reply_to_message = _bot_message(messages.receipt_prompt(second.id))
    await handle_receipt(photo)

    (receipt,) = await _receipts(bot_session)
    assert receipt.order_id == second.id
    photo.reply.assert_not_awaited()
    assert photo.answer.await_args.args[0] == messages.receipt_received(second.id)
    forwarded.assert_awaited_once_with(receipt.id)


async def test_a_reply_naming_no_payable_order_still_asks(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """A reply naming no order of theirs is no answer."""
    customer = await _customer(bot_session)
    await _order(bot_session, customer)
    await _order(bot_session, customer)
    await bot_session.commit()

    photo = _photo_message()
    photo.reply_to_message = _bot_message(messages.receipt_prompt(uuid.uuid4()))
    await handle_receipt(photo)

    assert await _receipts(bot_session) == []
    assert photo.reply.await_args.args[0] == messages.RECEIPT_WHICH_ORDER


async def test_a_reply_to_the_customers_own_message_is_not_taken_for_an_answer(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    first = await _order(bot_session, customer)
    await _order(bot_session, customer)
    await bot_session.commit()

    photo = _photo_message()
    own = _bot_message(f"за {messages.order_reference(first.id)}")
    own.from_user.is_bot = False
    photo.reply_to_message = own
    await handle_receipt(photo)

    assert await _receipts(bot_session) == []
    assert photo.reply.await_args.args[0] == messages.RECEIPT_WHICH_ORDER


async def test_only_orders_confirmed_within_a_week_are_offered(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """Orders from cycles long gone, and READY ones, are not guessed at or asked about."""
    customer = await _customer(bot_session)
    recent = await _order(bot_session, customer, confirmed_ago=timedelta(days=6))
    newest = await _order(bot_session, customer)
    await _order(bot_session, customer, confirmed_ago=timedelta(days=8))
    await _order(bot_session, customer, OrderStatus.READY)
    await bot_session.commit()

    assert await PaymentsService(bot_session).awaiting_payment(customer.id) == [newest, recent]


async def test_an_old_order_alone_is_not_guessed(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    await _order(bot_session, customer, confirmed_ago=timedelta(days=30))
    await bot_session.commit()

    message = _photo_message()
    await handle_receipt(message)

    assert await _receipts(bot_session) == []
    message.answer.assert_awaited_once_with(messages.RECEIPT_NOTHING_AWAITING)


async def test_a_reply_naming_an_old_order_still_files_against_it(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """The window is for guessing; a reply to the bill says which order it is."""
    customer = await _customer(bot_session)
    old = await _order(bot_session, customer, OrderStatus.READY, confirmed_ago=timedelta(days=30))
    await bot_session.commit()

    photo = _photo_message()
    photo.reply_to_message = _bot_message(messages.receipt_prompt(old.id))
    await handle_receipt(photo)

    (receipt,) = await _receipts(bot_session)
    assert receipt.order_id == old.id


async def test_a_reply_to_a_paid_orders_bill_is_not_filed_against_another(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    customer = await _customer(bot_session)
    paid = await _order(bot_session, customer)
    paid.paid_at = func.now()
    await _order(bot_session, customer)
    await bot_session.commit()

    photo = _photo_message()
    photo.reply_to_message = _bot_message(messages.receipt_prompt(paid.id))
    await handle_receipt(photo)

    assert await _receipts(bot_session) == []
    photo.answer.assert_awaited_once_with(messages.CALLBACK_RECEIPT_NOT_AWAITED)
    forwarded.assert_not_awaited()


async def test_the_receipt_button_of_a_paid_order_asks_for_nothing(
    bot_session: AsyncSession,
) -> None:
    customer = await _customer(bot_session)
    paid = await _order(bot_session, customer)
    paid.paid_at = func.now()
    await bot_session.commit()

    query = MagicMock()
    query.from_user.id = CUSTOMER_CHAT
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.answer = AsyncMock()
    await handle_receipt_prompt(query, ReceiptAction(order_id=paid.id))

    query.answer.assert_awaited_once_with(messages.CALLBACK_RECEIPT_NOT_AWAITED, show_alert=True)
    query.message.answer.assert_not_awaited()


async def test_a_receipt_cannot_be_filed_against_someone_elses_order(
    bot_session: AsyncSession, forwarded: AsyncMock
) -> None:
    """callback_data is client-side: the order id in it is a claim, not a fact."""
    customer = await _customer(bot_session)
    stranger = await make_user(bot_session, phone="+996700999888")
    theirs = await _order(bot_session, stranger)
    await bot_session.commit()

    question = MagicMock(spec=Message)
    question.reply_to_message = _photo_message()
    query = MagicMock()
    query.from_user.id = customer.telegram_chat_id
    query.message = question
    query.answer = AsyncMock()
    await handle_receipt_choice(query, ReceiptOrderChoice(order_id=theirs.id))

    assert await _receipts(bot_session) == []
    assert query.answer.await_args.kwargs["show_alert"] is True


def _owner_query(chat_id: int = OWNER_CHAT) -> MagicMock:
    query = MagicMock()
    query.from_user.id = chat_id
    query.answer = AsyncMock()
    query.message = MagicMock(spec=Message)
    query.message.caption = "🧾 Чек об оплате"
    query.message.edit_caption = AsyncMock()
    return query


async def _filed_receipt(session: AsyncSession, order: Order, unique_id: str = "U1") -> uuid.UUID:
    added = await PaymentsService(session).add_receipt(
        order.user_id, order.id, ReceiptFile(ReceiptKind.PHOTO, "F", unique_id)
    )
    await session.commit()
    return added.receipt.id


async def test_the_owner_accepting_a_receipt_marks_the_order_paid(
    bot_session: AsyncSession, verdicts: AsyncMock
) -> None:
    await make_user(
        bot_session, phone="+996700111222", role=Role.ADMIN, telegram_chat_id=OWNER_CHAT
    )
    order = await _order(bot_session, await _customer(bot_session))
    receipt_id = await _filed_receipt(bot_session, order)

    query = _owner_query()
    await handle_payment_action(query, PaymentAction(action="accept", receipt_id=receipt_id))

    await bot_session.refresh(order)
    assert order.paid_at is not None
    receipt = await bot_session.get(PaymentReceipt, receipt_id)
    assert receipt is not None and receipt.verdict is ReceiptVerdict.ACCEPTED
    assert "Оплата получена" in query.message.edit_caption.await_args.kwargs["caption"]
    verdicts.assert_awaited_once_with(order.id, accepted=True)

    # A second owner pressing the same button tells the customer nothing new.
    await handle_payment_action(
        _owner_query(), PaymentAction(action="accept", receipt_id=receipt_id)
    )
    verdicts.assert_awaited_once()


async def test_a_rejected_receipt_leaves_the_order_open_for_another(
    bot_session: AsyncSession, verdicts: AsyncMock
) -> None:
    await make_user(
        bot_session, phone="+996700111222", role=Role.ADMIN, telegram_chat_id=OWNER_CHAT
    )
    order = await _order(bot_session, await _customer(bot_session))
    receipt_id = await _filed_receipt(bot_session, order)

    await handle_payment_action(
        _owner_query(), PaymentAction(action="reject", receipt_id=receipt_id)
    )

    await bot_session.refresh(order)
    assert order.paid_at is None
    verdicts.assert_awaited_once_with(order.id, accepted=False)
    assert await PaymentsService(bot_session).awaiting_payment(order.user_id) == [order]
    assert await PaymentsService(bot_session).orders_with_receipts([order.id]) == set()


async def test_rejecting_a_receipt_twice_tells_the_customer_once(
    bot_session: AsyncSession, verdicts: AsyncMock
) -> None:
    await make_user(
        bot_session, phone="+996700111222", role=Role.ADMIN, telegram_chat_id=OWNER_CHAT
    )
    order = await _order(bot_session, await _customer(bot_session))
    receipt_id = await _filed_receipt(bot_session, order)

    await handle_payment_action(
        _owner_query(), PaymentAction(action="reject", receipt_id=receipt_id)
    )
    repeat = _owner_query()
    await handle_payment_action(repeat, PaymentAction(action="reject", receipt_id=receipt_id))

    verdicts.assert_awaited_once_with(order.id, accepted=False)
    # Not «покупатель получит сообщение»: no second message is coming.
    assert repeat.answer.await_args.args == (messages.payment_resolution(accepted=False),)


async def test_a_receipt_rejected_meanwhile_is_not_rejected_again(
    db_session: AsyncSession,
) -> None:
    """The second of two owners pressing at once: the receipt was read before the order
    lock was granted, and the first owner's verdict landed during the wait."""
    order = await _order(db_session, await _customer(db_session))
    receipt_id = await _filed_receipt(db_session, order)
    # In this session's identity map, still undecided.
    assert (await db_session.get(PaymentReceipt, receipt_id)) is not None

    async with async_session() as other:
        await PaymentsService(other).review(receipt_id, accept=False)
        await other.commit()

    reviewed = await PaymentsService(db_session).review(receipt_id, accept=False)
    assert reviewed.changed is False


async def test_receipts_sent_before_the_order_was_billed_again_cannot_be_decided(
    db_session: AsyncSession,
) -> None:
    """Back to PENDING and confirmed again, the order owes a fresh bill: an undecided
    receipt for the old one is neither shown as waiting nor accepted from the buttons
    still under it — until the customer sends it again."""
    order = await _order(db_session, await _customer(db_session))
    db_session.add(
        OrderItem(order_id=order.id, product_name="Крем", product_price_cents=421_000, quantity=1)
    )
    receipt_id = await _filed_receipt(db_session, order)
    payments = PaymentsService(db_session)
    orders = OrdersService(db_session)

    await orders.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    assert await payments.orders_with_receipts([order.id]) == set()
    await orders.update_status(order.id, OrderStatus.PENDING)
    assert await payments.orders_with_receipts([order.id]) == set()
    await orders.update_status(order.id, OrderStatus.CONFIRMED)
    await db_session.commit()

    assert await payments.orders_with_receipts([order.id]) == set()
    with pytest.raises(OrderNotAwaitingPaymentError):
        await payments.review(receipt_id, accept=True)
    await db_session.refresh(order)
    assert order.paid_at is None

    # Sent again after the new bill, the same file goes to the owners again rather than
    # being told «уже у нас», which would promise a review `review` refuses to make.
    added = await payments.add_receipt(
        order.user_id, order.id, ReceiptFile(ReceiptKind.PHOTO, "F", "U1")
    )
    assert (added.receipt.id, added.created) == (receipt_id, True)
    assert await payments.orders_with_receipts([order.id]) == {order.id}
    assert (await payments.review(receipt_id, accept=True)).changed is True


async def test_a_receipt_cannot_be_rejected_once_the_payment_was_accepted(
    db_session: AsyncSession,
) -> None:
    order = await _order(db_session, await _customer(db_session))
    first = await _filed_receipt(db_session, order, "U1")
    second = await _filed_receipt(db_session, order, "U2")
    service = PaymentsService(db_session)

    await service.review(first, accept=True)

    with pytest.raises(PaymentAlreadyAcceptedError):
        await service.review(second, accept=False)


async def test_a_customer_pressing_the_owners_payment_button_changes_nothing(
    bot_session: AsyncSession, verdicts: AsyncMock
) -> None:
    order = await _order(bot_session, await _customer(bot_session))
    receipt_id = await _filed_receipt(bot_session, order)

    query = _owner_query(CUSTOMER_CHAT)
    await handle_payment_action(query, PaymentAction(action="accept", receipt_id=receipt_id))

    await bot_session.refresh(order)
    assert order.paid_at is None
    assert query.answer.await_args.kwargs["show_alert"] is True
    verdicts.assert_not_awaited()


async def test_a_paid_order_taken_back_to_pending_owes_a_fresh_bill(
    db_session: AsyncSession,
) -> None:
    """Back in PENDING the order is repriced like any other, so the old payment no longer
    covers it: confirming it again bills it again, and the same file reopens for review."""
    order = await _order(db_session, await _customer(db_session))
    # Not empty: an empty order is refused its way back to PENDING.
    db_session.add(
        OrderItem(order_id=order.id, product_name="Крем", product_price_cents=421_000, quantity=1)
    )
    receipt_id = await _filed_receipt(db_session, order)
    await PaymentsService(db_session).review(receipt_id, accept=True)
    await db_session.commit()

    orders = OrdersService(db_session)
    await orders.update_status(order.id, OrderStatus.CANCELLED_BY_OWNER)
    await orders.update_status(order.id, OrderStatus.PENDING)
    assert (order.paid_at, order.confirmed_at) == (None, None)

    await orders.update_status(order.id, OrderStatus.CONFIRMED)
    assert order.paid_at is None and order.confirmed_at is not None

    added = await PaymentsService(db_session).add_receipt(
        order.user_id, order.id, ReceiptFile(ReceiptKind.PHOTO, "F2", "U1")
    )
    assert (added.receipt.id, added.created, added.receipt.verdict) == (receipt_id, True, None)
    assert await PaymentsService(db_session).orders_with_receipts([order.id]) == {order.id}


def test_receipts_are_matched_before_the_fallback_swallows_them() -> None:
    """`@router.message()` with no filter catches everything registered after it."""
    callbacks = [handler.callback for handler in handlers.router.message.handlers]
    assert callbacks.index(handle_receipt) < callbacks.index(handlers.handle_fallback)


async def test_only_the_earliest_cycle_is_greeted_as_the_first(db_session: AsyncSession) -> None:
    now = datetime.now(UTC)
    first = await make_cycle(db_session, deadline_at=now - timedelta(days=30))
    later = await make_cycle(db_session, deadline_at=now + timedelta(days=1))

    assert await _is_first_cycle(db_session, first.id) is True
    assert await _is_first_cycle(db_session, later.id) is False
