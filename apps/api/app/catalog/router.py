import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.catalog.import_service import CatalogImportService
from app.catalog.schemas import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
    ImportSummaryResponse,
    ProductCreateRequest,
    ProductImageResponse,
    ProductResponse,
    ProductUpdateRequest,
)
from app.catalog.serializers import category_response, product_response
from app.catalog.service import (
    CategoryNotFoundError,
    CategoryService,
    ProductImageNotFoundError,
    ProductNotFoundError,
    ProductService,
    SlugAlreadyExistsError,
)
from app.common.schemas import PageResponse
from app.db import get_session
from app.orders.service import OrdersService
from app.storage.service import storage_service
from app.telegram.notify import notify_orders_item_dropped, notify_orders_repriced

router = APIRouter(tags=["catalog"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
# The stored file's extension comes from this table, never from the uploaded filename:
# /files is served as static content and is same-origin with the site (next.config.js
# rewrites it), so a name like "photo.html" would be stored and later served as a page
# rather than as an image.
IMAGE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
ALLOWED_IMAGE_CONTENT_TYPES = set(IMAGE_EXTENSIONS)
MAX_IMPORT_BYTES = 10 * 1024 * 1024


async def _read_within(file: UploadFile, limit: int, code: str) -> bytes:
    """The upload's bytes, refused before they are held in memory.

    Starlette has already spooled the part to a temporary file by the time a handler runs
    and knows how long it is, so the size is answerable without reading it. Reading first
    and measuring after meant a gigabyte upload became a gigabyte `bytes` object for as
    long as it took to decide it was too big.
    """
    if file.size is not None and file.size > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, code)

    content = await file.read()
    if len(content) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, code)
    return content


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(session: AsyncSession = Depends(get_session)) -> list[CategoryResponse]:
    categories = await CategoryService(session).list()
    return [category_response(category) for category in categories]


@router.post(
    "/admin/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED
)
async def create_category(
    body: CategoryCreateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> CategoryResponse:
    try:
        category = await CategoryService(session).create(body.name, body.slug, body.sort_order)
    except SlugAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_already_exists") from error

    await session.commit()
    return category_response(category)


@router.patch("/admin/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> CategoryResponse:
    updates = body.model_dump(exclude_unset=True)
    try:
        category = await CategoryService(session).update(category_id, updates)
    except CategoryNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "category_not_found") from error
    except SlugAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_already_exists") from error

    await session.commit()
    return category_response(category)


@router.delete("/admin/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    try:
        await CategoryService(session).delete(category_id)
    except CategoryNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "category_not_found") from error

    await session.commit()


@router.get("/brands", response_model=list[str])
async def list_brands(session: AsyncSession = Depends(get_session)) -> list[str]:
    return await ProductService(session).list_brands()


@router.get("/products", response_model=PageResponse[ProductResponse])
async def list_products(
    category: str | None = Query(default=None),
    brand: str | None = Query(default=None, min_length=1, max_length=255),
    in_stock: bool | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1, max_length=255),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> PageResponse[ProductResponse]:
    products, total = await ProductService(session).list_public(
        category, in_stock, page, page_size, q, brand
    )
    return PageResponse(
        items=[product_response(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{slug}", response_model=ProductResponse)
async def get_product(slug: str, session: AsyncSession = Depends(get_session)) -> ProductResponse:
    product = await ProductService(session).get_by_slug(slug)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found")
    return product_response(product)


@router.get("/admin/brands", response_model=list[str])
async def list_brands_admin(
    include_deleted: bool = Query(default=False, alias="includeDeleted"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> list[str]:
    """Same list as the public one, but it can cover soft-deleted products.

    The admin list has a "show deleted" switch, and a brand left only on
    deleted products would otherwise be unpickable there.
    """
    return await ProductService(session).list_brands(include_deleted)


@router.get("/admin/products", response_model=PageResponse[ProductResponse])
async def list_products_admin(
    category: str | None = Query(default=None),
    brand: str | None = Query(default=None, min_length=1, max_length=255),
    in_stock: bool | None = Query(default=None, alias="inStock"),
    q: str | None = Query(default=None, min_length=1, max_length=255),
    include_deleted: bool = Query(default=False, alias="includeDeleted"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> PageResponse[ProductResponse]:
    products, total = await ProductService(session).list_admin(
        category, in_stock, page, page_size, q, include_deleted, brand
    )
    return PageResponse(
        items=[product_response(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/admin/products/{product_id}", response_model=ProductResponse)
async def get_product_by_id(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductResponse:
    try:
        product = await ProductService(session).get_by_id(product_id)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error
    return product_response(product)


@router.post("/admin/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductResponse:
    try:
        product = await ProductService(session).create(
            body.name,
            body.slug,
            body.description,
            body.brand,
            body.price_cents,
            body.category_id,
            body.in_stock,
            body.volume_ml,
        )
    except SlugAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_already_exists") from error

    await session.commit()
    return product_response(product)


@router.patch("/admin/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductResponse:
    updates = body.model_dump(exclude_unset=True)
    try:
        product = await ProductService(session).update(product_id, updates)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error
    except SlugAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_already_exists") from error

    # A price edit is not only a catalog edit: orders still awaiting confirmation quote
    # this product, and leaving them on the old price means the owner charges one number
    # while the customer sees another. Only PENDING ones move — see `reprice_product`.
    changes = (
        await OrdersService(session).reprice_product(product.id, product.price_cents)
        if "price_cents" in updates
        else []
    )

    response = product_response(product)
    await session.commit()
    background_tasks.add_task(notify_orders_repriced, changes)
    return response


@router.delete("/admin/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    try:
        await ProductService(session).soft_delete(product_id)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    # The owner isn't going to buy a discontinued product, so it leaves the orders that
    # are still waiting for their answer. Confirmed and later ones keep it: those are a
    # record of what was agreed (see `drop_product`).
    drops = await OrdersService(session).drop_product(product_id)

    await session.commit()
    background_tasks.add_task(notify_orders_item_dropped, drops)


@router.post("/admin/products/{product_id}/restore", response_model=ProductResponse)
async def restore_product(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductResponse:
    try:
        product = await ProductService(session).restore(product_id)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    await session.commit()
    return product_response(product)


@router.post(
    "/admin/products/{product_id}/images",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    alt: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductImageResponse:
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "unsupported_image_type")

    content = await _read_within(file, MAX_IMAGE_BYTES, "image_too_large")

    try:
        service = ProductService(session)
        await service.get_by_id(product_id)  # 404 up front, before touching storage
        key = await storage_service.save(f"image{IMAGE_EXTENSIONS[file.content_type]}", content)
        image = await service.add_image(product_id, storage_service.url_for(key), alt)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    await session.commit()
    return ProductImageResponse(
        id=image.id,
        url=image.url,
        alt=image.alt,
        sort_order=image.sort_order,
        is_primary=image.is_primary,
    )


@router.delete(
    "/admin/products/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    try:
        await ProductService(session).delete_image(product_id, image_id)
    except ProductImageNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_image_not_found") from error

    await session.commit()


@router.post("/admin/catalog/import", response_model=ImportSummaryResponse)
async def import_catalog(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ImportSummaryResponse:
    content = await _read_within(file, MAX_IMPORT_BYTES, "import_file_too_large")

    summary = await CatalogImportService(session).import_file(file.filename or "", content)
    await session.commit()
    return summary
