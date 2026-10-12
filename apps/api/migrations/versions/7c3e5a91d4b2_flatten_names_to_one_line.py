"""flatten names to one line

Revision ID: 7c3e5a91d4b2
Revises: 2fa62cfb0b6d
Create Date: 2026-10-12 15:10:00.000000

Names saved before `common/text.single_line` was applied on the way in may hold a line
break or another control character, and they are printed on a line of their own in what
the bot sends the owner. Rewritten here the same way new names are; a wish copies the
account's name, so its rows are cleaned too. Only rows holding such a character are
touched — a double space is harmless and left alone.
"""
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c3e5a91d4b2'
down_revision: Union[str, Sequence[str], None] = '2fa62cfb0b6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Control characters (Cc) and the two Unicode line separators: what can break a line.
_BREAKING = r"[\x01-\x1f\x7f-\x9f  ]"
# `handlers.DEFAULT_NAME`, for a name that was nothing but control characters.
_PLACEHOLDER = "Покупатель"


def _single_line(value: str) -> str:
    """A copy of `common/text.single_line` as of this revision: a migration must not
    change behaviour when the app's code does."""
    visible = "".join(
        char for char in value if char.isspace() or unicodedata.category(char) != "Cc"
    )
    return " ".join(visible.split())


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    for table in ("users", "wanted_products"):
        rows = bind.execute(
            sa.text(f"SELECT id, name FROM {table} WHERE name ~ :pattern"),
            {"pattern": _BREAKING},
        ).all()
        for row_id, name in rows:
            bind.execute(
                sa.text(f"UPDATE {table} SET name = :name WHERE id = :id"),
                {"name": _single_line(name) or _PLACEHOLDER, "id": row_id},
            )


def downgrade() -> None:
    """Downgrade schema."""
    # Nothing to restore: the old names are gone, and nothing depended on their breaks.
