"""add reset_password otp purpose

Revision ID: c1a2f9e7b3d4
Revises: b7c31e5a9d42
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c1a2f9e7b3d4'
down_revision: Union[str, Sequence[str], None] = 'b7c31e5a9d42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE otp_purpose ADD VALUE IF NOT EXISTS 'RESET_PASSWORD'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres has no `DROP VALUE` for enum types; a real downgrade would need
    # to rebuild `otp_purpose` from scratch, which isn't worth it for a value
    # that's simply unused after downgrade.
    pass
