import uuid
from datetime import datetime

from app.catalog.schemas import ProductResponse
from app.common.schemas import CamelModel


class AddWishlistItemRequest(CamelModel):
    product_id: uuid.UUID


class WishlistItemResponse(CamelModel):
    """The whole product, not a flattened snapshot like a cart line.

    A wishlist line is not a promise of anything — there is no price to freeze and no
    quantity to keep — and the page that renders it is the catalog grid, which wants a
    product. Sending one keeps that page free of a second card layout.
    """

    product: ProductResponse
    added_at: datetime


class WishlistResponse(CamelModel):
    items: list[WishlistItemResponse]
