"""add order revision

Revision ID: c4a8f2e6d913
Revises: b7d3e9a41c52
Create Date: 2026-10-31 18:00:00.000000

A counter that moves with every change to an order's lines, so an edit from the admin
panel can tell whether it was built on the lines the order still holds. Starts at 0 for
every existing row: nothing has been edited against it yet.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a8f2e6d913'
down_revision: Union[str, Sequence[str], None] = 'b7d3e9a41c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'orders',
        sa.Column('revision', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('orders', 'revision')
