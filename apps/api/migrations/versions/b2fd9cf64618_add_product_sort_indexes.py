"""add product sort indexes

Revision ID: b2fd9cf64618
Revises: fbab111e52ec
Create Date: 2026-09-27 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2fd9cf64618"
down_revision: Union[str, Sequence[str], None] = "fbab111e52ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "ix_products_live_created_at",
        "products",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_products_live_price_cents",
        "products",
        ["price_cents"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_products_live_price_cents",
        table_name="products",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        "ix_products_live_created_at",
        table_name="products",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
