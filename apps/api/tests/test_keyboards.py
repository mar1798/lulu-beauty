import uuid
from typing import get_args

import pytest

from app.orders.models import OrderStatus
from app.telegram import keyboards
from app.telegram.keyboards import MenuAction, OrderAction, OrderActionName

# Telegram's hard limit on callback_data; exceeding it is rejected at send time, so the
# message with the buttons never arrives at all.
MAX_CALLBACK_DATA_BYTES = 64


def test_main_menu_labels_are_distinct() -> None:
    """Handlers match a tap by comparing its text to a label, so two buttons wearing the
    same one would mean the second is unreachable — with nothing on screen to show it."""
    labels = [button.text for row in keyboards.main_menu().keyboard for button in row]

    assert len(labels) == len(set(labels))
    assert all(label.strip() for label in labels)


def test_main_menu_stays_up_between_messages() -> None:
    """The whole reason for a reply keyboard over an inline one: it is always in the
    same place. Without is_persistent it collapses back to the letter keyboard after a
    tap, and the bot looks like it has nothing to offer."""
    menu = keyboards.main_menu()

    assert menu.is_persistent is True
    assert menu.resize_keyboard is True


def test_unlink_is_confirmed_before_it_happens() -> None:
    """Unlinking used to take a typed /unlink; a button is far easier to hit by
    accident, and a chat_id is UNIQUE — a binding dropped by mistake is a re-link."""
    actions = [
        MenuAction.unpack(button.callback_data or "")
        for row in keyboards.unlink_confirm().inline_keyboard
        for button in row
    ]

    assert [action.action for action in actions] == ["unlink_cancel", "unlink_confirm"]


def test_help_offers_unlink_and_the_site(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com")

    buttons = [b for row in keyboards.help_actions().inline_keyboard for b in row]

    assert [button.url for button in buttons if button.url] == ["https://lulu.example.com"]
    assert MenuAction.unpack(buttons[-1].callback_data or "").action == "unlink"


def test_help_keeps_the_unlink_button_when_the_site_is_not_linkable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The url button disarms itself on localhost (BUTTON_URL_INVALID would fail the
    whole message) — but the way out of a binding must not disappear with it."""
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")

    buttons = [b for row in keyboards.help_actions().inline_keyboard for b in row]

    assert len(buttons) == 1
    assert MenuAction.unpack(buttons[0].callback_data or "").action == "unlink"


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


def test_the_mini_app_needs_https_not_merely_a_public_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Строже, чем у url-кнопки: Mini App открывается во встроенном webview Telegram, и
    для него http не «непубличный адрес», а адрес, который не откроется вовсе."""
    monkeypatch.setattr("app.config.settings.website_base_url", "http://lulu.example.com")

    assert keyboards.mini_app_url() is None


def test_the_mini_app_opens_the_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    """В Mini App заходят покупать; главная — шаг по дороге туда."""
    monkeypatch.setattr("app.config.settings.website_base_url", "https://lulu.example.com/")

    assert keyboards.mini_app_url() == "https://lulu.example.com/catalog"


def test_local_development_publishes_no_mini_app_button(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.config.settings.website_base_url", "http://localhost:3000")

    assert keyboards.mini_app_url() is None
