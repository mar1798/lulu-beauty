import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, field_validator

from app.catalog.rich_text import html_to_text
from app.catalog.shades import ShadeLabel, normalize_shade
from app.common.limits import (
    MAX_DESCRIPTION_HTML_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_IMAGE_ALT_LENGTH,
    MAX_PRICE_CENTS,
    MAX_PRODUCT_IMAGES,
    MAX_PRODUCT_VARIANTS,
    MAX_SHADE_LENGTH,
    MAX_VOLUME_ML,
)
from app.common.schemas import CamelModel, require_not_null

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


def require_description_length(value: str | None) -> str | None:
    """The editor's HTML, refused when the text in it is longer than a description may be.

    Counted on the text rather than the markup, and without the line breaks between
    blocks — exactly the way the form's counter counts it. A limit on the HTML would let a
    plain description be longer than a formatted one, and counting the breaks would make
    the two sides disagree over how a list or a heading splits into lines. The raw size is
    capped separately by `max_length` on the field, before this parses it.
    """
    if value is not None and len(html_to_text(value).replace("\n", "")) > MAX_DESCRIPTION_LENGTH:
        raise ValueError(f"description is longer than {MAX_DESCRIPTION_LENGTH} characters")
    return value


def require_shade(value: str | None) -> str | None:
    """A shade name as it is stored — trimmed, inner spaces collapsed, None if blank.

    Normalised here rather than in the service so that the length limit and the stored
    value agree on what the string is, as `require_brand` does for the brand.
    """
    shade = normalize_shade(value)
    if shade is not None and len(shade) > MAX_SHADE_LENGTH:
        raise ValueError(f"shade is longer than {MAX_SHADE_LENGTH} characters")
    return shade


class ProductImageResponse(CamelModel):
    id: uuid.UUID
    url: str
    alt: str | None
    sort_order: int
    is_primary: bool
    # Which variants the photo shows; empty is "any". See `ProductImage.volumes_ml`.
    volumes_ml: list[int] = Field(default_factory=list)
    shades: list[str] = Field(default_factory=list)
    # Shown for no variant; only the admin endpoints ever return such a photo.
    hidden: bool = False


class ProductVariantResponse(CamelModel):
    """One variant of a product — a volume, a shade, or both — as the storefront offers it.

    `id` is what the cart is told about — the customer picks a variant, not a product.
    """

    id: uuid.UUID
    volume_ml: int | None
    shade: str | None = None
    price_cents: int
    in_stock: bool


class ProductVariantRequest(CamelModel):
    """One row of the owner's variants table.

    The list is reconciled against the product by `id` when the row carries one, and by
    (volume, shade) otherwise (see `ProductService._apply_specs`), so the form sends what
    it shows and the server keeps the rows that survive.
    """

    id: uuid.UUID | None = None
    volume_ml: int | None = Field(default=None, gt=0, le=MAX_VOLUME_ML)
    shade: str | None = None
    price_cents: int = Field(ge=0, le=MAX_PRICE_CENTS)
    in_stock: bool = True

    @field_validator("shade")
    @classmethod
    def _validate_shade(cls, value: str | None) -> str | None:
        return require_shade(value)


class ProductImageArrangementRequest(CamelModel):
    """One photo in the gallery the owner saves: which one, and which variants it shows."""

    id: uuid.UUID
    # Bounded by the variants: a tag names a volume or a shade some variant has.
    volumes_ml: list[Annotated[int, Field(gt=0, le=MAX_VOLUME_ML)]] = Field(
        default_factory=list, max_length=MAX_PRODUCT_VARIANTS
    )
    shades: list[str] = Field(default_factory=list, max_length=MAX_PRODUCT_VARIANTS)
    # Shown for no variant — see `ProductImage.hidden`; the lists are ignored then.
    hidden: bool = False
    # Optional so that a client sending only the order and tags keeps every photo's alt;
    # sent as null or blank, it clears it (see `ImageArrangement.alt_given`).
    alt: str | None = Field(default=None, max_length=MAX_IMAGE_ALT_LENGTH)

    @field_validator("shades")
    @classmethod
    def _validate_shades(cls, value: list[str]) -> list[str]:
        return [shade for shade in map(require_shade, value) if shade is not None]

    @field_validator("alt")
    @classmethod
    def _validate_alt(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class ProductImagesArrangeRequest(CamelModel):
    """The whole gallery in its new order — every photo the product has, each once.

    Whole rather than per photo, because the order is a property of the list: moving
    one photo moves the others, and two requests racing to do it would leave positions
    neither of them asked for.
    """

    images: list[ProductImageArrangementRequest] = Field(max_length=MAX_PRODUCT_IMAGES)


class CategoryResponse(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    sort_order: int
    # The section this category sits in; None for a section (or a category with no
    # subcategories, which is the same thing to every reader).
    parent_id: uuid.UUID | None


class CategoryCreateRequest(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    # Optional: the admin panel no longer asks for it (nobody was arranging categories by
    # hand, and a required number in front of a two-field form was the whole friction).
    # Left in the schema because the field still exists and still orders the list — a
    # category created without one goes last, exactly as the xlsx import does it.
    sort_order: int | None = None
    parent_id: uuid.UUID | None = None


class CategoryUpdateRequest(CamelModel):
    # All three default to None to mean "omitted, leave it alone"; all three sit on NOT
    # NULL columns, so an explicit `null` is refused rather than assigned (see
    # `require_not_null`).
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    sort_order: int | None = None
    # Unlike the three above, `null` is a value here: it moves a subcategory back to the
    # top level. Omitted still means "leave it alone".
    parent_id: uuid.UUID | None = None

    @field_validator("name", "slug", "sort_order", mode="before")
    @classmethod
    def _reject_null(cls, value: object) -> object:
        return require_not_null(value)


class ProductResponse(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    # Plain text, for anything that shows the description outside the product page.
    description: str | None
    # The formatted description the product page renders; None when it was never written
    # in the editor, and the page falls back to `description`.
    description_html: str | None
    brand: str | None
    price_cents: int
    volume_ml: int | None
    category_id: uuid.UUID | None
    in_stock: bool
    # Pinned by the owner to the home page's hero (at most `MAX_FEATURED_PRODUCTS`).
    is_featured: bool
    # What the variants' shades are called on the page — "Тон", "Цвет" (see `ShadeLabel`).
    shade_label: ShadeLabel
    images: list[ProductImageResponse]
    # Every volume the product is sold in, in the order the owner arranged them
    # (`sort_order`) — not by price: the selector on the page is read left to right as a
    # size ladder, and sorting it by price would reshuffle the buttons the moment one of
    # them is repriced. Never empty: a product always has at least one variant, and a
    # product sold in one form has exactly one — which is what lets the storefront draw
    # the selector only when there is something to select, without a second field
    # telling it so.
    variants: list[ProductVariantResponse] = []
    # Soft-delete marker. Public listings never surface deleted products, so this is
    # always None there; the admin listing with includeDeleted=true needs it to tell
    # a deleted row from a live one (there is no other signal in the payload).
    deleted_at: datetime | None
    # When the product first appeared in the catalogue — what "newest first" sorts by,
    # and the date the admin table shows next to it so that order can be read.
    created_at: datetime
    # When the row last changed. The sitemap writes it as <lastmod>, which is the one
    # tag a search engine holds against the whole file if it turns out to be invented —
    # so it is the database's value or nothing.
    updated_at: datetime


class ProductCreateRequest(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    # What the admin editor sends. When present it wins over `description`, which the
    # server then derives from it — see `catalog/rich_text.py`.
    description_html: str | None = Field(default=None, max_length=MAX_DESCRIPTION_HTML_LENGTH)
    brand: str = Field(min_length=1, max_length=255)
    # Upper bound is the 32-bit column behind it: without it a fat-fingered price is a
    # 500 out of the driver instead of a field error the form can point at.
    price_cents: int = Field(ge=0, le=MAX_PRICE_CENTS)
    # Millilitres, optional — see Product.volume_ml. Zero is refused rather than treated
    # as "unknown": that is what None is for, and «0 мл» on a card is nonsense.
    volume_ml: int | None = Field(default=None, gt=0, le=MAX_VOLUME_ML)
    category_id: uuid.UUID | None = None
    in_stock: bool = True
    # Past the limit this is a 409 `featured_limit_reached`, not a quiet `false`.
    is_featured: bool = False
    shade_label: ShadeLabel = ShadeLabel.TONE
    # Omitted means "sold in one form", described by price_cents/volume_ml/in_stock
    # above — the shape the xlsx import sends and the shape most products have.
    variants: list[ProductVariantRequest] | None = Field(
        default=None, min_length=1, max_length=MAX_PRODUCT_VARIANTS
    )

    @field_validator("brand")
    @classmethod
    def _validate_brand(cls, value: str) -> str:
        return require_brand(value)

    @field_validator("description_html")
    @classmethod
    def _validate_description_html(cls, value: str | None) -> str | None:
        return require_description_length(value)


class ProductUpdateRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=255, pattern=SLUG_PATTERN)
    description: str | None = None
    # As on create: present means the editor wrote the description, and `description` is
    # derived from it. `null` clears both.
    description_html: str | None = Field(default=None, max_length=MAX_DESCRIPTION_HTML_LENGTH)
    # None is the "field omitted" default, not a permitted value: a product that has a
    # brand can be given another one, never left without.
    brand: str | None = Field(default=None, max_length=255)
    price_cents: int | None = Field(default=None, ge=0, le=MAX_PRICE_CENTS)
    # Unlike `brand`, None here *is* a permitted value: a volume can be wiped off a
    # product that never had one to begin with.
    volume_ml: int | None = Field(default=None, gt=0, le=MAX_VOLUME_ML)
    category_id: uuid.UUID | None = None
    in_stock: bool | None = None
    # Pinning a product that is not pinned yet is refused past the limit (409
    # `featured_limit_reached`); unpinning always goes through.
    is_featured: bool | None = None
    shade_label: ShadeLabel | None = None
    # A full replacement of the volume list when present, omitted to leave it alone.
    # `null` is not a way to clear it: a product without volumes has no price to show
    # (409 product_variants_empty says so), so there is nothing to mean by it.
    variants: list[ProductVariantRequest] | None = Field(
        default=None, min_length=1, max_length=MAX_PRODUCT_VARIANTS
    )

    @field_validator("brand")
    @classmethod
    def _validate_brand(cls, value: str | None) -> str:
        return require_brand(value)

    @field_validator("description_html")
    @classmethod
    def _validate_description_html(cls, value: str | None) -> str | None:
        return require_description_length(value)

    # The columns behind these six are NOT NULL — unlike description/volume_ml/category_id
    # just above, which a PATCH may legitimately clear.
    @field_validator(
        "name", "slug", "price_cents", "in_stock", "is_featured", "shade_label", mode="before"
    )
    @classmethod
    def _reject_null(cls, value: object) -> object:
        return require_not_null(value)


class ImportRowErrorResponse(CamelModel):
    row: int
    message: str


class ImportSummaryResponse(CamelModel):
    created: int
    updated: int
    errors: list[ImportRowErrorResponse]


class SuggestCategoryResponse(CamelModel):
    name: str
    slug: str


class SuggestProductResponse(CamelModel):
    """A product as the header dropdown shows it: name, brand, price, one picture.

    Not `ProductResponse` trimmed by the client — the suggestion list fires on every
    few keystrokes, and sending the description plus every image of five products for
    a row that displays one thumbnail is the difference between a snappy dropdown and
    a slow one.
    """

    id: uuid.UUID
    name: str
    slug: str
    brand: str | None
    price_cents: int
    # How many variants the product is sold in. Kept for older clients; the "от" reads
    # `price_varies` now, because a lipstick in ten shades has ten variants and one price.
    variant_count: int
    # Whether the variants cost different amounts. The dropdown needs it for one thing
    # only: then `price_cents` is the cheapest of them, and the row has to say "от" — the
    # card next to it already does, and two readings of one number in one search is worse
    # than either.
    price_varies: bool = False
    in_stock: bool
    image_url: str | None
    image_alt: str | None


class SearchSuggestResponse(CamelModel):
    categories: list[SuggestCategoryResponse]
    brands: list[str]
    products: list[SuggestProductResponse]
