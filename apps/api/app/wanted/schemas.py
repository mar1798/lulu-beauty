import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.common.limits import MAX_WANTED_MESSAGE_LENGTH
from app.common.phone import PHONE_PATTERN
from app.common.schemas import CamelModel

# Stripped before the length check: "   " is the same accidental press as "", and without
# this it passed `min_length=1` and reached the owner as an empty wish from a blank name.
_Text = Annotated[str, StringConstraints(strip_whitespace=True)]


class WantedProductRequest(CamelModel):
    """A wish, plus a way to answer it when the writer has no account.

    `name` and `phone` are optional here and mandatory in the service, because which of the
    two applies depends on the caller rather than on the payload: a signed-in customer has
    both on their account and the server takes them from there. A form that could name
    somebody else is a form that puts the wrong number in front of the owner.
    """

    message: _Text = Field(min_length=1, max_length=MAX_WANTED_MESSAGE_LENGTH)
    name: _Text | None = Field(default=None, min_length=1, max_length=255)
    # Same E.164 shape the bot normalises contacts into — the owner dials this number.
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)


class WantedProductResponse(CamelModel):
    """Only the receipt. Nobody but the owner reads these, and they read them in Telegram."""

    id: uuid.UUID
    created_at: datetime
