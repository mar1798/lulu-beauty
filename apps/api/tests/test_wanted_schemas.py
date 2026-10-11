import pytest
from pydantic import ValidationError

from app.common.limits import MAX_WANTED_MESSAGE_LENGTH
from app.telegram import messages
from app.wanted.models import WantedProduct
from app.wanted.schemas import WantedProductRequest


def test_message_is_required() -> None:
    with pytest.raises(ValidationError):
        WantedProductRequest()  # type: ignore[call-arg]


def test_empty_message_is_rejected() -> None:
    """A wish with nothing in it is the submit button pressed by accident."""
    with pytest.raises(ValidationError):
        WantedProductRequest(message="")


def test_blank_message_is_rejected() -> None:
    """Whitespace is stripped before the length check, so it counts as nothing."""
    with pytest.raises(ValidationError):
        WantedProductRequest(message="   ")


def test_message_longer_than_the_limit_is_rejected() -> None:
    with pytest.raises(ValidationError):
        WantedProductRequest(message="x" * (MAX_WANTED_MESSAGE_LENGTH + 1))


def test_a_contact_in_the_payload_is_dropped() -> None:
    """The form cannot name somebody else: the service copies the account's contact."""
    request = WantedProductRequest.model_validate(
        {"message": "Нужен крем", "name": "Кто-то ещё", "phone": "+996555999888"}
    )

    assert request.model_dump() == {"message": "Нужен крем"}


def test_owner_message_carries_the_contact_and_the_text() -> None:
    """The three things the owner has to act on, and nothing else exists to add."""
    wanted = WantedProduct(name="Аня", phone="+996555123456", message="Крем Cerave, 50 мл")

    text = messages.wanted_product_for_owner(wanted)

    assert "Аня" in text
    assert "+996555123456" in text
    # Last and behind a blank line: the text is free-length, the contact must stay on top.
    assert text.endswith("Крем Cerave, 50 мл")
    assert "\n\nКрем Cerave" in text
