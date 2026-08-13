import uuid
from typing import get_args

import pytest

from app.orders.models import OrderStatus
from app.telegram import keyboards
from app.telegram.keyboards import OrderAction, OrderActionName

# Telegram's hard limit on callback_data; exceeding it is rejected at send time, so the
# message with the buttons never arrives at all.
MAX_CALLBACK_DATA_BYTES = 64


def test_order_action_round_trips_through_callback_data() -> None:
    order_id = uuid.uuid4()

    packed = OrderAction(action="confirm", order_id=order_id).pack()
    unpacked = OrderAction.unpack(packed)

    assert len(packed.encode()) <= MAX_CALLBACK_DATA_BYTES
    assert unpacked.action == "confirm"
    assert unpacked.order_id == order_id


def test_every_action_maps_to_a_status() -> None:
    """The handler indexes ACTION_STATUS by the packed action, so a member added to the
    literal without an entry here would raise KeyError on a button press."""
    assert set(get_args(OrderActionName)) == set(keyboards.ACTION_STATUS)


def test_order_actions_offers_both_moves_for_the_same_order() -> None:
    order_id = uuid.uuid4()

    markup = keyboards.order_actions(order_id)
    buttons = [button for row in markup.inline_keyboard for button in row]

    assert len(buttons) == 2
    actions = [OrderAction.unpack(button.callback_data or "") for button in buttons]
    assert [action.action for action in actions] == ["confirm", "cancel"]
    assert {action.order_id for action in actions} == {order_id}
    assert {keyboards.ACTION_STATUS[a.action] for a in actions} == {
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    }


def test_checkout_link_is_omitted_when_the_site_is_not_publicly_addressable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Telegram rejects a url button pointing at localhost with BUTTON_URL_INVALID, and
    that failure takes the whole reminder with it — better a reminder without a button."""
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")

    assert keyboards.checkout_link() is None


def test_checkout_link_points_at_checkout_on_a_public_site(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com/")

    markup = keyboards.checkout_link()

    assert markup is not None
    button = markup.inline_keyboard[0][0]
    # The trailing slash of the configured base must not survive into the link.
    assert button.url == "https://lulu.example.com/checkout"


def test_wishlist_link_follows_the_same_public_url_rule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both site links go through `_site_link`, so localhost has to disarm this one too —
    otherwise the whole "ваша корзина в избранном" message fails to send."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")
    markup = keyboards.wishlist_link()
    assert markup is not None
    assert markup.inline_keyboard[0][0].url == "https://lulu.example.com/wishlist"

    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")
    assert keyboards.wishlist_link() is None
