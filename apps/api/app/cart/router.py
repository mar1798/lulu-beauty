import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_live_user
from app.cart.schemas import (
    AddCartItemRequest,
    CartResponse,
    GuestCartRequest,
    UpdateCartItemRequest,
)
from app.cart.service import (
    CartItemNotFoundError,
    CartService,
    GuestCartCycleChangedError,
    NoActiveCycleError,
    ProductNotFoundError,
)
from app.db import get_session

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=CartResponse)
async def get_cart(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    return await CartService(session).get_cart(current_user.id)


# Public on purpose: this is the guest's cart, kept in their browser. It reads the
# catalogue and stores nothing, so it opens nothing a product page does not already show.
@router.post("/preview", response_model=CartResponse)
async def preview_cart(
    body: GuestCartRequest,
    session: AsyncSession = Depends(get_session),
) -> CartResponse:
    return await CartService(session).preview(body.items)


@router.post("/merge", response_model=CartResponse)
async def merge_cart(
    body: GuestCartRequest,
    session: AsyncSession = Depends(get_session),
    # Creates a cart, like `POST /cart/items`, so an erased account may not.
    current_user: CurrentUser = Depends(require_live_user),
) -> CartResponse:
    try:
        cart = await CartService(session).merge(current_user.id, body.items, body.cycle_id)
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except GuestCartCycleChangedError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "cart_cycle_changed") from error

    await session.commit()
    return cart


@router.post("/items", response_model=CartResponse)
async def add_item(
    body: AddCartItemRequest,
    session: AsyncSession = Depends(get_session),
    # The call that creates the cart: an account erased in the token's last minutes
    # must not start a new one (`require_live_user`).
    current_user: CurrentUser = Depends(require_live_user),
) -> CartResponse:
    try:
        cart = await CartService(session).add_item(current_user.id, body.variant_id, body.quantity)
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    await session.commit()
    return cart


# Addressed by variant: a cart holds a line per volume, so the product alone no
# longer names one.
@router.patch("/items/{variant_id}", response_model=CartResponse)
async def update_item(
    variant_id: uuid.UUID,
    body: UpdateCartItemRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    try:
        cart = await CartService(session).set_item_quantity(
            current_user.id, variant_id, body.quantity
        )
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except CartItemNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cart_item_not_found") from error

    await session.commit()
    return cart


@router.delete("/items/{variant_id}", response_model=CartResponse)
async def remove_item(
    variant_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    try:
        cart = await CartService(session).remove_item(current_user.id, variant_id)
    except CartItemNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cart_item_not_found") from error

    await session.commit()
    return cart


@router.delete("", response_model=CartResponse)
async def empty_cart(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    cart = await CartService(session).empty_cart(current_user.id)
    await session.commit()
    return cart
