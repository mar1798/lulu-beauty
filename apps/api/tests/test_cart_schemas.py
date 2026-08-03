import uuid

import pytest
from pydantic import ValidationError

from app.cart.schemas import AddCartItemRequest, UpdateCartItemRequest


def test_add_cart_item_defaults_quantity_to_one() -> None:
    request = AddCartItemRequest(product_id=uuid.uuid4())
    assert request.quantity == 1


def test_add_cart_item_accepts_camel_case_input() -> None:
    product_id = uuid.uuid4()
    request = AddCartItemRequest.model_validate({"productId": str(product_id), "quantity": 3})
    assert request.product_id == product_id
    assert request.quantity == 3


@pytest.mark.parametrize("quantity", [0, -1])
def test_add_cart_item_rejects_non_positive_quantity(quantity: int) -> None:
    with pytest.raises(ValidationError):
        AddCartItemRequest(product_id=uuid.uuid4(), quantity=quantity)


def test_update_cart_item_requires_quantity() -> None:
    with pytest.raises(ValidationError):
        UpdateCartItemRequest.model_validate({})


@pytest.mark.parametrize("quantity", [0, -5])
def test_update_cart_item_rejects_non_positive_quantity(quantity: int) -> None:
    with pytest.raises(ValidationError):
        UpdateCartItemRequest(quantity=quantity)
