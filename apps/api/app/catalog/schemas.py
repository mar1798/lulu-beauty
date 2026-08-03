import uuid
from typing import Generic, TypeVar

from pydantic import Field

from app.common.schemas import CamelModel

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"

T = TypeVar("T")


class PageResponse(CamelModel, Generic[T]):  # noqa: UP046 - PEP 695 generics aren't used elsewhere yet
    items: list[T]
    total: int
    page: int
    page_size: int


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
    price_cents: int
    category_id: uuid.UUID | None
    in_stock: bool
    images: list[ProductImageResponse]


class ProductCreateRequest(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    price_cents: int = Field(ge=0)
    category_id: uuid.UUID | None = None
    in_stock: bool = True


class ProductUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    category_id: uuid.UUID | None = None
    in_stock: bool | None = None
