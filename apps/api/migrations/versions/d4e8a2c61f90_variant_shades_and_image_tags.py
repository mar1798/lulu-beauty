"""variant shades and image tags

Revision ID: d4e8a2c61f90
Revises: b8d2e6f41a37
Create Date: 2026-10-14 12:00:00.000000

A variant gains a shade next to its volume ("Помада Velvet, 05 Rose"), an order line a
snapshot of it, and a product photo the lists of volumes and shades it shows. The shade
columns are nullable and NULL for every existing row: nothing in the catalogue has a
shade yet. The photo tags are NOT NULL with an empty-list default, which is "any": every
existing photo shows the whole product, and so does every photo the previous release
uploads after a rollback. `hidden` — a photo shown for no variant — defaults to false
for the same reason.

The uniqueness rule on live variants is widened from (product, volume) to
(product, volume, shade). This is the one step the release guard reports, since it is a
unique index over columns that already exist, and it needs `[contracting]` on the merge.
It is safe to roll back across, which is why the marker is justified: the previous
release never writes a shade, so every row it inserts has `lower(shade)` NULL, and with
NULLS NOT DISTINCT the new index then refuses exactly what the two old ones refused — a
second live row of the same volume, or a second one without a volume. What the previous
release cannot do is *edit* a product that already has shades well: it reconciles by
volume alone, so a rollback should be followed by leaving shaded products alone until
the release is back.

The new index is created before the old two are dropped, so there is no moment without
a rule.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d4e8a2c61f90"
down_revision: Union[str, Sequence[str], None] = "b8d2e6f41a37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("product_variants", sa.Column("shade", sa.String(length=64), nullable=True))
    op.add_column("order_items", sa.Column("product_shade", sa.String(length=64), nullable=True))
    op.add_column(
        "product_images",
        sa.Column(
            "volumes_ml",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )
    op.add_column(
        "product_images",
        sa.Column(
            "shades",
            postgresql.ARRAY(sa.String(length=64)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )

    op.add_column(
        "product_images",
        sa.Column("hidden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.create_index(
        "uq_product_variants_live_key",
        "product_variants",
        ["product_id", "volume_ml", sa.text("lower(shade)")],
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index("uq_product_variants_live_novolume", table_name="product_variants")
    op.drop_index("uq_product_variants_live_volume", table_name="product_variants")


def downgrade() -> None:
    """Downgrade schema."""
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
    op.drop_index("uq_product_variants_live_key", table_name="product_variants")

    op.drop_column("product_images", "hidden")
    op.drop_column("product_images", "shades")
    op.drop_column("product_images", "volumes_ml")
    op.drop_column("order_items", "product_shade")
    op.drop_column("product_variants", "shade")
