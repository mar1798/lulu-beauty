"""add payment_receipts.submitted_at

Revision ID: e2b7d94a1c06
Revises: c4e8a2f61b93
Create Date: 2026-10-10 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2b7d94a1c06"
down_revision: Union[str, Sequence[str], None] = "c4e8a2f61b93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # A server default, so a receipt the previous release files still gets a value.
    op.add_column(
        "payment_receipts",
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # Receipts filed before the column existed were last submitted when they were made.
    op.execute("UPDATE payment_receipts SET submitted_at = created_at")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payment_receipts", "submitted_at")
