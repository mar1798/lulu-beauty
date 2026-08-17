"""split cancelled order status by who cancelled

Revision ID: f2b6c4d18a37
Revises: a4c7d21f9e08
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2b6c4d18a37'
down_revision: Union[str, Sequence[str], None] = 'a4c7d21f9e08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_VALUES = (
    "'PENDING', 'CONFIRMED', 'READY', 'COMPLETED', "
    "'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OWNER'"
)
OLD_VALUES = "'PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'"


def upgrade() -> None:
    """Upgrade schema.

    The type is rebuilt rather than extended: `CANCELLED` has to *go*, and Postgres has
    no `DROP VALUE`. Existing rows become CANCELLED_BY_OWNER — the order doesn't record
    who ended it, and of the two guesses that's the one that keeps the customer's own
    history honest (nothing claims they cancelled something they didn't).
    """
    op.execute(f"CREATE TYPE order_status_new AS ENUM ({NEW_VALUES})")
    op.execute("ALTER TABLE orders ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE orders ALTER COLUMN status TYPE order_status_new USING ("
        "CASE status::text WHEN 'CANCELLED' THEN 'CANCELLED_BY_OWNER' "
        "ELSE status::text END)::order_status_new"
    )
    op.execute("DROP TYPE order_status")
    op.execute("ALTER TYPE order_status_new RENAME TO order_status")


def downgrade() -> None:
    """Downgrade schema. Both cancellations collapse back into one — the distinction is
    exactly what the old type couldn't hold."""
    op.execute(f"CREATE TYPE order_status_old AS ENUM ({OLD_VALUES})")
    op.execute("ALTER TABLE orders ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE orders ALTER COLUMN status TYPE order_status_old USING ("
        "CASE WHEN status::text LIKE 'CANCELLED%' THEN 'CANCELLED' "
        "ELSE status::text END)::order_status_old"
    )
    op.execute("DROP TYPE order_status")
    op.execute("ALTER TYPE order_status_old RENAME TO order_status")
