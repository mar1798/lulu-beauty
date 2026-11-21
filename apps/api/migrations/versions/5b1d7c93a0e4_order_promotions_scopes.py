"""order promotions: sort order and line scopes

Revision ID: 5b1d7c93a0e4
Revises: 310c104e5d85
Create Date: 2026-11-20 10:00:00.000000

Two columns on `order_promotions`, so an order's totals are counted from its own rows
without asking the promotion or the catalogue: the promotion's `sort_order` as it was when
the order joined, and the order lines each line-targeted discount landed on. Expanding: a
column with a server default and a nullable one.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '5b1d7c93a0e4'
down_revision: Union[str, Sequence[str], None] = '310c104e5d85'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('order_promotions', sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=False))
    op.add_column('order_promotions', sa.Column('item_scopes', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_promotions', 'item_scopes')
    op.drop_column('order_promotions', 'sort_order')
