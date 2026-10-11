import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.common.limits import MAX_WANTED_MESSAGE_LENGTH
from app.common.schemas import CamelModel

# Stripped before the length check: "   " is the same accidental press as "", and without
# this it passed `min_length=1` and reached the owner as an empty wish.
_Text = Annotated[str, StringConstraints(strip_whitespace=True)]


class WantedProductRequest(CamelModel):
    """A wish, and nothing else: the contact comes off the caller's account.

    There is no name or phone field to fill in. A form that could name somebody else is a
    form that puts the wrong number in front of the owner.
    """

    message: _Text = Field(min_length=1, max_length=MAX_WANTED_MESSAGE_LENGTH)


class WantedProductResponse(CamelModel):
    """Only the receipt. Nobody but the owner reads these, and they read them in Telegram."""

    id: uuid.UUID
    created_at: datetime
