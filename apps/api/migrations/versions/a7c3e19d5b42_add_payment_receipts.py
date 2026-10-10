"""add payment receipts and orders.paid_at

Revision ID: a7c3e19d5b42
Revises: 356c0e821e52
Create Date: 2026-10-10 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7c3e19d5b42"
down_revision: Union[str, Sequence[str], None] = "356c0e821e52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("orders", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "payment_receipts",
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.Enum("PHOTO", "DOCUMENT", name="receipt_kind"), nullable=False),
        sa.Column("file_id", sa.String(length=512), nullable=False),
        sa.Column("file_unique_id", sa.String(length=128), nullable=False),
        sa.Column(
            "verdict", sa.Enum("ACCEPTED", "REJECTED", name="receipt_verdict"), nullable=True
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "file_unique_id", name="uq_payment_receipts_order_file"),
    )
    op.create_index(
        op.f("ix_payment_receipts_order_id"), "payment_receipts", ["order_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_payment_receipts_order_id"), table_name="payment_receipts")
    op.drop_table("payment_receipts")
    sa.Enum(name="receipt_verdict").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="receipt_kind").drop(op.get_bind(), checkfirst=True)
    op.drop_column("orders", "paid_at")
