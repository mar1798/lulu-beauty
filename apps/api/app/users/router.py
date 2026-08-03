from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import User
from app.db import get_session
from app.users.schemas import UserResponse, UserUpdateRequest
from app.users.service import UserNotFoundError, UsersService

router = APIRouter(prefix="/users", tags=["users"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        phone=user.phone,
        name=user.name,
        role=user.role,
        phone_verified=user.phone_verified,
        telegram_linked=user.telegram_chat_id is not None,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserResponse:
    try:
        user = await UsersService(session).get(current_user.id)
    except UserNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserResponse:
    updates = body.model_dump(exclude_unset=True)
    try:
        user = await UsersService(session).update(current_user.id, updates)
    except UserNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error

    await session.commit()
    return _user_response(user)
