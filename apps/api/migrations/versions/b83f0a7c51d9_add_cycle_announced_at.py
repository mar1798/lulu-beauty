"""add cycle announced at

Revision ID: b83f0a7c51d9
Revises: e4a7d19c6f20
Create Date: 2026-09-18 11:40:12.884201

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b83f0a7c51d9'
down_revision: Union[str, Sequence[str], None] = 'e4a7d19c6f20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'order_cycles',
        sa.Column('announced_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Every cycle that predates the column was announced by the old code path, which kept
    # no record of it. Leaving them NULL would make the new sweep read "never announced"
    # and broadcast the open cycle to the whole shop a second time on the deploy that
    # ships this.
    op.execute('UPDATE order_cycles SET announced_at = now()')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_cycles', 'announced_at')
