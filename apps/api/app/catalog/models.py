import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.catalog.search import NOISE_SQL
from app.catalog.shades import ShadeLabel
from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


def _norm(column: str) -> Computed:
    """The stored, punctuation-free twin of a text column — see `catalog/search.py`.

    Generated rather than written by the service, so that every path that can create a
    row keeps it true: the admin forms, the xlsx import, and whatever writes next. It is
    also why `translate()` is used and `lower()` is not — a stored generated column must
    be immutable, and matching is `ILIKE` regardless.
    """
    return Computed(f"translate({column}, '{NOISE_SQL}', '')", persisted=True)


class Category(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(255))
    # No index: search resolves categories with `_search_category_ids`, which reads the
    # whole table by design — there are tens of rows, and a GIN index on them would cost
    # more on every write than the scan it saves.
    name_norm: Mapped[str] = mapped_column(String(255), _norm("name"))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # A subcategory's section ("Умывашки" inside "Уход за лицом"). One level only, which
    # `CategoryService._check_parent` enforces: a section cannot itself have a parent, and
    # a category that has subcategories cannot become one. Filtering by a section takes
    # in its subcategories' products (`ProductService._category_ids`). Deleting a section
    # promotes its subcategories to the top level rather than taking them with it.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "products"
    # Partial, on `deleted_at IS NULL`, because that filter is on every listing the shop
    # serves and a soft-deleted product is never ordered by name or picked from the brand
    # dropdown. Without them both queries fell back to a seq scan plus a sort of the whole
    # catalogue on every page of every request.
    __table_args__ = (
        Index("ix_products_live_name", "name", postgresql_where=text("deleted_at IS NULL")),
        Index("ix_products_live_brand", "brand", postgresql_where=text("deleted_at IS NULL")),
        # The other two orders a listing is read in (`catalog/sorting.py`): newest first,
        # which is the default of both the storefront and the admin table, and by price.
        # A btree scans either way, so one index serves both directions.
        Index(
            "ix_products_live_created_at", "created_at", postgresql_where=text("deleted_at IS NULL")
        ),
        Index(
            "ix_products_live_price_cents",
            "price_cents",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Catalogue search is `ILIKE '%…%'`, which no btree index can serve — the leading
        # wildcard rules it out — so it read every row. A trigram GIN index is the one
        # thing that indexes an infix match. pg_trgm is a *trusted* extension, so the
        # migration can create it without superuser (verified against a plain database
        # owner); the indexes are partial on the same condition as the two above.
        #
        # They are on the *_norm columns rather than on `name`/`brand` because that is
        # where the pattern now runs, and the raw pair they replaced was dropped in the
        # same migration: two GIN indexes on this table, not four. Nothing else does an
        # infix match on the raw columns, and the btrees above still serve the ordering
        # and the exact-match brand filter.
        Index(
            "ix_products_live_name_norm_trgm",
            "name_norm",
            postgresql_using="gin",
            postgresql_ops={"name_norm": "gin_trgm_ops"},
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_products_live_brand_norm_trgm",
            "brand_norm",
            postgresql_using="gin",
            postgresql_ops={"brand_norm": "gin_trgm_ops"},
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(255))
    name_norm: Mapped[str] = mapped_column(String(255), _norm("name"))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Plain text, always: the meta description, the JSON-LD and the import read it. When
    # the owner wrote the description in the admin editor, it is derived from
    # `description_html` on save (see `catalog/rich_text.py`) and the two change together;
    # an import writes this one alone and clears the HTML, so they never disagree.
    description: Mapped[str | None] = mapped_column(Text)
    # The same description with its formatting, as the product page renders it. NULL for
    # a product whose description never went through the editor — the page then shows
    # `description` with its line breaks, which is what it always did.
    description_html: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(String(255))
    # NULL when `brand` is, which is what keeps the search arm behaving exactly as it did
    # against the raw column: a product with no brand matches no brand query.
    brand_norm: Mapped[str | None] = mapped_column(String(255), _norm("brand"))
    # The three columns below are *derived* from the product's live variants and are
    # rewritten by `ProductService._refresh_display_fields` on every write that can move
    # them. They are kept on the row rather than computed per query because everything
    # that reads the catalogue in bulk reads them: the price sort and filter, the search,
    # the `in_stock` filter, the xlsx export, the sitemap and the JSON-LD. A product
    # always has at least one live variant, so none of them is ever meaningless.
    #
    # price_cents — the cheapest live variant, i.e. the "от N ₽" on a card.
    price_cents: Mapped[int] = mapped_column(Integer)
    # Millilitres, optional: half the catalog is bottles where 50 vs 500 is the whole
    # difference, and the other half (pads, sheet masks) has no volume to speak of.
    # With more than one variant it is NULL — no single number describes the product,
    # and the card shows the volumes themselves instead.
    volume_ml: Mapped[int | None] = mapped_column(Integer)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    # True when *any* live variant is in stock. Stock itself is a property of the
    # variant — 30 ml can run out while 50 ml sits on the shelf.
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    # Picked by the owner for the cards beside the home page's headline — at most
    # `MAX_FEATURED_PRODUCTS` live products at a time (`ProductService._require_featured_slot`).
    # A server default rather than only a Python one, so the release before this one can
    # still insert products after a rollback (`docs/backend.md`, "Migrations").
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # What the storefront calls the variants' shades — "Тон", "Цвет", "Оттенок" (see
    # `ShadeLabel`). Kept on a product without shades too, where nothing shows it, so that
    # taking the shades off and putting them back does not lose the owner's choice. A
    # server default for the same reason `is_featured` has one.
    shade_label: Mapped[ShadeLabel] = mapped_column(
        SAEnum(ShadeLabel, name="shade_label"),
        default=ShadeLabel.TONE,
        server_default=ShadeLabel.TONE.value,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    category: Mapped["Category | None"] = relationship(back_populates="products")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", order_by="ProductImage.sort_order"
    )
    # Every variant, withdrawn ones included — the soft-deleted rows are what keeps an
    # order that quotes them readable. Readers that mean "orderable" filter on
    # `deleted_at IS NULL` themselves; `live_variants` does it for them.
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.sort_order, ProductVariant.id",
    )

    @property
    def live_variants(self) -> list["ProductVariant"]:
        """The variants a customer may actually choose, in display order."""
        return [variant for variant in self.variants if variant.deleted_at is None]


class ProductImage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    alt: Mapped[str | None] = mapped_column(String(255))
    # Position in the gallery. The first photo is the product's own — the card, the
    # search dropdown and the order line of a variant with no photo of its own show it —
    # and `is_primary` is kept equal to "sort_order is the lowest" for older readers.
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    # Which variants the photo shows: the volumes and the shades it is of. An empty list
    # is "any", so an untagged photo belongs to every variant, and a photo tagged with
    # "01 Nude" and "05 Rose" alone to those two shades in every volume. Tags rather than
    # foreign keys to variants because that is what a photo actually depicts — the
    # shade, not "05 Rose in 30 ml" as one row — and a tube photographed once would
    # otherwise be uploaded per volume. Lists, because one shot of a palette or of two
    # tubes side by side is a photo of several. Always assigned whole, never mutated in
    # place: SQLAlchemy does not see an `append` on an ARRAY column. The rule for picking
    # photos lives in `catalog/images.py`.
    volumes_ml: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), default=lambda: [], server_default=text("'{}'")
    )
    shades: Mapped[list[str]] = mapped_column(
        ARRAY(String(64)), default=lambda: [], server_default=text("'{}'")
    )
    # Shown for no variant at all: the owner took every badge off. Kept apart from the
    # lists rather than spelled as an empty one, because an empty list already means
    # "any" — and "all of them" has to stay "any" so that a volume added later picks the
    # photo up. A hidden photo is the admin form's alone: every storefront reader skips
    # it (`catalog/images.py`, `product_response`). Its lists are kept empty.
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    product: Mapped["Product"] = relationship(back_populates="images")


class ProductVariant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One buyable form of a product: a volume and a shade, with its own price and stock.

    The shop sells the same serum as 30 ml and 50 ml, and the same lipstick in "01 Nude"
    and "05 Rose"; those share a name, a description, a brand and an address, and differ
    in what the customer picks. So they are one `Product` with several variants rather
    than several products: the alternative duplicates every shared field and splits the
    catalogue page in two.

    The two axes are independent — a foundation can come in two volumes of every shade —
    and a variant is identified by the pair. The price follows the volume alone: every
    shade of one volume costs the same (`ProductService._require_specs`). It is still
    stored per row, because a cart line, an order line and a repricing all point at a
    variant, and a price living elsewhere would give each of them a second lookup.

    A product always has at least one variant. A product with nothing to distinguish
    (pads, a sheet mask) has a single variant with `volume_ml = None`, which is the shape
    the whole catalogue was migrated into — so the code has one path, not two.

    Soft-deleted like `Product`, and for the same reason: a variant the owner withdraws
    is still quoted by carts and by orders waiting for confirmation, and the row is what
    `reprice_products` looks up when a price moves.
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        # One live row per (volume, shade) per product, withdrawn rows excluded so a
        # variant can be taken off and later brought back. Partial for that reason alone:
        # two *deleted* "50 ml, 05 Rose" rows are history, not a conflict.
        #
        # NULLS NOT DISTINCT is the point rather than a detail: in Postgres NULLs are
        # distinct by default, and both halves of the key are NULL for most of the
        # catalogue (a sheet mask has neither). Without it a product could quietly collect
        # several nameless variants. The shade is compared lower-cased, as `shade_key`
        # compares it, so "05 rose" from a price list is the "05 Rose" already there.
        Index(
            "uq_product_variants_live_key",
            "product_id",
            "volume_ml",
            text("lower(shade)"),
            unique=True,
            postgresql_nulls_not_distinct=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    # Millilitres, or None for a product that has no volume to speak of.
    volume_ml: Mapped[int | None] = mapped_column(Integer)
    # The shade's name as the brand prints it ("05 Rose"), or None for a product that
    # does not come in shades. Either every live variant of a product has one or none
    # does — see `ProductService._require_specs`.
    shade: Mapped[str | None] = mapped_column(String(64))
    price_cents: Mapped[int] = mapped_column(Integer)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped["Product"] = relationship(back_populates="variants")
