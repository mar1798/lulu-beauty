import uuid
from datetime import datetime

from pydantic import Field

from app.catalog.schemas import ProductResponse
from app.common.limits import MAX_WISHLIST_ITEMS
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


class GuestWishlistRequest(CamelModel):
    """Products a guest saved in their browser, newest first."""

    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_WISHLIST_ITEMS)


class GuestWishlistResponse(CamelModel):
    """The guest's saved products, in the order they were sent.

    Products only, with no `added_at`: when the guest saved each one is known to their
    browser, not to the server, and a timestamp made up here would be a lie.
    """

    products: list[ProductResponse]
