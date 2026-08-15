"""widen order total to bigint

Revision ID: a4c7d21f9e08
Revises: 8bb0928ca06c
Create Date: 2026-08-15 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c7d21f9e08'
down_revision: Union[str, Sequence[str], None] = '8bb0928ca06c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # orders.total_cents is a sum of lines, and the per-line ceiling (MAX_PRICE_CENTS,
    # set just under int4) says nothing about it: one line at that price times a legal
    # quantity already exceeds 2^31-1, and the overflow surfaced as a 500 at flush time
    # on checkout — a customer with such a cart could not check out at all, ever.
    op.alter_column(
        'orders',
        'total_cents',
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'orders',
        'total_cents',
        existing_type=sa.BigInteger(),
        type_=sa.Integer(),
        existing_nullable=False,
    )
