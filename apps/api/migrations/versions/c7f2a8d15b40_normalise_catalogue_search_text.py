"""normalise catalogue search text

Revision ID: c7f2a8d15b40
Revises: a1c4f7e9d203
Create Date: 2026-09-21 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7f2a8d15b40'
down_revision: Union[str, Sequence[str], None] = 'a1c4f7e9d203'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# A deliberate copy of `app.catalog.search.NOISE`, not an import: a stored generated
# column keeps whatever expression it was created with, so this migration has to say
# what it wrote at the time and go on saying it after the application's constant moves
# on. `test_normalisation_matches_the_database` is what keeps the live pair in step.
NOISE = " \t\n -‐‑–—.,'’‘\"«»()/\\"


_LITERAL = NOISE.replace("'", "''")
NAME_NORM = f"translate(name, '{_LITERAL}', '')"
BRAND_NORM = f"translate(brand, '{_LITERAL}', '')"


def upgrade() -> None:
    """Upgrade schema."""
    # Search matched the raw columns, so the punctuation in the *data* decided the
    # result as much as the punctuation in the query: "dral" could not reach
    # "Dr.Althea", and "round lab" could not reach "Round-Lab". Both sides are stripped
    # of the same characters now — the query in `like_pattern`, the stored side here.
    #
    # Generated rather than filled by the service: the xlsx import and the admin forms
    # both write these names, and a column either of them could leave stale would be a
    # search that silently stops finding things.
    op.add_column(
        'categories',
        sa.Column(
            'name_norm',
            sa.String(255),
            sa.Computed(NAME_NORM, persisted=True),
            nullable=False,
        ),
    )
    op.add_column(
        'products',
        sa.Column(
            'name_norm',
            sa.String(255),
            sa.Computed(NAME_NORM, persisted=True),
            nullable=False,
        ),
    )
    op.add_column(
        'products',
        sa.Column(
            'brand_norm',
            sa.String(255),
            sa.Computed(BRAND_NORM, persisted=True),
            nullable=True,
        ),
    )

    # The trigram indexes move to where the pattern now runs. pg_trgm is already
    # installed by 8bb0928ca06c.
    op.create_index(
        'ix_products_live_name_norm_trgm',
        'products',
        ['name_norm'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'name_norm': 'gin_trgm_ops'},
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.create_index(
        'ix_products_live_brand_norm_trgm',
        'products',
        ['brand_norm'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'brand_norm': 'gin_trgm_ops'},
        postgresql_where=sa.text('deleted_at IS NULL'),
    )

    # And the pair they replace goes, rather than staying as insurance: nothing does an
    # infix match on the raw columns any more, so they would be two GIN indexes rebuilt
    # on every product write — the whole cost of the xlsx import — for no reader at all.
    # The plain btrees beside them stay; those serve the name ordering and the
    # exact-match brand filter, which are not searches.
    op.drop_index('ix_products_live_name_trgm', table_name='products')
    op.drop_index('ix_products_live_brand_trgm', table_name='products')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_index(
        'ix_products_live_name_trgm',
        'products',
        ['name'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'name': 'gin_trgm_ops'},
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.create_index(
        'ix_products_live_brand_trgm',
        'products',
        ['brand'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'brand': 'gin_trgm_ops'},
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.drop_index('ix_products_live_brand_norm_trgm', table_name='products')
    op.drop_index('ix_products_live_name_norm_trgm', table_name='products')
    op.drop_column('products', 'brand_norm')
    op.drop_column('products', 'name_norm')
    op.drop_column('categories', 'name_norm')
