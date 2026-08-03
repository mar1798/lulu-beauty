"""add order item slug and image snapshot

Revision ID: b7c31e5a9d42
Revises: ef66b2e63d7a
Create Date: 2026-08-03 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c31e5a9d42'
down_revision: Union[str, Sequence[str], None] = 'ef66b2e63d7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Added nullable first, then backfilled, then made NOT NULL: existing rows predate the
    # snapshot and there is no sensible server_default for a slug.
    op.add_column('order_items', sa.Column('product_slug', sa.String(length=255), nullable=True))
    op.add_column(
        'order_items', sa.Column('product_image_url', sa.String(length=2048), nullable=True)
    )

    # Best-effort backfill from the still-linked product; items whose product was hard-deleted
    # (product_id IS NULL) keep an empty slug, which the API returns as-is.
    op.execute(
        """
        UPDATE order_items
        SET product_slug = products.slug
        FROM products
        WHERE order_items.product_id = products.id
        """
    )
    op.execute(
        """
        UPDATE order_items
        SET product_image_url = (
            SELECT url FROM product_images
            WHERE product_images.product_id = order_items.product_id
            ORDER BY product_images.is_primary DESC, product_images.sort_order ASC
            LIMIT 1
        )
        WHERE order_items.product_id IS NOT NULL
        """
    )
    op.execute("UPDATE order_items SET product_slug = '' WHERE product_slug IS NULL")

    op.alter_column('order_items', 'product_slug', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_items', 'product_image_url')
    op.drop_column('order_items', 'product_slug')
