import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.auth.models import Role
from app.common.schemas import CamelModel, require_not_null


class UserResponse(CamelModel):
    id: uuid.UUID
    phone: str
    name: str
    role: Role
    telegram_linked: bool
    # The chat the bot talks to, which in a private chat is the Telegram user id. The
    # Mini App compares it with the account in its `initData`: two Telegram accounts on
    # one phone share the webview's cookies, and without the check an order would go out
    # from whichever of them signed in last.
    telegram_user_id: int | None


class UserUpdateRequest(CamelModel):
    # None is the "field omitted" default, not a value: users.name is NOT NULL.
    name: str | None = Field(default=None, min_length=1, max_length=255)

    @field_validator("name", mode="before")
    @classmethod
    def _reject_null(cls, value: object) -> object:
        return require_not_null(value)


class AdminUserResponse(UserResponse):
    """A user as the owner sees them in the accounts list.

    `created_at` is the whole addition: without it the list is a set of names with no
    order anyone can explain, and "who signed up recently" is the only question the
    owner actually asks of it.
    """

    created_at: datetime


class UserRoleUpdateRequest(CamelModel):
    role: Role


class AccountDeletionResponse(CamelModel):
    """Whether this account can be erased right now, and what is holding it up.

    Asked by the account page before it draws the delete button: the rule lives on the
    server (`UsersService.deletion_blockers`), and a site that guessed at it would either
    disable a button that works or offer one that answers 409.

    `blocking_orders` carries ids rather than a count so the page can name them the way
    the rest of the shop does (`#1a2b3c4d`) and the person can find them in their own
    list. Empty whenever `is_deletable` is true.
    """

    is_deletable: bool
    blocking_orders: list[uuid.UUID]
