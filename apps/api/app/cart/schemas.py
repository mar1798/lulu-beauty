import uuid
from datetime import datetime

from pydantic import Field

from app.common.limits import MAX_ITEM_QUANTITY
from app.common.schemas import CamelModel


class AddCartItemRequest(CamelModel):
    # The volume, not the product: a serum sold as 30 ml and 50 ml gives the server no
    # way to guess which one the customer pressed "в корзину" on.
    variant_id: uuid.UUID
    # Same ceiling as an order line: the cart is what checkout copies into the order,
    # and a quantity the order endpoints would refuse must not get in through here.
    quantity: int = Field(default=1, ge=1, le=MAX_ITEM_QUANTITY)


class UpdateCartItemRequest(CamelModel):
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)


class CartItemResponse(CamelModel):
    # Both: the id addresses the line (`PATCH /cart/items/{variant_id}`), the product is
    # what the row links to and shows.
    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_slug: str
    product_image_url: str | None
    product_price_cents: int
    quantity: int
    line_total_cents: int
    # The same labels an order line carries, and for the same reason: the cart and the
    # order are drawn by one component, and a name alone does not tell two volumes of the
    # same toner apart — which is now the ordinary case, not an accident of the catalog.
    # Read live from the catalog — nothing here is a snapshot anyway.
    product_brand: str | None = None
    product_category_name: str | None = None
    product_volume_ml: int | None = None


class CartResponse(CamelModel):
    cycle_id: uuid.UUID | None
    cycle_deadline_at: datetime | None
    items: list[CartItemResponse]
    total_cents: int
