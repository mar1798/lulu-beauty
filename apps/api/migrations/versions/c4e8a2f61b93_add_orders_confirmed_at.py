"""add orders.confirmed_at

Revision ID: c4e8a2f61b93
Revises: a7c3e19d5b42
Create Date: 2026-10-10 15:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e8a2f61b93"
down_revision: Union[str, Sequence[str], None] = "a7c3e19d5b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("orders", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))
    # Orders confirmed before the column existed: nothing touches a confirmed order's row
    # but its status and payment, so its last update is the best guess at the moment.
    op.execute(
        "UPDATE orders SET confirmed_at = updated_at "
        "WHERE status IN ('CONFIRMED', 'READY', 'COMPLETED')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("orders", "confirmed_at")
