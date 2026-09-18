"""add trigram index for brand search

Revision ID: d5e91c4b7a26
Revises: eb3660ae85e7
Create Date: 2026-09-18 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd5e91c4b7a26'
down_revision: Union[str, Sequence[str], None] = 'eb3660ae85e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Header search is one field over name, brand and category, so `brand ILIKE '%…%'`
    # now runs on every search and wants the same treatment the name got in 8bb0928ca06c:
    # an infix match rules out the btree next to it, which only serves the exact-match
    # brand filter. Partial on `deleted_at IS NULL`, like every other index on this table.
    #
    # pg_trgm is already installed by 8bb0928ca06c; that CREATE EXTENSION is idempotent
    # and is not repeated.
    op.create_index(
        'ix_products_live_brand_trgm',
        'products',
        ['brand'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'brand': 'gin_trgm_ops'},
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_products_live_brand_trgm', table_name='products')
