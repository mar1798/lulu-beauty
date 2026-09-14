"""add SUPER_ADMIN role

Revision ID: e4a7d19c6f20
Revises: c996138b6b93
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e4a7d19c6f20'
down_revision: Union[str, Sequence[str], None] = 'c996138b6b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Only the value is added here. Promoting the shop owner to it is a data step
    (`app.scripts.seed`, by OWNER_PHONE) rather than a migration: which row is the
    owner is a deployment fact, not something this file can read.
    """
    op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres has no `DROP VALUE`, so removing it would mean rebuilding `role` —
    # and any row already holding SUPER_ADMIN would have to be demoted first, which
    # silently hands the shop's last immutable account to whoever comes next.
    pass
