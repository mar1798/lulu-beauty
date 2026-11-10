"""add order discounts

Revision ID: a3d8f1c6b274
Revises: f7a2d4c8e1b6
Create Date: 2026-11-10 18:00:00.000000

A discount an admin gives on one line of an order or on the whole order: its kind
(percent or amount), its value and a note on why. A new enum type and nullable columns on
both tables, all NULL for every existing order — `total_cents` already holds what those
orders cost, and no discount changes nothing. Expanding.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3d8f1c6b274'
down_revision: Union[str, Sequence[str], None] = 'f7a2d4c8e1b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

discount_kind = postgresql.ENUM('PERCENT', 'AMOUNT', name='discount_kind')


def upgrade() -> None:
    """Upgrade schema."""
    discount_kind.create(op.get_bind(), checkfirst=True)
    for table in ('orders', 'order_items'):
        op.add_column(
            table,
            sa.Column(
                'discount_kind',
                postgresql.ENUM(name='discount_kind', create_type=False),
                nullable=True,
            ),
        )
        op.add_column(table, sa.Column('discount_value', sa.BigInteger(), nullable=True))
        op.add_column(table, sa.Column('discount_note', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('order_items', 'orders'):
        op.drop_column(table, 'discount_note')
        op.drop_column(table, 'discount_value')
        op.drop_column(table, 'discount_kind')
    discount_kind.drop(op.get_bind(), checkfirst=True)
