import uuid

import pytest
from pydantic import ValidationError

from app.cart.schemas import CartResponse
from app.orders.schemas import OrderEditPreviewRequest


def test_an_edit_preview_names_a_line_or_a_volume_not_both_and_not_neither() -> None:
    line, volume = uuid.uuid4(), uuid.uuid4()

    OrderEditPreviewRequest(revision=0, item_id=line, quantity=0)
    OrderEditPreviewRequest(revision=0, variant_id=volume, quantity=1)
    with pytest.raises(ValidationError):
        OrderEditPreviewRequest(revision=0, quantity=1)
    with pytest.raises(ValidationError):
        OrderEditPreviewRequest(revision=0, item_id=line, variant_id=volume, quantity=1)


def test_a_volume_cannot_be_added_at_zero() -> None:
    with pytest.raises(ValidationError):
        OrderEditPreviewRequest(revision=0, variant_id=uuid.uuid4(), quantity=0)


def test_a_cart_without_promotions_still_carries_the_empty_block() -> None:
    cart = CartResponse(cycle_id=None, cycle_deadline_at=None, items=[], total_cents=0)

    dumped = cart.model_dump(by_alias=True)

    assert dumped["promotions"] == {
        "applied": [],
        "hints": [],
        "gifts": [],
        "itemsDiscountCents": 0,
        "orderDiscountCents": 0,
        "discountCents": 0,
        "payableCents": 0,
    }
