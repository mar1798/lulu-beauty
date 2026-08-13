import uuid

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
    )
    dumped = response.model_dump(by_alias=True)
    assert dumped["telegramLinked"] is False
    assert dumped["role"] == "CUSTOMER"


def test_update_request_distinguishes_omitted_from_provided() -> None:
    # PATCH semantics used across the project: exclude_unset separates "not sent" from "sent".
    assert UserUpdateRequest().model_dump(exclude_unset=True) == {}
    assert UserUpdateRequest(name="New Name").model_dump(exclude_unset=True) == {"name": "New Name"}
