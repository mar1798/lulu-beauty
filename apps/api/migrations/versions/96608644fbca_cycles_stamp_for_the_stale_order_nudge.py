"""Cycles: stamp for the stale-order nudge

Revision ID: 96608644fbca
Revises: d5e91c4b7a26
Create Date: 2026-09-20 11:44:31.858342

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '96608644fbca'
down_revision: Union[str, Sequence[str], None] = 'd5e91c4b7a26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # When the owner was told this cycle still holds orders nobody answered. Nullable and
    # left NULL for every existing cycle on purpose: a closed cycle with a real tail is
    # exactly what the nudge is for, so the first sweep after this deploy should find it
    # rather than treat the whole history as already dealt with.
    op.add_column(
        'order_cycles',
        sa.Column('stale_orders_notice_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_cycles', 'stale_orders_notice_at')
