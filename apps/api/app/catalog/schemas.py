import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.common.limits import MAX_PRICE_CENTS, MAX_VOLUME_ML
from app.common.schemas import CamelModel

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"


def require_brand(value: str | None) -> str:
    """Every product carries a brand — and whitespace is not one.

    Trimming happens here rather than in the service so that the length limit and the
    stored value agree on what the string is. On PATCH an omitted field means
    "unchanged", so the only way to reach this with None is an explicit `"brand": null`,
    i.e. an attempt to clear the brand — which is exactly what this rejects.
    """
    brand = (value or "").strip()
    if not brand:
        raise ValueError("brand is required")
    return brand


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
    # Optional: the admin panel no longer asks for it (nobody was arranging categories by
    # hand, and a required number in front of a two-field form was the whole friction).
    # Left in the schema because the field still exists and still orders the list — a
    # category created without one goes last, exactly as the xlsx import does it.
    sort_order: int | None = None


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
    volume_ml: int | None
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
    brand: str = Field(min_length=1, max_length=255)
    # Upper bound is the 32-bit column behind it: without it a fat-fingered price is a
    # 500 out of the driver instead of a field error the form can point at.
    price_cents: int = Field(ge=0, le=MAX_PRICE_CENTS)
    # Millilitres, optional — see Product.volume_ml. Zero is refused rather than treated
    # as "unknown": that is what None is for, and «0 мл» on a card is nonsense.
    volume_ml: int | None = Field(default=None, gt=0, le=MAX_VOLUME_ML)
    category_id: uuid.UUID | None = None
    in_stock: bool = True

    @field_validator("brand")
    @classmethod
    def _validate_brand(cls, value: str) -> str:
        return require_brand(value)


class ProductUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    # None is the "field omitted" default, not a permitted value: a product that has a
    # brand can be given another one, never left without.
    brand: str | None = Field(default=None, max_length=255)
    price_cents: int | None = Field(default=None, ge=0, le=MAX_PRICE_CENTS)
    # Unlike `brand`, None here *is* a permitted value: a volume can be wiped off a
    # product that never had one to begin with.
    volume_ml: int | None = Field(default=None, gt=0, le=MAX_VOLUME_ML)
    category_id: uuid.UUID | None = None
    in_stock: bool | None = None

    @field_validator("brand")
    @classmethod
    def _validate_brand(cls, value: str | None) -> str:
        return require_brand(value)


class ImportRowErrorResponse(CamelModel):
    row: int
    message: str


class ImportSummaryResponse(CamelModel):
    created: int
    updated: int
    errors: list[ImportRowErrorResponse]
