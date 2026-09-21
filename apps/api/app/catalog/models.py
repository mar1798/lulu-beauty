import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db import Base


class Category(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

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
        # Catalogue search is `name ILIKE '%…%'`, which no btree index can serve — the
        # leading wildcard rules it out — so it read every row. A trigram GIN index is the
        # one thing that indexes an infix match. pg_trgm is a *trusted* extension, so the
        # migration can create it without superuser (verified against a plain database
        # owner); the index is partial on the same condition as the two above.
        Index(
            "ix_products_live_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # The same, for brand: search is one field over name, brand and category now
        # (`ProductService._filtered_query`), so `brand ILIKE '%…%'` runs on every
        # search too, and the plain btree above only serves the exact-match filter.
        Index(
            "ix_products_live_brand_trgm",
            "brand",
            postgresql_using="gin",
            postgresql_ops={"brand": "gin_trgm_ops"},
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(String(255))
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
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    product: Mapped["Product"] = relationship(back_populates="images")


class ProductVariant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One buyable form of a product: a volume, with its own price and its own stock.

    The shop sells the same serum as 30 ml and 50 ml, and those differ in exactly two
    things a customer cares about — millilitres and price — while sharing a name, a
    description, a brand, photos and an address. So they are one `Product` with two
    variants rather than two products: the alternative duplicates every shared field and
    splits the catalogue page in two.

    A product always has at least one variant. A product with nothing to distinguish
    (pads, a sheet mask) has a single variant with `volume_ml = None`, which is the shape
    the whole catalogue was migrated into — so the code has one path, not two.

    Soft-deleted like `Product`, and for the same reason: a variant the owner withdraws
    is still quoted by carts and by orders waiting for confirmation, and the row is what
    `reprice_products` looks up when a price moves.
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        # One row per volume per product, withdrawn rows excluded so a volume can be
        # taken off and later brought back. Partial for that reason alone: two *deleted*
        # 50 ml rows are history, not a conflict.
        #
        # NULLS NOT DISTINCT is the point of the second index rather than a detail of
        # this one: in Postgres NULLs are distinct by default, so the constraint above
        # says nothing at all about the no-volume variant, and a product could quietly
        # collect several of them. The two indexes together mean "one row per volume,
        # and at most one row without a volume".
        Index(
            "uq_product_variants_live_volume",
            "product_id",
            "volume_ml",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_product_variants_live_novolume",
            "product_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND volume_ml IS NULL"),
        ),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    # Millilitres, or None for a product that has no volume to speak of.
    volume_ml: Mapped[int | None] = mapped_column(Integer)
    price_cents: Mapped[int] = mapped_column(Integer)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped["Product"] = relationship(back_populates="variants")
