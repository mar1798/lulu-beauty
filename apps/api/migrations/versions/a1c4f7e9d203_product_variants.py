"""product variants: a volume and a price per buyable form

Revision ID: a1c4f7e9d203
Revises: 96608644fbca
Create Date: 2026-09-21 12:04:18.552104

**This migration is contracting** and must be merged with a `[contracting]` marker —
`UNIQUE(cart_id, product_id)` on `cart_items` is what makes two volumes of one product
in one cart impossible, so it has to go, and `cart_items.variant_id` becomes NOT NULL
once it is filled. Production never downgrades, so rolling the release back means
restoring a backup: it ships on its own.

The catalogue itself is untouched. `products.price_cents`, `products.volume_ml` and
`products.in_stock` stay exactly where they are and keep serving every bulk read (the
price sort, the search, the stock filter, the export, the sitemap); they are simply
derived from the variants from now on. The backfill below gives every existing product
one variant holding what its own columns already say, which leaves the whole shop —
carts and pending orders included — with the same numbers it had a second earlier.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4f7e9d203'
down_revision: Union[str, Sequence[str], None] = '96608644fbca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "product_variants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("volume_ml", sa.Integer(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("in_stock", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index(
        "uq_product_variants_live_volume",
        "product_variants",
        ["product_id", "volume_ml"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_product_variants_live_novolume",
        "product_variants",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND volume_ml IS NULL"),
    )

    # One variant per existing product, holding what the product row already says. After
    # this every product has at least one, which is what lets the code treat "no
    # variants" as impossible rather than as a second case to handle everywhere.
    op.execute(
        """
        INSERT INTO product_variants
            (id, product_id, volume_ml, price_cents, in_stock, sort_order,
             deleted_at, created_at, updated_at)
        SELECT gen_random_uuid(), p.id, p.volume_ml, p.price_cents, p.in_stock, 0,
               NULL, now(), now()
        FROM products AS p
        """
    )

    op.add_column("cart_items", sa.Column("variant_id", sa.UUID(), nullable=True))
    op.add_column("order_items", sa.Column("variant_id", sa.UUID(), nullable=True))
    op.add_column("order_items", sa.Column("product_volume_ml", sa.Integer(), nullable=True))

    # Every line in flight points at the one variant its product just got.
    op.execute(
        """
        UPDATE cart_items AS ci
        SET variant_id = v.id
        FROM product_variants AS v
        WHERE v.product_id = ci.product_id
        """
    )
    # Order lines keep pointing at a product that may since have been soft-deleted, and
    # at one the owner may have emptied off the order entirely (product_id IS NULL) —
    # hence the join rather than a blanket update. The volume snapshot is taken from the
    # product for the same rows and left NULL for the rest, which is the honest answer:
    # nothing in the database records what those lines were.
    op.execute(
        """
        UPDATE order_items AS oi
        SET variant_id = v.id,
            product_volume_ml = p.volume_ml
        FROM product_variants AS v
        JOIN products AS p ON p.id = v.product_id
        WHERE v.product_id = oi.product_id
        """
    )

    op.create_index("ix_cart_items_variant_id", "cart_items", ["variant_id"])
    op.create_index("ix_order_items_variant_id", "order_items", ["variant_id"])
    op.create_foreign_key(
        "fk_cart_items_variant_id",
        "cart_items",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_order_items_variant_id",
        "order_items",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Contracting, both of them, and deliberate — see the module docstring.
    op.alter_column("cart_items", "variant_id", nullable=False)
    op.drop_constraint("cart_items_cart_id_product_id_key", "cart_items", type_="unique")
    op.create_unique_constraint(
        "uq_cart_items_cart_id_variant_id", "cart_items", ["cart_id", "variant_id"]
    )


def downgrade() -> None:
    """Downgrade schema.

    Written out because Alembic wants it and a local database is a fair thing to walk
    back; it is not a production path. Restoring the old uniqueness fails outright if a
    cart holds two volumes of one product by then, which is the whole reason the release
    is marked contracting.
    """
    op.drop_constraint("uq_cart_items_cart_id_variant_id", "cart_items", type_="unique")
    op.create_unique_constraint(
        "cart_items_cart_id_product_id_key", "cart_items", ["cart_id", "product_id"]
    )
    op.drop_constraint("fk_order_items_variant_id", "order_items", type_="foreignkey")
    op.drop_constraint("fk_cart_items_variant_id", "cart_items", type_="foreignkey")
    op.drop_index("ix_order_items_variant_id", table_name="order_items")
    op.drop_index("ix_cart_items_variant_id", table_name="cart_items")
    op.drop_column("order_items", "product_volume_ml")
    op.drop_column("order_items", "variant_id")
    op.drop_column("cart_items", "variant_id")
    op.drop_index("uq_product_variants_live_novolume", table_name="product_variants")
    op.drop_index("uq_product_variants_live_volume", table_name="product_variants")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")
