import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, require_admin
from app.catalog.import_service import CatalogImportService
from app.catalog.models import Category, Product
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
from app.storage.service import storage_service

router = APIRouter(tags=["catalog"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMPORT_BYTES = 10 * 1024 * 1024


def _category_response(category: Category) -> CategoryResponse:
    return CategoryResponse(
        id=category.id, name=category.name, slug=category.slug, sort_order=category.sort_order
    )


def _product_response(product: Product) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        slug=product.slug,
        description=product.description,
        price_cents=product.price_cents,
        category_id=product.category_id,
        in_stock=product.in_stock,
        deleted_at=product.deleted_at,
        images=[
            ProductImageResponse(
                id=image.id,
                url=image.url,
                alt=image.alt,
                sort_order=image.sort_order,
                is_primary=image.is_primary,
            )
            for image in product.images
        ],
    )


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(session: AsyncSession = Depends(get_session)) -> list[CategoryResponse]:
    categories = await CategoryService(session).list()
    return [_category_response(category) for category in categories]


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
    return _category_response(category)


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
    return _category_response(category)


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


@router.get("/products", response_model=PageResponse[ProductResponse])
async def list_products(
    category: str | None = Query(default=None),
    in_stock: bool | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1, max_length=255),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> PageResponse[ProductResponse]:
    products, total = await ProductService(session).list_public(
        category, in_stock, page, page_size, q
    )
    return PageResponse(
        items=[_product_response(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/products/{slug}", response_model=ProductResponse)
async def get_product(slug: str, session: AsyncSession = Depends(get_session)) -> ProductResponse:
    product = await ProductService(session).get_by_slug(slug)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found")
    return _product_response(product)


@router.get("/admin/products", response_model=PageResponse[ProductResponse])
async def list_products_admin(
    category: str | None = Query(default=None),
    in_stock: bool | None = Query(default=None, alias="inStock"),
    q: str | None = Query(default=None, min_length=1, max_length=255),
    include_deleted: bool = Query(default=False, alias="includeDeleted"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> PageResponse[ProductResponse]:
    products, total = await ProductService(session).list_admin(
        category, in_stock, page, page_size, q, include_deleted
    )
    return PageResponse(
        items=[_product_response(product) for product in products],
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
    return _product_response(product)


@router.post(
    "/admin/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED
)
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
            body.price_cents,
            body.category_id,
            body.in_stock,
        )
    except SlugAlreadyExistsError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, "slug_already_exists") from error

    await session.commit()
    return _product_response(product)


@router.patch("/admin/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdateRequest,
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

    await session.commit()
    return _product_response(product)


@router.delete("/admin/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> None:
    try:
        await ProductService(session).soft_delete(product_id)
    except ProductNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product_not_found") from error

    await session.commit()


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
    return _product_response(product)


@router.post(
    "/admin/products/{product_id}/images",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    product_id: uuid.UUID,
    file: UploadFile = File(...),
    alt: str | None = Form(default=None),
    is_primary: bool = Form(default=False, alias="isPrimary"),
    session: AsyncSession = Depends(get_session),
    _admin: CurrentUser = Depends(require_admin),
) -> ProductImageResponse:
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "unsupported_image_type")

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "image_too_large")

    try:
        service = ProductService(session)
        await service.get_by_id(product_id)  # 404 up front, before touching storage
        key = await storage_service.save(file.filename or "upload", content)
        image = await service.add_image(product_id, storage_service.url_for(key), alt, is_primary)
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
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "import_file_too_large")

    summary = await CatalogImportService(session).import_file(file.filename or "", content)
    await session.commit()
    return summary
