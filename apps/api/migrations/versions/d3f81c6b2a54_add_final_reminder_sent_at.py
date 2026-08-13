"""add final reminder sent at

Revision ID: d3f81c6b2a54
Revises: 9e7fa9bbcec2
Create Date: 2026-08-13 10:12:04.118233

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3f81c6b2a54'
down_revision: Union[str, Sequence[str], None] = '9e7fa9bbcec2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'order_cycles',
        sa.Column('final_reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_cycles', 'final_reminder_sent_at')
