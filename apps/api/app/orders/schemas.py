import uuid
from datetime import datetime

from pydantic import Field

from app.common.schemas import CamelModel
from app.orders.models import OrderStatus


class CheckoutRequest(CamelModel):
    note: str | None = Field(default=None, max_length=2000)


class OrderStatusUpdateRequest(CamelModel):
    status: OrderStatus


class OrderItemResponse(CamelModel):
    product_id: uuid.UUID | None
    product_name: str
    product_price_cents: int
    quantity: int
    line_total_cents: int


class OrderResponse(CamelModel):
    id: uuid.UUID
    cycle_id: uuid.UUID
    status: OrderStatus
    total_cents: int
    note: str | None
    created_at: datetime
    items: list[OrderItemResponse]
