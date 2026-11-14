import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_live_user
from app.db import get_session
from app.wishlist.schemas import (
    AddWishlistItemRequest,
    GuestWishlistRequest,
    GuestWishlistResponse,
    WishlistResponse,
)
from app.wishlist.service import (
    ProductNotFoundError,
    WishlistFullError,
    WishlistItemNotFoundError,
    WishlistService,
)

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=WishlistResponse)
async def get_wishlist(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> WishlistResponse:
    return await WishlistService(session).get_wishlist(current_user.id)


# Public, like `POST /cart/preview`: a guest's list kept in their browser, read against
# the catalogue and stored nowhere.
@router.post("/preview", response_model=GuestWishlistResponse)
async def preview_wishlist(
    body: GuestWishlistRequest,
    session: AsyncSession = Depends(get_session),
) -> GuestWishlistResponse:
    return await WishlistService(session).preview(body.product_ids)


@router.post("/merge", response_model=WishlistResponse)
async def merge_wishlist(
    body: GuestWishlistRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(require_live_user),
) -> WishlistResponse:
    wishlist = await WishlistService(session).merge(current_user.id, body.product_ids)
    await session.commit()
    return wishlist


@router.post("/items", response_model=WishlistResponse)
async def add_item(
    body: AddWishlistItemRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> WishlistResponse:
    try:
        wishlist = await WishlistService(session).add_item(current_user.id, body.product_id)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error
    except WishlistFullError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "wishlist_full") from error

    await session.commit()
    return wishlist


@router.delete("/items/{product_id}", response_model=WishlistResponse)
async def remove_item(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> WishlistResponse:
    try:
        wishlist = await WishlistService(session).remove_item(current_user.id, product_id)
    except WishlistItemNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "wishlist_item_not_found") from error

    await session.commit()
    return wishlist
