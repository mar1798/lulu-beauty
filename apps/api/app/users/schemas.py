import uuid
from datetime import datetime

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


class AdminUserResponse(UserResponse):
    """A user as the owner sees them in the accounts list.

    `created_at` is the whole addition: without it the list is a set of names with no
    order anyone can explain, and "who signed up recently" is the only question the
    owner actually asks of it.
    """

    created_at: datetime


class UserRoleUpdateRequest(CamelModel):
    role: Role
