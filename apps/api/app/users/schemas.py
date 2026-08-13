import uuid

from pydantic import Field

from app.auth.models import Role
from app.common.schemas import CamelModel


class UserResponse(CamelModel):
    id: uuid.UUID
    phone: str
    name: str
    role: Role
    telegram_linked: bool


class UserUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
