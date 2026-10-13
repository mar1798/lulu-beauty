"""add order created_by

Revision ID: b8d2e6f41a37
Revises: 7c3e5a91d4b2
Create Date: 2026-10-12 18:00:00.000000

Who placed an order on a customer's behalf from the admin panel, and the panel's request
key that makes placing it idempotent. Both nullable, and NULL for every existing row: all
of them are the customers' own checkouts.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d2e6f41a37'
down_revision: Union[str, Sequence[str], None] = '7c3e5a91d4b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('orders', sa.Column('created_by_id', sa.UUID(), nullable=True))
    # Named, so the downgrade can drop it by name.
    op.create_foreign_key(
        'fk_orders_created_by_id',
        'orders',
        'users',
        ['created_by_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.add_column('orders', sa.Column('request_id', sa.UUID(), nullable=True))
    op.create_unique_constraint('uq_orders_request_id', 'orders', ['request_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_orders_request_id', 'orders', type_='unique')
    op.drop_column('orders', 'request_id')
    op.drop_constraint('fk_orders_created_by_id', 'orders', type_='foreignkey')
    op.drop_column('orders', 'created_by_id')
