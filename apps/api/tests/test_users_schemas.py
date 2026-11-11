import uuid

import pytest
from pydantic import ValidationError

from app.auth.models import Role
from app.users.schemas import UserResponse, UserUpdateRequest


def test_user_response_serializes_camel_case() -> None:
    response = UserResponse(
        id=uuid.uuid4(),
        phone="+996700123456",
        name="Aigul",
        role=Role.CUSTOMER,
        phone_verified=True,
        telegram_linked=False,
        telegram_user_id=None,
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["telegramLinked"] is False
    assert dumped["role"] == "CUSTOMER"


def test_update_request_distinguishes_omitted_from_provided() -> None:
    # PATCH semantics used across the project: exclude_unset separates "not sent" from "sent".
    assert UserUpdateRequest().model_dump(exclude_unset=True) == {}
    assert UserUpdateRequest(name="New Name").model_dump(exclude_unset=True) == {"name": "New Name"}


def test_a_name_is_flattened_onto_one_line() -> None:
    """The bot prints the name on a line of its own to the owner: a line break in it used
    to make up lines of its own there."""
    request = UserUpdateRequest(name="  Айсулуу, +996555000111\nПокупатель:\t x\x07 ")
    assert request.name == "Айсулуу, +996555000111 Покупатель: x"


def test_a_name_of_nothing_but_whitespace_is_refused() -> None:
    with pytest.raises(ValidationError):
        UserUpdateRequest(name=" \n\t ")


def test_user_response_carries_the_delivery_fields() -> None:
    response = UserResponse(
        id=uuid.uuid4(),
        phone="+996700123456",
        name="Aigul",
        role=Role.CUSTOMER,
        telegram_linked=True,
        telegram_user_id=1,
        delivery_address="Бишкек, Киевская 10, кв. 5",
        delivery_note="Самовывоз",
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["deliveryAddress"] == "Бишкек, Киевская 10, кв. 5"
    assert dumped["deliveryNote"] == "Самовывоз"


def test_a_delivery_address_keeps_its_lines_and_loses_the_noise() -> None:
    """The flat on a line of its own is how people write an address; tabs, padding and
    empty lines between the parts are not."""
    request = UserUpdateRequest(deliveryAddress="  Бишкек,\tКиевская 10 \r\n\n\n кв. 5\x07 ")
    assert request.delivery_address == "Бишкек, Киевская 10\nкв. 5"


@pytest.mark.parametrize("blank", ["", "   ", "\n \n\t"])
def test_a_blank_delivery_field_is_stored_as_nothing(blank: str) -> None:
    """An emptied textarea sends "" — stored as NULL, so "nothing" has one spelling."""
    request = UserUpdateRequest(deliveryAddress=blank, deliveryNote=blank)
    assert request.model_dump(exclude_unset=True) == {
        "delivery_address": None,
        "delivery_note": None,
    }


def test_a_delivery_field_over_the_cap_is_refused() -> None:
    with pytest.raises(ValidationError):
        UserUpdateRequest(deliveryNote="а" * 501)
