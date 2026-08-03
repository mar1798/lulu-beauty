import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cart.models import Cart
from app.cart.service import (
    CartItemNotFoundError,
    CartService,
    NoActiveCycleError,
    ProductNotFoundError,
)
from tests.integration.factories import (
    make_cycle,
    make_product,
    make_product_image,
    make_user,
)


async def test_get_cart_before_any_add_does_not_persist_a_cart_row(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)

    response = await CartService(db_session).get_cart(user.id)

    assert response.items == []
    carts = (await db_session.execute(select(Cart))).scalars().all()
    assert carts == []


async def test_add_item_creates_cart_lazily_and_merges_quantity(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, price_cents=1500)

    await CartService(db_session).add_item(user.id, product.id, 2)
    response = await CartService(db_session).add_item(user.id, product.id, 1)

    assert len(response.items) == 1
    assert response.items[0].quantity == 3
    assert response.total_cents == 4500
    carts = (await db_session.execute(select(Cart))).scalars().all()
    assert len(carts) == 1


async def test_add_item_without_active_cycle_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    product = await make_product(db_session)

    with pytest.raises(NoActiveCycleError):
        await CartService(db_session).add_item(user.id, product.id, 1)


async def test_add_item_unknown_product_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)

    with pytest.raises(ProductNotFoundError):
        await CartService(db_session).add_item(user.id, uuid.uuid4(), 1)


async def test_empty_cart_clears_items_but_keeps_cart_row(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)
    service = CartService(db_session)
    await service.add_item(user.id, product.id, 1)

    response = await service.empty_cart(user.id)

    assert response.items == []
    carts = (await db_session.execute(select(Cart))).scalars().all()
    assert len(carts) == 1


async def test_remove_item_not_found_raises(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)

    with pytest.raises(CartItemNotFoundError):
        await CartService(db_session).remove_item(user.id, uuid.uuid4())


async def test_cart_items_carry_slug_and_primary_image(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, slug="rose-serum")
    await make_product_image(db_session, product, url="secondary.jpg", sort_order=1)
    await make_product_image(db_session, product, url="primary.jpg", sort_order=2, is_primary=True)

    response = await CartService(db_session).add_item(user.id, product.id, 1)

    assert response.items[0].product_slug == "rose-serum"
    assert response.items[0].product_image_url == "primary.jpg"


async def test_cart_item_image_is_none_for_product_without_images(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session)

    response = await CartService(db_session).add_item(user.id, product.id, 1)

    assert response.items[0].product_image_url is None


async def test_set_item_quantity_without_active_cycle_raises_no_active_cycle(
    db_session: AsyncSession,
) -> None:
    """Regression: this used to surface as cart_item_not_found, hiding the real cause."""
    user = await make_user(db_session)
    product = await make_product(db_session)

    with pytest.raises(NoActiveCycleError):
        await CartService(db_session).set_item_quantity(user.id, product.id, 2)
