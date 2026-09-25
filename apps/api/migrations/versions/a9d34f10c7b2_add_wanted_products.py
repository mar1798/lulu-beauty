"""add wanted products

Revision ID: a9d34f10c7b2
Revises: c7f2a8d15b40
Create Date: 2026-09-24 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9d34f10c7b2'
down_revision: Union[str, Sequence[str], None] = 'c7f2a8d15b40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('wanted_products',
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('phone', sa.String(length=32), nullable=False),
    sa.Column('message', sa.String(length=1000), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_wanted_products_user_id'), 'wanted_products', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_wanted_products_user_id'), table_name='wanted_products')
    op.drop_table('wanted_products')
