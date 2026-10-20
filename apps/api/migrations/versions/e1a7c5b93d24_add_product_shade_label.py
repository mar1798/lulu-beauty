"""add product shade_label

Revision ID: e1a7c5b93d24
Revises: d4e8a2c61f90
Create Date: 2026-10-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e1a7c5b93d24"
down_revision: Union[str, Sequence[str], None] = "d4e8a2c61f90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

shade_label = postgresql.ENUM("TONE", "COLOR", "SHADE", "SCENT", name="shade_label")


def upgrade() -> None:
    """Upgrade schema.

    The type is created on its own: `add_column` does not create an enum type the way
    `create_table` does. The server default gives every existing product "Тон", which is
    what the storefront called every shade until now, and keeps the previous release's
    inserts working after a rollback.
    """
    shade_label.create(op.get_bind())
    op.add_column(
        "products",
        sa.Column(
            "shade_label",
            postgresql.ENUM(name="shade_label", create_type=False),
            server_default="TONE",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("products", "shade_label")
    shade_label.drop(op.get_bind())
