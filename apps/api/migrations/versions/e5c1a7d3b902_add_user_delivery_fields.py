"""add user delivery fields

Revision ID: e5c1a7d3b902
Revises: d9b3e7a2c5f1
Create Date: 2026-11-10 12:00:00.000000

A delivery address and a note on how to receive, both optional, on the profile. Two
nullable columns: expanding.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5c1a7d3b902'
down_revision: Union[str, Sequence[str], None] = 'd9b3e7a2c5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('delivery_address', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('delivery_note', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'delivery_note')
    op.drop_column('users', 'delivery_address')
