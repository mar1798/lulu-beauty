"""`/admin/promo-codes`: the owner creates, edits and switches off promo codes.

All routes are the owner's (`require_super_admin`), like promotions. The service does the
work; each route commits after it.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_super_admin
from app.auth.models import User
from app.common.schemas import PageResponse
from app.db import get_session
from app.promotions.code_errors import PromoCodeError
from app.promotions.models import Promotion, promotion_status
from app.promotions.owner_code_schemas import (
    AdminPromoCodeResponse,
    AssignedUserResponse,
    PromoCodeWriteRequest,
)
from app.promotions.owner_codes import OwnerCodeDraft, OwnerCodesService, handed_to
from app.promotions.rules import load_code_rewards, load_conditions, load_rewards
from app.promotions.schemas import (
    PromotionDeletionResponse,
    PromotionEnabledRequest,
    PromotionParticipantResponse,
)
from app.promotions.service import (
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
    PromotionNotFoundError,
)
from app.telegram.notify import notify_personal_promo_code

router = APIRouter(prefix="/admin/promo-codes", tags=["admin-promo-codes"])


def _tell(
    background_tasks: BackgroundTasks, promotion: Promotion, user_id: uuid.UUID | None
) -> None:
    """Queues the bot's message to the customer a write gave a personal code to. Call it
    after the commit: the task runs once the response is out."""
    if user_id is not None:
        background_tasks.add_task(notify_personal_promo_code, promotion.id, user_id)


def _draft(body: PromoCodeWriteRequest) -> OwnerCodeDraft:
    return OwnerCodeDraft(
        code=body.code,
        title=body.title,
        description_html=body.description_html,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_enabled=body.is_enabled,
        assigned_user_id=body.assigned_user_id,
        conditions=body.conditions,
        rewards=body.rewards,
    )


def _error(error: Exception) -> HTTPException:
    if isinstance(error, PromoCodeError):
        return HTTPException(error.status_code, error.code)
    if isinstance(error, PromotionNotFoundError):
        # Also an automatic promotion's id: that is not a promo code.
        return HTTPException(status.HTTP_404_NOT_FOUND, "promo_code_not_found")
    if isinstance(error, PromotionEndsBeforeStartError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "promotion_ends_before_start")
    assert isinstance(error, PromotionInvalidRulesError)
    return HTTPException(status.HTTP_409_CONFLICT, "promotion_invalid_rules")


_ERRORS = (
    PromoCodeError,
    PromotionNotFoundError,
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
)


def _response(
    promotion: Promotion, users: dict[uuid.UUID, User], participants_count: int, now: datetime
) -> AdminPromoCodeResponse:
    assert promotion.code is not None
    user = users.get(promotion.assigned_user_id) if promotion.assigned_user_id else None
    return AdminPromoCodeResponse(
        id=promotion.id,
        code=promotion.code,
        title=promotion.title,
        description_html=promotion.description_html,
        starts_at=promotion.starts_at,
        ends_at=promotion.ends_at,
        is_enabled=promotion.is_enabled,
        assigned_user=(
            AssignedUserResponse(
                id=user.id,
                name=user.name,
                phone=user.phone,
                telegram_linked=user.telegram_chat_id is not None,
                is_deleted=user.deleted_at is not None,
            )
            if user is not None
            else None
        ),
        conditions=load_conditions(promotion.conditions),
        rewards=load_code_rewards(promotion.rewards),
        status=promotion_status(promotion, now),
        participants_count=participants_count,
        deleted_at=promotion.deleted_at,
        created_at=promotion.created_at,
        updated_at=promotion.updated_at,
    )


async def _respond(service: OwnerCodesService, promotion: Promotion) -> AdminPromoCodeResponse:
    counts = await service.participant_counts([promotion.id])
    users = await service.users_of([promotion])
    return _response(promotion, users, counts.get(promotion.id, 0), datetime.now(UTC))


@router.get("", response_model=list[AdminPromoCodeResponse])
async def list_promo_codes(
    include_deleted: bool = Query(default=False, alias="includeDeleted"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> list[AdminPromoCodeResponse]:
    service = OwnerCodesService(session)
    promotions = await service.list_all(include_deleted=include_deleted)
    counts = await service.participant_counts([p.id for p in promotions])
    users = await service.users_of(promotions)
    now = datetime.now(UTC)
    return [_response(p, users, counts.get(p.id, 0), now) for p in promotions]


@router.post("", response_model=AdminPromoCodeResponse, status_code=status.HTTP_201_CREATED)
async def create_promo_code(
    body: PromoCodeWriteRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> AdminPromoCodeResponse:
    service = OwnerCodesService(session)
    try:
        promotion = await service.create(_draft(body))
    except _ERRORS as error:
        raise _error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    _tell(background_tasks, promotion, handed_to(promotion))
    return response


@router.get("/{promo_code_id}", response_model=AdminPromoCodeResponse)
async def get_promo_code(
    promo_code_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> AdminPromoCodeResponse:
    service = OwnerCodesService(session)
    try:
        promotion = await service.get(promo_code_id)
    except PromotionNotFoundError as error:
        raise _error(error) from error
    return await _respond(service, promotion)


@router.put("/{promo_code_id}", response_model=AdminPromoCodeResponse)
async def update_promo_code(
    promo_code_id: uuid.UUID,
    body: PromoCodeWriteRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> AdminPromoCodeResponse:
    service = OwnerCodesService(session)
    try:
        before = await service.get(promo_code_id)
        was_user_id, was_enabled = before.assigned_user_id, before.is_enabled
        promotion = await service.update(promo_code_id, _draft(body))
    except _ERRORS as error:
        raise _error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    _tell(
        background_tasks,
        promotion,
        handed_to(promotion, was_user_id=was_user_id, was_enabled=was_enabled),
    )
    return response


@router.patch("/{promo_code_id}/enabled", response_model=AdminPromoCodeResponse)
async def set_promo_code_enabled(
    promo_code_id: uuid.UUID,
    body: PromotionEnabledRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> AdminPromoCodeResponse:
    service = OwnerCodesService(session)
    try:
        before = await service.get(promo_code_id)
        was_user_id, was_enabled = before.assigned_user_id, before.is_enabled
        promotion = await service.set_enabled(promo_code_id, body.is_enabled)
    except PromotionNotFoundError as error:
        raise _error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    _tell(
        background_tasks,
        promotion,
        handed_to(promotion, was_user_id=was_user_id, was_enabled=was_enabled),
    )
    return response


@router.delete("/{promo_code_id}", response_model=PromotionDeletionResponse)
async def delete_promo_code(
    promo_code_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionDeletionResponse:
    """Deletes a code nobody used; archives one somebody did (its string stays taken).

    `deleted` says which of the two happened.
    """
    try:
        deletion = await OwnerCodesService(session).delete(promo_code_id)
    except PromotionNotFoundError as error:
        raise _error(error) from error
    await session.commit()
    return PromotionDeletionResponse(deleted=deletion.deleted)


@router.get(
    "/{promo_code_id}/participants", response_model=PageResponse[PromotionParticipantResponse]
)
async def list_promo_code_participants(
    promo_code_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PageResponse[PromotionParticipantResponse]:
    try:
        participants, total = await OwnerCodesService(session).participants(
            promo_code_id, page, page_size
        )
    except PromotionNotFoundError as error:
        raise _error(error) from error
    return PageResponse[PromotionParticipantResponse](
        items=[
            PromotionParticipantResponse(
                order_promotion_id=row.participation.id,
                order_id=row.order.id,
                user_id=row.user.id,
                user_name=row.user.name,
                order_status=row.order.status,
                order_total_cents=row.order.total_cents,
                rewards=load_rewards(row.participation.rewards),
                released_at=row.participation.released_at,
                created_at=row.participation.created_at,
            )
            for row in participants
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
