"""add order discount anchor

Revision ID: c6e2a9d4f1b8
Revises: a3d8f1c6b274
Create Date: 2026-11-10 20:00:00.000000

The sum a discount was taken from when an admin last set it or edited the order, on both
the order and its lines (see `app/orders/discounts.py`): against it a customer's edit can
shrink a discount but never grow it. Nullable; a discount without one is counted as before.
Expanding.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6e2a9d4f1b8'
down_revision: Union[str, Sequence[str], None] = 'a3d8f1c6b274'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('orders', sa.Column('discount_base_cents', sa.BigInteger(), nullable=True))
    op.add_column('order_items', sa.Column('discount_base_cents', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('order_items', 'discount_base_cents')
    op.drop_column('orders', 'discount_base_cents')
