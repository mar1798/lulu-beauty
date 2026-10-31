"""add AWAITING_PAYMENT order status

Revision ID: b7d3e9a41c52
Revises: e1a7c5b93d24
Create Date: 2026-10-31 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7d3e9a41c52"
down_revision: Union[str, Sequence[str], None] = "e1a7c5b93d24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Payment becomes a step of its own: taking an order now leaves it AWAITING_PAYMENT,
    and CONFIRMED means paid for. The value is added outside the migration's transaction
    — Postgres refuses to use an enum value in the transaction that added it, and the
    UPDATE below uses it at once.

    Existing CONFIRMED orders were taken and billed under the old meaning, so those not
    yet paid move to AWAITING_PAYMENT. READY and COMPLETED stay as they are even unpaid:
    the goods are on the shelf or already handed over, and walking them back would undo
    a step the owner has made.
    """
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'CONFIRMED'"
        )
    op.execute(
        "UPDATE orders SET status = 'AWAITING_PAYMENT' "
        "WHERE status = 'CONFIRMED' AND paid_at IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema.

    The rows go back to CONFIRMED, which is what an unpaid billed order was before. The
    value itself stays: Postgres has no `DROP VALUE`, and an unused one is harmless.
    """
    op.execute("UPDATE orders SET status = 'CONFIRMED' WHERE status = 'AWAITING_PAYMENT'")
