import uuid
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.banners.models import BannerKind
from app.banners.schemas import (
    AdminBannerItemResponse,
    BannerOrderRequest,
    BannerShownRequest,
    BannerSlideResponse,
    NewsBannerDetailResponse,
    NewsBannerEnabledRequest,
    NewsBannerWriteRequest,
)
from app.banners.service import (
    BannerEndsBeforeStartError,
    BannerItem,
    BannerLinkInvalidError,
    BannerNotFoundError,
    BannerOrderMismatchError,
    BannersService,
    NewsDraft,
    TooManyNewsBannersError,
    promotion_status_of,
)
from app.common.uploads import read_image
from app.db import get_session
from app.promotions.service import BannerVariant, PromotionNotFoundError
from app.storage.service import discard_files, storage_service

router = APIRouter(tags=["banners"])


def _draft(body: NewsBannerWriteRequest) -> NewsDraft:
    return NewsDraft(
        title=body.title,
        text=body.text,
        link_url=body.link_url,
        cta_label=body.cta_label,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_enabled=body.is_enabled,
    )


def slide_response(item: BannerItem) -> BannerSlideResponse:
    """A slide as the storefront draws it. A promotion's comes from the promotion itself."""
    if item.promotion is not None:
        promotion = item.promotion
        return BannerSlideResponse(
            key=item.key,
            kind=BannerKind.PROMOTION,
            title=promotion.title,
            text=None,
            image_mobile_url=promotion.banner_mobile_url,
            image_desktop_url=promotion.banner_desktop_url,
            promotion_slug=promotion.slug,
            link_url=None,
            cta_label=None,
        )
    news = item.news
    assert news is not None
    return BannerSlideResponse(
        key=item.key,
        kind=BannerKind.NEWS,
        title=news.title,
        text=news.text,
        image_mobile_url=news.image_mobile_url,
        image_desktop_url=news.image_desktop_url,
        promotion_slug=None,
        link_url=news.link_url,
        cta_label=news.cta_label,
    )


def item_response(item: BannerItem, now: datetime | None = None) -> AdminBannerItemResponse:
    moment = now or datetime.now(UTC)
    promotion, news = item.promotion, item.news
    return AdminBannerItemResponse(
        key=item.key,
        id=item.id,
        kind=item.kind,
        state=item.state,
        is_shown=item.is_shown,
        position=item.position,
        slide=slide_response(item),
        promotion_id=promotion.id if promotion is not None else None,
        promotion_status=promotion_status_of(item, moment),
        starts_at=(
            promotion.starts_at if promotion is not None else news.starts_at if news else None
        ),
        ends_at=(promotion.ends_at if promotion is not None else news.ends_at if news else None),
        news=(
            NewsBannerDetailResponse(
                title=news.title,
                text=news.text,
                link_url=news.link_url,
                cta_label=news.cta_label,
                image_mobile_url=news.image_mobile_url,
                image_desktop_url=news.image_desktop_url,
                starts_at=news.starts_at,
                ends_at=news.ends_at,
                is_enabled=news.is_enabled,
            )
            if news is not None
            else None
        ),
        created_at=item.created_at,
    )


def _error(error: Exception) -> HTTPException:
    if isinstance(error, BannerNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "banner_not_found")
    if isinstance(error, PromotionNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "promotion_not_found")
    if isinstance(error, BannerOrderMismatchError):
        return HTTPException(status.HTTP_409_CONFLICT, "banner_order_mismatch")
    if isinstance(error, TooManyNewsBannersError):
        return HTTPException(status.HTTP_409_CONFLICT, "too_many_news_banners")
    if isinstance(error, BannerEndsBeforeStartError):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "banner_ends_before_start")
    assert isinstance(error, BannerLinkInvalidError)
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "banner_link_invalid")


_ERRORS = (
    BannerNotFoundError,
    PromotionNotFoundError,
    BannerOrderMismatchError,
    TooManyNewsBannersError,
    BannerEndsBeforeStartError,
    BannerLinkInvalidError,
)


@router.get("/banners", response_model=list[BannerSlideResponse])
async def list_banner_feed(
    session: AsyncSession = Depends(get_session),
) -> list[BannerSlideResponse]:
    """The carousel's slides, in order: running promotions with a banner, and live news."""
    return [slide_response(item) for item in await BannersService(session).feed()]


@router.get("/admin/banners", response_model=list[AdminBannerItemResponse])
async def list_admin_banners(
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> list[AdminBannerItemResponse]:
    now = datetime.now(UTC)
    return [item_response(item, now) for item in await BannersService(session).admin_items(now)]


@router.patch("/admin/banners/promotions/{promotion_id}", response_model=AdminBannerItemResponse)
async def set_promotion_shown(
    promotion_id: uuid.UUID,
    body: BannerShownRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    try:
        item = await BannersService(session).set_promotion_shown(promotion_id, body.is_shown)
    except _ERRORS as error:
        raise _error(error) from error
    response = item_response(item)
    await session.commit()
    return response


@router.put("/admin/banners/order", response_model=list[AdminBannerItemResponse])
async def reorder_banners(
    body: BannerOrderRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> list[AdminBannerItemResponse]:
    service = BannersService(session)
    try:
        await service.reorder(body.keys)
    except _ERRORS as error:
        raise _error(error) from error
    now = datetime.now(UTC)
    response = [item_response(item, now) for item in await service.admin_items(now)]
    await session.commit()
    return response


@router.post(
    "/admin/banners/news",
    response_model=AdminBannerItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_news(
    body: NewsBannerWriteRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    service = BannersService(session)
    try:
        news = await service.create_news(_draft(body))
    except _ERRORS as error:
        raise _error(error) from error
    response = item_response(await service.news_item(news.id))
    await session.commit()
    return response


@router.get("/admin/banners/news/{news_id}", response_model=AdminBannerItemResponse)
async def get_news(
    news_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    try:
        return item_response(await BannersService(session).news_item(news_id))
    except _ERRORS as error:
        raise _error(error) from error


@router.put("/admin/banners/news/{news_id}", response_model=AdminBannerItemResponse)
async def update_news(
    news_id: uuid.UUID,
    body: NewsBannerWriteRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    service = BannersService(session)
    try:
        await service.update_news(news_id, _draft(body))
    except _ERRORS as error:
        raise _error(error) from error
    response = item_response(await service.news_item(news_id))
    await session.commit()
    return response


@router.patch("/admin/banners/news/{news_id}/enabled", response_model=AdminBannerItemResponse)
async def set_news_enabled(
    news_id: uuid.UUID,
    body: NewsBannerEnabledRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    service = BannersService(session)
    try:
        await service.set_news_enabled(news_id, body.is_enabled)
    except _ERRORS as error:
        raise _error(error) from error
    response = item_response(await service.news_item(news_id))
    await session.commit()
    return response


@router.delete("/admin/banners/news/{news_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news(
    news_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> Response:
    try:
        urls = await BannersService(session).delete_news(news_id)
    except _ERRORS as error:
        raise _error(error) from error
    await session.commit()
    background_tasks.add_task(discard_files, urls)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/banners/news/{news_id}/image", response_model=AdminBannerItemResponse)
async def upload_news_image(
    news_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    variant: BannerVariant = Query(),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    """Puts up the mobile or the desktop picture; the one it replaces is removed from disk."""
    compressed = await read_image(file)

    service = BannersService(session)
    try:
        await service.get_news(news_id)  # 404 before anything is written to storage
    except _ERRORS as error:
        raise _error(error) from error

    url = storage_service.url_for(
        await storage_service.save(f"news{compressed.extension}", compressed.content)
    )
    try:
        news, previous = await service.set_news_image(news_id, variant, url)
    except _ERRORS as error:
        await discard_files([url])
        raise _error(error) from error

    response = item_response(await service.news_item(news.id))
    await session.commit()
    background_tasks.add_task(discard_files, [previous] if previous else [])
    return response


@router.delete("/admin/banners/news/{news_id}/image", response_model=AdminBannerItemResponse)
async def remove_news_image(
    news_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    variant: BannerVariant = Query(),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> AdminBannerItemResponse:
    service = BannersService(session)
    try:
        news, previous = await service.remove_news_image(news_id, variant)
    except _ERRORS as error:
        raise _error(error) from error
    response = item_response(await service.news_item(news.id))
    await session.commit()
    background_tasks.add_task(discard_files, [previous] if previous else [])
    return response
