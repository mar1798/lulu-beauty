import uuid
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_super_admin
from app.common.uploads import read_image
from app.db import get_session
from app.promotions.models import Promotion, promotion_status
from app.promotions.rules import load_conditions, load_rewards
from app.promotions.schemas import (
    GiftImageResponse,
    PromotionEnabledRequest,
    PromotionParticipantResponse,
    PromotionResponse,
    PromotionWriteRequest,
    PublicPromotionResponse,
)
from app.promotions.service import (
    BannerVariant,
    PromotionCodeWindowPastError,
    PromotionDraft,
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
    PromotionNotFoundError,
    PromotionSlugTakenError,
    PromotionsService,
)
from app.storage.service import discard_files, storage_service

router = APIRouter(tags=["promotions"])


def _draft(body: PromotionWriteRequest) -> PromotionDraft:
    return PromotionDraft(
        slug=body.slug,
        title=body.title,
        description_html=body.description_html,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_enabled=body.is_enabled,
        announce=body.announce,
        sort_order=body.sort_order,
        conditions=body.conditions,
        rewards=body.rewards,
    )


def promotion_response(
    promotion: Promotion, participants_count: int, now: datetime | None = None
) -> PromotionResponse:
    return PromotionResponse(
        id=promotion.id,
        slug=promotion.slug,
        title=promotion.title,
        description_html=promotion.description_html,
        banner_mobile_url=promotion.banner_mobile_url,
        banner_desktop_url=promotion.banner_desktop_url,
        starts_at=promotion.starts_at,
        ends_at=promotion.ends_at,
        is_enabled=promotion.is_enabled,
        announce=promotion.announce,
        announced_at=promotion.announced_at,
        sort_order=promotion.sort_order,
        conditions=load_conditions(promotion.conditions),
        rewards=load_rewards(promotion.rewards),
        status=promotion_status(promotion, now or datetime.now(UTC)),
        participants_count=participants_count,
        deleted_at=promotion.deleted_at,
        created_at=promotion.created_at,
        updated_at=promotion.updated_at,
    )


async def _respond(service: PromotionsService, promotion: Promotion) -> PromotionResponse:
    counts = await service.participant_counts([promotion.id])
    return promotion_response(promotion, counts.get(promotion.id, 0))


def public_promotion_response(promotion: Promotion) -> PublicPromotionResponse:
    return PublicPromotionResponse(
        id=promotion.id,
        slug=promotion.slug,
        title=promotion.title,
        description_html=promotion.description_html,
        banner_mobile_url=promotion.banner_mobile_url,
        banner_desktop_url=promotion.banner_desktop_url,
        starts_at=promotion.starts_at,
        ends_at=promotion.ends_at,
        conditions=load_conditions(promotion.conditions),
        rewards=load_rewards(promotion.rewards),
    )


def _write_error(error: Exception) -> HTTPException:
    if isinstance(error, PromotionNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "promotion_not_found")
    if isinstance(error, PromotionSlugTakenError):
        return HTTPException(status.HTTP_409_CONFLICT, "promotion_slug_taken")
    if isinstance(error, PromotionEndsBeforeStartError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "promotion_ends_before_start")
    if isinstance(error, PromotionCodeWindowPastError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "promotion_code_window_past")
    assert isinstance(error, PromotionInvalidRulesError)
    return HTTPException(status.HTTP_409_CONFLICT, "promotion_invalid_rules")


_WRITE_ERRORS = (
    PromotionNotFoundError,
    PromotionSlugTakenError,
    PromotionCodeWindowPastError,
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
)


@router.get("/promotions", response_model=list[PublicPromotionResponse])
async def list_public_promotions(
    session: AsyncSession = Depends(get_session),
) -> list[PublicPromotionResponse]:
    """Running promotions for the carousel and the sitemap; the site drops ones without a banner."""
    promotions = await PromotionsService(session).list_active()
    return [public_promotion_response(promotion) for promotion in promotions]


@router.get("/promotions/{slug}", response_model=PublicPromotionResponse)
async def get_public_promotion(
    slug: str, session: AsyncSession = Depends(get_session)
) -> PublicPromotionResponse:
    """A finished, switched-off, archived or not-yet-started promotion is a plain 404."""
    try:
        promotion = await PromotionsService(session).get_active(slug)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    return public_promotion_response(promotion)


@router.post("/admin/promotions/gift-image", response_model=GiftImageResponse)
async def upload_gift_image(
    file: UploadFile = File(...),
    _admin: CurrentUser = Depends(require_super_admin),
) -> GiftImageResponse:
    """Stores the picture of a free gift and hands back its address.

    The promotion is not saved yet when the admin picks the file (the form holds the
    gift as a row), so this writes nothing to the database: the address goes into the
    reward on the next save, where `GiftReward` accepts only our own storage. A picture
    the admin then abandons stays in storage, like any uploaded-but-unsaved file.
    """
    compressed = await read_image(file)
    url = storage_service.url_for(
        await storage_service.save(f"gift{compressed.extension}", compressed.content)
    )
    return GiftImageResponse(url=url)


@router.get("/admin/promotions", response_model=list[PromotionResponse])
async def list_promotions(
    include_deleted: bool = Query(default=False, alias="includeDeleted"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> list[PromotionResponse]:
    service = PromotionsService(session)
    promotions = await service.list_all(include_deleted=include_deleted)
    counts = await service.participant_counts([promotion.id for promotion in promotions])
    now = datetime.now(UTC)
    return [
        promotion_response(promotion, counts.get(promotion.id, 0), now) for promotion in promotions
    ]


@router.post(
    "/admin/promotions", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED
)
async def create_promotion(
    body: PromotionWriteRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    service = PromotionsService(session)
    try:
        promotion = await service.create(_draft(body))
    except _WRITE_ERRORS as error:
        raise _write_error(error) from error
    response = promotion_response(promotion, 0)
    await session.commit()
    return response


@router.get("/admin/promotions/{promotion_id}", response_model=PromotionResponse)
async def get_promotion(
    promotion_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    service = PromotionsService(session)
    try:
        promotion = await service.get(promotion_id)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    return await _respond(service, promotion)


@router.put("/admin/promotions/{promotion_id}", response_model=PromotionResponse)
async def update_promotion(
    promotion_id: uuid.UUID,
    body: PromotionWriteRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    service = PromotionsService(session)
    try:
        promotion = await service.update(promotion_id, _draft(body))
    except _WRITE_ERRORS as error:
        raise _write_error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    return response


@router.patch("/admin/promotions/{promotion_id}/enabled", response_model=PromotionResponse)
async def set_promotion_enabled(
    promotion_id: uuid.UUID,
    body: PromotionEnabledRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    service = PromotionsService(session)
    try:
        promotion = await service.set_enabled(promotion_id, body.is_enabled)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    return response


@router.delete("/admin/promotions/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(
    promotion_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> None:
    """Deletes it, or archives it when somebody already took part — see the service."""
    try:
        deletion = await PromotionsService(session).delete(promotion_id)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    await session.commit()
    background_tasks.add_task(discard_files, deletion.orphaned_urls)


@router.post("/admin/promotions/{promotion_id}/banner", response_model=PromotionResponse)
async def upload_promotion_banner(
    promotion_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    variant: BannerVariant = Query(),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    """Puts up the mobile or the desktop banner; the one it replaces is removed from disk."""
    compressed = await read_image(file)

    service = PromotionsService(session)
    try:
        await service.get(promotion_id)  # 404 before anything is written to storage
    except PromotionNotFoundError as error:
        raise _write_error(error) from error

    url = storage_service.url_for(
        await storage_service.save(f"banner{compressed.extension}", compressed.content)
    )
    try:
        promotion, previous = await service.set_banner(promotion_id, variant, url)
    except PromotionNotFoundError as error:
        await discard_files([url])
        raise _write_error(error) from error

    response = await _respond(service, promotion)
    await session.commit()
    background_tasks.add_task(discard_files, [previous] if previous else [])
    return response


@router.delete("/admin/promotions/{promotion_id}/banner", response_model=PromotionResponse)
async def remove_promotion_banner(
    promotion_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    variant: BannerVariant = Query(),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> PromotionResponse:
    service = PromotionsService(session)
    try:
        promotion, previous = await service.remove_banner(promotion_id, variant)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    response = await _respond(service, promotion)
    await session.commit()
    background_tasks.add_task(discard_files, [previous] if previous else [])
    return response


@router.get(
    "/admin/promotions/{promotion_id}/participants",
    response_model=list[PromotionParticipantResponse],
)
async def list_promotion_participants(
    promotion_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_super_admin),
) -> list[PromotionParticipantResponse]:
    try:
        participants = await PromotionsService(session).participants(promotion_id)
    except PromotionNotFoundError as error:
        raise _write_error(error) from error
    return [
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
    ]
