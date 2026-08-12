import uuid
from datetime import datetime

from pydantic import Field

from app.common.limits import MAX_ITEM_QUANTITY
from app.common.schemas import CamelModel


class AddCartItemRequest(CamelModel):
    product_id: uuid.UUID
    # Same ceiling as an order line: the cart is what checkout copies into the order,
    # and a quantity the order endpoints would refuse must not get in through here.
    quantity: int = Field(default=1, ge=1, le=MAX_ITEM_QUANTITY)


class UpdateCartItemRequest(CamelModel):
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class CartItemResponse(CamelModel):
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    product_image_url: str | None
    product_price_cents: int
    quantity: int
    line_total_cents: int


class CartResponse(CamelModel):
    cycle_id: uuid.UUID | None
    cycle_deadline_at: datetime | None
    items: list[CartItemResponse]
    total_cents: int
