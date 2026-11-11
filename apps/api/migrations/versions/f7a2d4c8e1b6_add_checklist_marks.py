"""add checklist marks

Revision ID: f7a2d4c8e1b6
Revises: e5c1a7d3b902
Create Date: 2026-11-10 14:00:00.000000

The "bought" ticks of the purchase list move from each browser's localStorage to the
server, so every admin sees the same ones. A new table only: expanding.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a2d4c8e1b6'
down_revision: Union[str, Sequence[str], None] = 'e5c1a7d3b902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'checklist_marks',
        sa.Column('cycle_id', sa.UUID(), nullable=False),
        sa.Column('key', sa.String(length=1024), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['cycle_id'], ['order_cycles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('cycle_id', 'key'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('checklist_marks')
