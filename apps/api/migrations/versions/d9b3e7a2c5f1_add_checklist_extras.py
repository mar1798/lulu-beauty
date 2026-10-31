"""add checklist extras

Revision ID: d9b3e7a2c5f1
Revises: c4a8f2e6d913
Create Date: 2026-10-31 20:00:00.000000

Lines the owner adds to a cycle's purchase list by hand. A new table only: expanding.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9b3e7a2c5f1'
down_revision: Union[str, Sequence[str], None] = 'c4a8f2e6d913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'checklist_extras',
        sa.Column('cycle_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('unit_price_cents', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('clock_timestamp()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['cycle_id'], ['order_cycles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_checklist_extras_cycle_id'), 'checklist_extras', ['cycle_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_checklist_extras_cycle_id'), table_name='checklist_extras')
    op.drop_table('checklist_extras')
