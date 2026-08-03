import uuid
from datetime import datetime

from pydantic import Field

from app.common.schemas import CamelModel


class AddCartItemRequest(CamelModel):
    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)


class UpdateCartItemRequest(CamelModel):
    quantity: int = Field(ge=1)


class CartItemResponse(CamelModel):
    product_id: uuid.UUID
    product_name: str
    product_price_cents: int
    quantity: int
    line_total_cents: int


class CartResponse(CamelModel):
    cycle_id: uuid.UUID | None
    cycle_deadline_at: datetime | None
    items: list[CartItemResponse]
    total_cents: int
