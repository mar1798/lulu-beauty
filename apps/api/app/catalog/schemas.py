import uuid
from datetime import datetime

from pydantic import Field

from app.common.limits import MAX_PRICE_CENTS
from app.common.schemas import CamelModel

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"


class ProductImageResponse(CamelModel):
    id: uuid.UUID
    url: str
    alt: str | None
    sort_order: int
    is_primary: bool


class CategoryResponse(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    sort_order: int


class CategoryCreateRequest(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    sort_order: int = 0


class CategoryUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    sort_order: int | None = None


class ProductResponse(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    brand: str | None
    price_cents: int
    category_id: uuid.UUID | None
    in_stock: bool
    images: list[ProductImageResponse]
    # Soft-delete marker. Public listings never surface deleted products, so this is
    # always None there; the admin listing with includeDeleted=true needs it to tell
    # a deleted row from a live one (there is no other signal in the payload).
    deleted_at: datetime | None


class ProductCreateRequest(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    brand: str | None = Field(default=None, max_length=255)
    # Upper bound is the 32-bit column behind it: without it a fat-fingered price is a
    # 500 out of the driver instead of a field error the form can point at.
    price_cents: int = Field(ge=0, le=MAX_PRICE_CENTS)
    category_id: uuid.UUID | None = None
    in_stock: bool = True


class ProductUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    brand: str | None = Field(default=None, max_length=255)
    price_cents: int | None = Field(default=None, ge=0, le=MAX_PRICE_CENTS)
    category_id: uuid.UUID | None = None
    in_stock: bool | None = None


class ImportRowErrorResponse(CamelModel):
    row: int
    message: str


class ImportSummaryResponse(CamelModel):
    created: int
    updated: int
    errors: list[ImportRowErrorResponse]
