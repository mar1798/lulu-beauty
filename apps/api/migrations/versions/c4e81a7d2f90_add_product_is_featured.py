"""add product is_featured

Revision ID: c4e81a7d2f90
Revises: b2fd9cf64618
Create Date: 2026-09-27 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e81a7d2f90"
down_revision: Union[str, Sequence[str], None] = "b2fd9cf64618"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "products",
        sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("products", "is_featured")
