"""promotions: an end date is optional

Revision ID: 8c3e5a1f2d74
Revises: 5b1d7c93a0e4
Create Date: 2026-11-20 12:00:00.000000

A promotion without `ends_at` is open-ended: it runs until the owner disables or archives
it. Expanding: the column only stops being NOT NULL. `ck_promotions_window`
(`ends_at > starts_at`) stays — a CHECK lets NULL through.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8c3e5a1f2d74'
down_revision: Union[str, Sequence[str], None] = '5b1d7c93a0e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        'promotions',
        'ends_at',
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Open-ended rows get an end far ahead, or NOT NULL could not come back.
    op.execute("UPDATE promotions SET ends_at = starts_at + interval '100 years' WHERE ends_at IS NULL")
    op.alter_column(
        'promotions',
        'ends_at',
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
