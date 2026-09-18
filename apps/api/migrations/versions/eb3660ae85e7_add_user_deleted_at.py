"""add user deleted at

Revision ID: eb3660ae85e7
Revises: b83f0a7c51d9
Create Date: 2026-09-18 11:51:28.492684

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eb3660ae85e7'
down_revision: Union[str, Sequence[str], None] = 'b83f0a7c51d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable with no backfill, and that is the correct default: NULL means "this account
    # is live", which every account that predates the column is.
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'deleted_at')
