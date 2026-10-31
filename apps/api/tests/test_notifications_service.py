import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import Chat, Message, MessageId

from app.auth.models import User
from app.cycles.models import OrderCycle
from app.orders.models import Order, OrderItem, OrderStatus
from app.payments.models import PaymentReceipt, ReceiptKind
from app.telegram import keyboards, messages
from app.telegram.keyboards import OrderAction, PaymentAction, ReceiptAction, ReplyAction
from app.telegram.service import (
    MAX_MESSAGE_LENGTH,
    CartRescueNotice,
    Delivery,
    NotificationsService,
    split_message,
)


def _user(telegram_chat_id: int | None) -> User:
    return User(
        phone="+996700123456",
        name="Test User",
        telegram_chat_id=telegram_chat_id,
    )


def _order(status: OrderStatus = OrderStatus.PENDING) -> Order:
    order = Order(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        cycle_id=uuid.uuid4(),
        status=status,
        total_cents=1000,
        note=None,
    )
    order.items = []
    return order


def _cycle() -> OrderCycle:
    return OrderCycle(deadline_at=datetime(2030, 6, 12, tzinfo=UTC), label="Июнь")


async def test_send_reminder_uses_telegram_when_bound() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), _cycle())

    bot.send_message.assert_awaited_once()


async def test_send_new_order_reaches_the_owners_chat() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    owner = _user(telegram_chat_id=7)

    await service.send_new_order(owner, _order(), _user(telegram_chat_id=None), _cycle())

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 7
    assert "Новая заявка" in message


async def test_send_new_order_carries_the_confirm_cancel_buttons() -> None:
    """The point of the notification is that the owner can act on it without opening the
    admin panel; without the markup it's just a receipt."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order()

    await service.send_new_order(_user(telegram_chat_id=7), order, None, _cycle())

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    payloads = [
        OrderAction.unpack(button.callback_data or "")
        for row in markup.inline_keyboard
        for button in row
    ]
    assert {payload.order_id for payload in payloads} == {order.id}


async def test_send_reminder_links_to_checkout_when_the_site_is_public(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), _cycle())

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    assert (
        keyboards.button_target(markup.inline_keyboard[0][0]) == "https://lulu.example.com/checkout"
    )


async def test_send_reminder_still_goes_out_without_a_linkable_site(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), _cycle())

    bot.send_message.assert_awaited_once()
    assert bot.send_message.await_args.kwargs["reply_markup"] is None


async def test_send_reminder_switches_text_on_the_last_chance_stage() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), _cycle())
    first = bot.send_message.await_args.args[1]
    await service.send_reminder(_user(telegram_chat_id=42), _cycle(), last_chance=True)
    last = bot.send_message.await_args.args[1]

    assert "Последний шанс" in last
    assert first != last


async def test_send_order_deleted_stays_silent_on_a_finished_order() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_deleted(
        _user(telegram_chat_id=42), uuid.uuid4(), OrderStatus.COMPLETED
    )

    bot.send_message.assert_not_awaited()


async def test_send_order_deleted_tells_a_customer_still_waiting() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order_id = uuid.uuid4()

    await service.send_order_deleted(_user(telegram_chat_id=42), order_id, OrderStatus.CONFIRMED)

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert str(order_id)[:8] in message
    # The text sends them to the owner, so the keyboard has to carry the only address
    # the owner answers at.
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert keyboards.INSTAGRAM_URL in urls


async def test_send_owner_message_reports_delivery_with_the_way_to_answer() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order_id = uuid.uuid4()

    outcome = await service.send_owner_message(_user(telegram_chat_id=42), order_id, "Привет")

    assert outcome is Delivery.SENT
    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert "Привет" in message
    # Both ways to answer the text names: «Ответить» first, Instagram below it.
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    first = markup.inline_keyboard[0][0]
    assert first.text == messages.REPLY_BUTTON
    assert ReplyAction.unpack(first.callback_data or "").order_id == order_id
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert keyboards.INSTAGRAM_URL in urls


async def test_send_owner_message_reports_a_blocked_bot() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = TelegramForbiddenError(method=AsyncMock(), message="blocked")
    service = NotificationsService(bot)

    outcome = await service.send_owner_message(_user(telegram_chat_id=42), uuid.uuid4(), "Привет")

    assert outcome is Delivery.BLOCKED


async def test_send_owner_message_does_not_wait_out_a_flood_limit() -> None:
    """The owner is watching a spinner; Telegram's pause can run to half a minute."""
    bot = AsyncMock()
    bot.send_message.side_effect = TelegramRetryAfter(
        method=AsyncMock(), message="Too Many Requests", retry_after=30
    )
    service = NotificationsService(bot)

    outcome = await service.send_owner_message(_user(telegram_chat_id=42), uuid.uuid4(), "Привет")

    assert outcome is Delivery.FAILED
    bot.send_message.assert_awaited_once()


def _reply(text: str | None, *, photo: bool = False, caption: str | None = None) -> MagicMock:
    """A sticker unless `text` or `photo` says otherwise — the kind that takes no caption."""
    reply = MagicMock()
    reply.text = text
    reply.caption = caption
    reply.photo = [MagicMock()] if photo else None
    reply.video = reply.document = reply.audio = reply.voice = reply.animation = None
    reply.chat.id = 555
    reply.message_id = 7
    return reply


async def test_send_customer_reply_carries_a_text_under_the_header() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    customer = _user(telegram_chat_id=555)

    delivered = await service.send_customer_reply(
        _user(telegram_chat_id=1), customer, "#a1b2c3d4", _reply("Да, заменить")
    )

    assert delivered.delivered is True
    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 1
    assert "#a1b2c3d4" in message
    assert customer.phone in message
    assert message.endswith("Да, заменить")
    bot.copy_message.assert_not_awaited()


async def test_send_customer_reply_copies_anything_but_text_after_the_header() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    delivered = await service.send_customer_reply(
        _user(telegram_chat_id=1), _user(telegram_chat_id=555), "#a1b2c3d4", _reply(None)
    )

    assert delivered.delivered is True
    bot.send_message.assert_awaited_once()
    bot.copy_message.assert_awaited_once_with(1, 555, 7)


async def test_send_owner_message_without_a_bot_is_a_failure_not_a_missing_binding() -> None:
    """The customer's binding is fine; it is this server that cannot send."""
    service = NotificationsService(None)

    outcome = await service.send_owner_message(_user(telegram_chat_id=42), uuid.uuid4(), "Привет")

    assert outcome is Delivery.FAILED


async def test_send_order_status_offers_the_instagram_on_the_owners_cancellation() -> None:
    """«Если это ошибка — напишите»: без кнопки это значит искать аккаунт руками."""
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(
        _user(telegram_chat_id=42), _order(status=OrderStatus.CANCELLED_BY_OWNER)
    )

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert keyboards.INSTAGRAM_URL in urls


async def test_send_order_status_asks_for_a_google_review_after_pickup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.google_review_url", "https://g.page/r/abc/review")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(_user(telegram_chat_id=42), _order(OrderStatus.COMPLETED))

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert urls[0] == "https://g.page/r/abc/review"
    assert keyboards.INSTAGRAM_URL in urls


async def test_send_order_status_offers_no_review_on_the_owners_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Просить отзыв под «заявка отменена» — худшее место для такой просьбы."""
    monkeypatch.setattr("app.config.settings.google_review_url", "https://g.page/r/abc/review")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(
        _user(telegram_chat_id=42), _order(OrderStatus.CANCELLED_BY_OWNER)
    )

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert "https://g.page/r/abc/review" not in urls


async def test_send_order_status_stays_silent_on_the_customers_own_cancellation() -> None:
    """Telling someone what they just did themselves reads as if someone else did it."""
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(
        _user(telegram_chat_id=42), _order(OrderStatus.CANCELLED_BY_CUSTOMER)
    )

    bot.send_message.assert_not_awaited()


async def test_send_order_status_announces_a_real_move() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_order_status(_user(telegram_chat_id=42), _order(OrderStatus.READY))

    bot.send_message.assert_awaited_once()


async def test_cart_rescue_is_a_fan_out_of_personal_texts() -> None:
    """Одна рассылка, но у каждого свои числа — и общий троттлинг с обычным броадкастом."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    notices = [
        CartRescueNotice(user=_user(telegram_chat_id=1), saved=2, dropped=0),
        CartRescueNotice(user=_user(telegram_chat_id=2), saved=1, dropped=3),
    ]

    result = await service.send_cart_rescued(notices, "«Июнь»")

    assert result.sent == 2
    first, second = (call.args[1] for call in bot.send_message.await_args_list)
    assert "2 товара" in first
    assert "не поместились" in second


async def test_broadcast_counts_deliveries_and_skips_unbound_users() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    audience = [_user(telegram_chat_id=1), _user(telegram_chat_id=None), _user(2)]

    result = await service.send_cycle_opened(audience, _cycle())

    assert result.sent == 2
    assert result.blocked_chat_ids == []


async def test_broadcast_reports_blocked_chats_instead_of_counting_them() -> None:
    """A 403 means the binding is dead, not that the send should be retried — the
    caller drops the row so the next cycle doesn't pay for it again."""
    bot = AsyncMock()
    bot.send_message.side_effect = [
        None,
        TelegramForbiddenError(method=AsyncMock(), message="bot was blocked by the user"),
    ]
    service = NotificationsService(bot)

    result = await service.send_cycle_opened([_user(1), _user(2)], _cycle())

    assert result.sent == 1
    assert result.blocked_chat_ids == [2]


async def test_broadcast_survives_one_chat_failing() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = [RuntimeError("network error"), None]
    service = NotificationsService(bot)

    result = await service.send_cycle_opened([_user(1), _user(2)], _cycle())

    assert result.sent == 1
    assert result.blocked_chat_ids == []


async def test_delivery_retries_once_after_a_flood_wait() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = [
        TelegramRetryAfter(method=AsyncMock(), message="Too Many Requests", retry_after=0),
        None,
    ]
    service = NotificationsService(bot)

    await service.send_reminder(_user(telegram_chat_id=42), _cycle())

    assert bot.send_message.await_count == 2


async def test_delivery_gives_up_after_a_second_flood_wait() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = TelegramRetryAfter(
        method=AsyncMock(), message="Too Many Requests", retry_after=0
    )
    service = NotificationsService(bot)

    # Must not recurse forever, and must not raise into the caller.
    await service.send_reminder(_user(telegram_chat_id=42), _cycle())

    assert bot.send_message.await_count == 2


async def test_send_customer_cancellation_reaches_the_owner_without_order_buttons(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """«Подтвердить» под отменённой заявкой — это подтверждение того, чего уже нет;
    владельцу здесь нечего нажимать, кроме дороги в админку."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order(status=OrderStatus.CANCELLED_BY_CUSTOMER)

    await service.send_customer_cancellation(
        _user(telegram_chat_id=42), order, _user(telegram_chat_id=7), restored=False
    )

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert "отменена покупателем" in message
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    buttons = [button for row in markup.inline_keyboard for button in row]
    assert [keyboards.button_target(button) for button in buttons] == [
        "https://lulu.example.com/admin/orders"
    ]


async def test_send_customer_cancellation_stays_quiet_on_a_dead_binding() -> None:
    """Владелец заблокировал бота: событие уже произошло, ронять фоновую задачу нечем."""
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_customer_cancellation(
        _user(telegram_chat_id=None), _order(), None, restored=True
    )

    bot.send_message.assert_not_awaited()


async def test_send_own_cancellation_points_the_customer_at_their_orders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Текст обещает вернуть заявку на странице заявок — кнопка ведёт туда."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_own_cancellation(
        _user(telegram_chat_id=42), _order(status=OrderStatus.CANCELLED_BY_CUSTOMER)
    )

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert "отменена вами" in message
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    buttons = [button for row in markup.inline_keyboard for button in row]
    assert [keyboards.button_target(button) for button in buttons] == [
        "https://lulu.example.com/orders"
    ]


async def test_send_own_cancellation_stays_quiet_on_a_dead_binding() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_own_cancellation(_user(telegram_chat_id=None), _order())

    bot.send_message.assert_not_awaited()


async def test_send_stale_orders_points_the_owner_at_the_panel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Напоминание просит решения, а решают его в админке — туда и ведёт кнопка."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    bot = AsyncMock()
    service = NotificationsService(bot)

    assert await service.send_stale_orders(_user(telegram_chat_id=42), _cycle(), 2) is True

    chat_id, message = bot.send_message.await_args.args
    assert chat_id == 42
    assert "2 заявки без ответа" in message
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    buttons = [button for row in markup.inline_keyboard for button in row]
    assert [keyboards.button_target(button) for button in buttons] == [
        "https://lulu.example.com/admin/orders"
    ]


async def test_send_stale_orders_stays_quiet_on_a_dead_binding() -> None:
    """Владелец не привязал чат: напомнить некуда, а свип обязан идти дальше.

    Отвечает `False`, и это не мелочь: по этому ответу свип решает, ставить ли отметку,
    а отметка навсегда закрывает единственное напоминание про эти заявки.
    """
    bot = AsyncMock()
    service = NotificationsService(bot)

    assert await service.send_stale_orders(_user(telegram_chat_id=None), _cycle(), 2) is False

    bot.send_message.assert_not_awaited()


async def test_taking_the_order_sends_the_bill_with_the_receipt_button() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order(OrderStatus.AWAITING_PAYMENT)

    await service.send_order_status(_user(telegram_chat_id=42), order)

    message = bot.send_message.await_args.args[1]
    assert "Итого к оплате" in message
    assert bot.send_message.await_args.kwargs["parse_mode"] == "HTML"
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    first = markup.inline_keyboard[0][0]
    assert first.callback_data == ReceiptAction(order_id=order.id).pack()


async def test_a_bill_too_long_for_one_message_goes_out_in_parts() -> None:
    """Every line is listed, so a big order passes Telegram's 4096; one refused message
    used to leave the customer with no bill at all."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order(OrderStatus.AWAITING_PAYMENT)
    order.items = [
        OrderItem(
            product_name=f"Увлажняющая сыворотка с центеллой и ниацинамидом №{n}",
            product_volume_ml=50,
            product_price_cents=125_000,
            quantity=2,
        )
        for n in range(80)
    ]

    await service.send_order_status(_user(telegram_chat_id=42), order)

    calls = bot.send_message.await_args_list
    assert len(calls) > 1
    texts = [call.args[1] for call in calls]
    assert all(len(text) <= MAX_MESSAGE_LENGTH for text in texts)
    assert "\n".join(texts) == messages.order_confirmed(order, first_cycle=False)
    # The button sits under the last part, next to the total and the requisites.
    assert [call.kwargs["reply_markup"] is None for call in calls[:-1]] == [True] * (len(calls) - 1)
    assert "Итого к оплате" in texts[-1]
    first = calls[-1].kwargs["reply_markup"].inline_keyboard[0][0]
    assert first.callback_data == ReceiptAction(order_id=order.id).pack()


def test_split_message_keeps_a_short_text_whole_and_cuts_between_lines() -> None:
    assert split_message("одна\nдве") == ["одна\nдве"]
    assert split_message("aaa\nbbb\nccc", limit=7) == ["aaa\nbbb", "ccc"]
    # Counted in UTF-16 units: an emoji takes two of them.
    assert split_message("🛍🛍\nab", limit=5) == ["🛍🛍", "ab"]
    assert split_message("abcdefgh", limit=3) == ["abc", "def", "gh"]


@pytest.mark.parametrize(
    ("kind", "method"), [(ReceiptKind.PHOTO, "send_photo"), (ReceiptKind.DOCUMENT, "send_document")]
)
async def test_a_receipt_reaches_the_owner_as_what_it_was_sent_as(
    kind: ReceiptKind, method: str
) -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order(OrderStatus.CONFIRMED)
    receipt = PaymentReceipt(
        id=uuid.uuid4(), order_id=order.id, kind=kind, file_id="FILE", file_unique_id="U"
    )

    await service.send_receipt(_user(telegram_chat_id=7), receipt, order, _user(None))

    send = getattr(bot, method)
    chat_id, file_id = send.await_args.args
    assert (chat_id, file_id) == (7, "FILE")
    assert "Чек об оплате" in send.await_args.kwargs["caption"]
    accept = send.await_args.kwargs["reply_markup"].inline_keyboard[0][0]
    assert accept.callback_data == PaymentAction(action="accept", receipt_id=receipt.id).pack()


async def test_a_receipt_to_a_blocked_owner_falls_back_to_the_log() -> None:
    bot = AsyncMock()
    bot.send_photo.side_effect = TelegramForbiddenError(method=AsyncMock(), message="blocked")
    service = NotificationsService(bot)
    order = _order(OrderStatus.CONFIRMED)
    receipt = PaymentReceipt(
        id=uuid.uuid4(), order_id=order.id, kind=ReceiptKind.PHOTO, file_id="F", file_unique_id="U"
    )

    # Must not raise: the receipt is already filed, and other owners are still to come.
    await service.send_receipt(_user(telegram_chat_id=7), receipt, order, None)


async def test_a_payment_marked_by_hand_is_announced_like_an_accepted_receipt() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order = _order(OrderStatus.CONFIRMED)

    await service.send_order_status(_user(telegram_chat_id=42), order)

    bot.send_message.assert_awaited_once()
    assert bot.send_message.await_args.args[1] == messages.payment_accepted(order)


async def test_a_rejected_receipt_points_the_customer_at_the_owner() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_payment_reviewed(
        _user(telegram_chat_id=42), _order(OrderStatus.CONFIRMED), accepted=False
    )

    markup = bot.send_message.await_args.kwargs["reply_markup"]
    urls = [keyboards.button_target(button) for row in markup.inline_keyboard for button in row]
    assert keyboards.INSTAGRAM_URL in urls


async def test_send_customer_reply_puts_the_header_into_a_photos_caption() -> None:
    """So the owner can answer by replying to the photo itself."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    customer = _user(telegram_chat_id=555)

    delivered = await service.send_customer_reply(
        _user(telegram_chat_id=1), customer, None, _reply(None, photo=True, caption="Вот")
    )

    assert delivered.delivered is True
    bot.send_message.assert_not_awaited()
    caption = bot.copy_message.await_args.kwargs["caption"]
    assert caption.startswith(messages.CUSTOMER_MESSAGE_TITLE)
    assert customer.phone in caption
    assert caption.endswith("Вот")


async def test_send_owner_reply_words_a_text_like_the_panels_message() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    order_id = uuid.uuid4()

    outcome = await service.send_owner_reply(
        _user(telegram_chat_id=555), "#a1b2c3d4", order_id, _reply("Будет в пятницу")
    )

    assert outcome is Delivery.SENT
    chat_id, text = bot.send_message.await_args.args
    assert chat_id == 555
    assert text == messages.owner_message("#a1b2c3d4", "Будет в пятницу")
    markup = bot.send_message.await_args.kwargs["reply_markup"]
    assert ReplyAction.unpack(markup.inline_keyboard[0][0].callback_data or "").order_id == order_id


async def test_send_owner_reply_to_a_wish_says_what_it_answers() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_owner_reply(
        _user(telegram_chat_id=555), None, None, _reply("Привезём"), wish=True
    )

    assert bot.send_message.await_args.args[1] == messages.owner_message(
        None, "Привезём", wish=True
    )


def _sent(message_id: int) -> Message:
    """What `send_message` answers with: the copy under it replies to this id."""
    return Message.model_construct(
        message_id=message_id, date=None, chat=Chat(id=1, type="private")
    )


async def test_send_owner_reply_puts_the_header_into_a_photos_caption() -> None:
    """So the customer can answer by replying to the photo itself."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    order_id = uuid.uuid4()

    outcome = await service.send_owner_reply(
        _user(telegram_chat_id=555), "#a1b2c3d4", order_id, _reply(None, photo=True, caption="Вот")
    )

    assert outcome is Delivery.SENT
    bot.send_message.assert_not_awaited()
    kwargs = bot.copy_message.await_args.kwargs
    assert kwargs["caption"] == messages.owner_message("#a1b2c3d4", "Вот")
    button = kwargs["reply_markup"].inline_keyboard[0][0]
    assert ReplyAction.unpack(button.callback_data or "").order_id == order_id


async def test_send_owner_reply_captions_a_photo_without_its_own_caption_too() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_owner_reply(
        _user(telegram_chat_id=555), None, None, _reply(None, photo=True)
    )

    caption = bot.copy_message.await_args.kwargs["caption"]
    assert caption == messages.owner_media_caption(None, None)
    assert caption.startswith(messages.OWNER_MESSAGE_HEADER)
    assert "ниже" not in caption


async def test_send_owner_reply_keeps_the_buttons_off_an_albums_later_photos() -> None:
    """The header stays in each caption — a reply to any photo is recognised — but the
    buttons come once per album."""
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_owner_reply(
        _user(telegram_chat_id=555), None, None, _reply(None, photo=True), with_header=False
    )

    bot.send_message.assert_not_awaited()
    kwargs = bot.copy_message.await_args.kwargs
    assert kwargs["caption"].startswith(messages.OWNER_MESSAGE_HEADER)
    assert kwargs["reply_markup"] is None


async def test_send_owner_reply_sends_a_sticker_as_a_reply_to_a_header() -> None:
    bot = AsyncMock()
    bot.send_message.return_value = _sent(42)
    service = NotificationsService(bot)

    outcome = await service.send_owner_reply(_user(telegram_chat_id=555), None, None, _reply(None))

    assert outcome is Delivery.SENT
    assert bot.send_message.await_args.args[1] == messages.owner_message(None, None)
    assert bot.copy_message.await_args.args == (555, 555, 7)
    assert bot.copy_message.await_args.kwargs["reply_parameters"].message_id == 42


async def test_send_owner_reply_sends_an_albums_later_sticker_bare() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)

    await service.send_owner_reply(
        _user(telegram_chat_id=555), None, None, _reply(None), with_header=False
    )

    bot.send_message.assert_not_awaited()
    bot.copy_message.assert_awaited_once_with(555, 555, 7)


async def test_send_owner_reply_repeats_the_header_on_every_part_of_a_long_text() -> None:
    """A reply to the second part has to be recognised as well as one to the first."""
    bot = AsyncMock()
    service = NotificationsService(bot)
    text = "\n".join(["слово " * 15] * 80)

    await service.send_owner_reply(_user(telegram_chat_id=555), "#a1b2c3d4", None, _reply(text))

    calls = bot.send_message.await_args_list
    assert len(calls) > 1
    for call in calls:
        part = call.args[1]
        assert part.startswith(f"{messages.OWNER_MESSAGE_HEADER} по заявке #a1b2c3d4:")
        assert len(part.encode("utf-16-le")) // 2 <= MAX_MESSAGE_LENGTH
    assert [call.kwargs["reply_markup"] is None for call in calls] == [True] * (
        len(calls) - 1
    ) + [False]


async def test_send_customer_reply_repeats_the_header_on_every_part_of_a_long_text() -> None:
    bot = AsyncMock()
    service = NotificationsService(bot)
    customer = _user(telegram_chat_id=555)
    text = "\n".join(["слово " * 15] * 80)

    delivered = await service.send_customer_reply(
        _user(telegram_chat_id=1), customer, "#a1b2c3d4", _reply(text)
    )

    assert delivered.delivered is True
    parts = [call.args[1] for call in bot.send_message.await_args_list]
    assert len(parts) > 1
    header = messages.customer_reply_for_owner("#a1b2c3d4", customer)
    for part in parts:
        assert part.startswith(header + "\n\n")
        assert len(part.encode("utf-16-le")) // 2 <= MAX_MESSAGE_LENGTH


async def test_send_customer_reply_sends_a_sticker_as_a_reply_to_the_header() -> None:
    bot = AsyncMock()
    bot.send_message.return_value = _sent(42)
    service = NotificationsService(bot)

    delivered = await service.send_customer_reply(
        _user(telegram_chat_id=1), _user(telegram_chat_id=555), None, _reply(None)
    )

    assert delivered.delivered is True
    assert bot.copy_message.await_args.kwargs["reply_parameters"].message_id == 42


async def test_send_customer_reply_returns_the_ids_of_everything_that_arrived() -> None:
    """The header and the copy alike: the owner may reply to either, and both have to
    lead back to this customer (`relay.record`)."""
    bot = AsyncMock()
    bot.send_message.return_value = _sent(42)
    bot.copy_message.return_value = MessageId(message_id=43)
    service = NotificationsService(bot)

    relayed = await service.send_customer_reply(
        _user(telegram_chat_id=1), _user(telegram_chat_id=555), None, _reply(None)
    )

    assert relayed.delivered is True
    assert relayed.message_ids == [42, 43]


async def test_send_customer_reply_returns_no_ids_when_nothing_arrived() -> None:
    bot = AsyncMock()
    bot.send_message.side_effect = RuntimeError("Telegram is down")
    service = NotificationsService(bot)

    relayed = await service.send_customer_reply(
        _user(telegram_chat_id=1), _user(telegram_chat_id=555), None, _reply("Привет")
    )

    assert relayed.delivered is False
    assert relayed.message_ids == []
