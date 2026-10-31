import uuid
from typing import Annotated

from pydantic import Field, StringConstraints

from app.checklist.models import ChecklistExtra
from app.common.limits import MAX_ITEM_QUANTITY, MAX_PRICE_CENTS
from app.common.schemas import CamelModel

# Stripped before the length check: a name of spaces is an accidental press, not a line.
_Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class ChecklistExtraRequest(CamelModel):
    """A hand-added line. The cycle is the one the page is showing, sent back as-is."""

    cycle_id: uuid.UUID
    name: _Name
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)
    unit_price_cents: int = Field(default=0, ge=0, le=MAX_PRICE_CENTS)


class ChecklistItem(CamelModel):
    """One line of `GET /admin/checklist` — from the orders, or added by the owner."""

    product_name: str
    # None when the product row is gone: the name stays, the link does not.
    product_slug: str | None
    volume_ml: int | None
    shade: str | None = None
    brand: str
    quantity: int
    unit_price_cents: int
    # Set only on a hand-added line (`ChecklistExtra`): the one handle for removing it,
    # and what tells the page this row is not somebody's order.
    extra_id: uuid.UUID | None = None


def extra_item(extra: ChecklistExtra) -> ChecklistItem:
    # "-" is what an order line without a brand shows (`ExportService`), so the page has
    # one rule for hiding it.
    return ChecklistItem(
        product_name=extra.name,
        product_slug=None,
        volume_ml=None,
        brand="-",
        quantity=extra.quantity,
        unit_price_cents=extra.unit_price_cents,
        extra_id=extra.id,
    )
