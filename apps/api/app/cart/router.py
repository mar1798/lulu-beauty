import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.cart.schemas import AddCartItemRequest, CartResponse, UpdateCartItemRequest
from app.cart.service import (
    CartItemNotFoundError,
    CartService,
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


@router.post("/items", response_model=CartResponse)
async def add_item(
    body: AddCartItemRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    try:
        cart = await CartService(session).add_item(current_user.id, body.product_id, body.quantity)
    except NoActiveCycleError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "no_active_cycle") from error
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    await session.commit()
    return cart


@router.patch("/items/{product_id}", response_model=CartResponse)
async def update_item(
    product_id: uuid.UUID,
    body: UpdateCartItemRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    try:
        cart = await CartService(session).set_item_quantity(
            current_user.id, product_id, body.quantity
        )
    except (NoActiveCycleError, CartItemNotFoundError) as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cart_item_not_found") from error

    await session.commit()
    return cart


@router.delete("/items/{product_id}", response_model=CartResponse)
async def remove_item(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> CartResponse:
    try:
        cart = await CartService(session).remove_item(current_user.id, product_id)
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
