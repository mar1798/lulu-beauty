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
