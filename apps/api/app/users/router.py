import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import (
    CurrentUser,
    get_current_user,
    require_admin,
    require_super_admin,
)
from app.auth.models import User
from app.common.schemas import PageResponse
from app.db import get_session
from app.users.schemas import (
    AdminUserResponse,
    UserResponse,
    UserRoleUpdateRequest,
    UserUpdateRequest,
)
from app.users.service import (
    SuperAdminImmutableError,
    SuperAdminNotAssignableError,
    UserNotFoundError,
    UsersService,
)

router = APIRouter(tags=["users"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        phone=user.phone,
        name=user.name,
        role=user.role,
        telegram_linked=user.telegram_chat_id is not None,
    )


def _admin_user_response(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        phone=user.phone,
        name=user.name,
        role=user.role,
        telegram_linked=user.telegram_chat_id is not None,
        created_at=user.created_at,
    )


@router.get("/users/me", response_model=UserResponse)
async def get_me(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserResponse:
    try:
        user = await UsersService(session).get(current_user.id)
    except UserNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error
    return _user_response(user)


@router.patch("/users/me", response_model=UserResponse)
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


@router.get("/admin/users", response_model=PageResponse[AdminUserResponse])
async def list_users_admin(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    # Bounded like the catalogue's `q`: the string goes into an unindexed ILIKE over
    # two columns, so an unbounded one is a free way to make the database work.
    search: str | None = Query(default=None, alias="q", max_length=255),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> PageResponse[AdminUserResponse]:
    users, total = await UsersService(session).list_page(page, page_size, search)
    return PageResponse(
        items=[_admin_user_response(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/admin/users/{user_id}/role", response_model=AdminUserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    body: UserRoleUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _super_admin: CurrentUser = Depends(require_super_admin),
) -> AdminUserResponse:
    """Grants or revokes admin rights — SUPER_ADMIN only.

    The shop can have any number of owners: notifications already go to every admin
    (`telegram/recipients.get_owners`). Who they are, though, is decided by exactly one
    account — the one the seed bootstrapped — and that account's own role is the thing
    this endpoint cannot touch at all.
    """
    try:
        user = await UsersService(session).set_role(user_id, body.role)
    except SuperAdminNotAssignableError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "super_admin_not_assignable") from error
    except SuperAdminImmutableError as error:
        # Including the caller's own row: that is what makes "the shop always has a way
        # into its panel" a property of the schema rather than of everyone's care.
        raise HTTPException(status.HTTP_409_CONFLICT, "super_admin_immutable") from error
    except UserNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user_not_found") from error

    await session.commit()
    return _admin_user_response(user)
