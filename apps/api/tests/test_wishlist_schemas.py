import uuid

import pytest
from pydantic import ValidationError

from app.wishlist.schemas import AddWishlistItemRequest


def test_add_wishlist_item_accepts_camel_case_input() -> None:
    product_id = uuid.uuid4()
    request = AddWishlistItemRequest.model_validate({"productId": str(product_id)})
    assert request.product_id == product_id


def test_add_wishlist_item_requires_a_product() -> None:
    with pytest.raises(ValidationError):
        AddWishlistItemRequest.model_validate({})


def test_add_wishlist_item_has_no_quantity() -> None:
    """A wishlist line is a yes/no, not an amount — unlike a cart line."""
    assert "quantity" not in AddWishlistItemRequest.model_fields
