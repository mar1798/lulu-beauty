"""promotions: an owner's promo code

Revision ID: a4d9e7b2c615
Revises: 8c3e5a1f2d74
Create Date: 2026-11-20 15:00:00.000000

An owner's promo code is a promotion with a `code`: never applied automatically, only when
the customer types it at checkout. `assigned_user_id` makes it personal. Expanding only:
two nullable columns, a foreign key on a fresh column, a unique index on a fresh column
and a plain index.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a4d9e7b2c615'
down_revision: Union[str, Sequence[str], None] = '8c3e5a1f2d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('promotions', sa.Column('code', sa.String(length=16), nullable=True))
    op.add_column('promotions', sa.Column('assigned_user_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_promotions_assigned_user_id_users',
        'promotions',
        'users',
        ['assigned_user_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index('uq_promotions_code', 'promotions', ['code'], unique=True)
    op.create_index('ix_promotions_assigned_user_id', 'promotions', ['assigned_user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_promotions_assigned_user_id', table_name='promotions')
    op.drop_index('uq_promotions_code', table_name='promotions')
    op.drop_constraint('fk_promotions_assigned_user_id_users', 'promotions', type_='foreignkey')
    op.drop_column('promotions', 'assigned_user_id')
    op.drop_column('promotions', 'code')
