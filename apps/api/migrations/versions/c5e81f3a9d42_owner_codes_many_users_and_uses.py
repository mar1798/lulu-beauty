"""owner codes: several customers, several uses

Revision ID: c5e81f3a9d42
Revises: b83e9006c6fe
Create Date: 2026-11-23 18:00:00.000000

A personal owner's code may now be given to several customers (`promotion_code_users`,
filled from `promotions.assigned_user_id`), and used by each of them more than once
(`promotions.uses_per_customer`, NULL for no limit), but at most once per cycle
(`order_promotions.code_cycle_id` and its unique index).

Rollback-safe, but the `Migration guard` reports the two unique indexes and wants a
`[contracting]` marker. Neither refuses a row the previous release writes:

- `uq_order_promotions_live_participant` is recreated with one more condition,
  `code_cycle_id IS NULL`. The previous release never sets that column, so for its rows
  the index is the one it had.
- `uq_order_promotions_live_code_cycle` covers only rows with `code_cycle_id` set, which
  the previous release never writes.

`assigned_user_id` stays and is still written (the first customer), so a rolled-back
release sees a personal code as personal. `uses_per_customer` defaults to 1 in the
database, the previous release's only rule.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e81f3a9d42'
down_revision: Union[str, Sequence[str], None] = 'b83e9006c6fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'promotion_code_users',
        sa.Column('promotion_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['promotion_id'], ['promotions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('promotion_id', 'user_id'),
    )
    op.create_index(
        op.f('ix_promotion_code_users_user_id'), 'promotion_code_users', ['user_id']
    )
    op.execute(
        "INSERT INTO promotion_code_users (promotion_id, user_id, created_at) "
        "SELECT id, assigned_user_id, created_at FROM promotions "
        "WHERE code IS NOT NULL AND assigned_user_id IS NOT NULL"
    )

    op.add_column(
        'promotions',
        sa.Column('uses_per_customer', sa.Integer(), server_default=sa.text('1'), nullable=True),
    )

    op.add_column('order_promotions', sa.Column('code_cycle_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_order_promotions_code_cycle_id_order_cycles',
        'order_promotions',
        'order_cycles',
        ['code_cycle_id'],
        ['id'],
        ondelete='CASCADE',
    )
    # The owner's codes already used: each participation names its order's cycle.
    op.execute(
        "UPDATE order_promotions AS op SET code_cycle_id = o.cycle_id "
        "FROM orders AS o, promotions AS p "
        "WHERE o.id = op.order_id AND p.id = op.promotion_id AND p.code IS NOT NULL"
    )

    op.drop_index(
        'uq_order_promotions_live_participant',
        table_name='order_promotions',
        postgresql_where=sa.text('released_at IS NULL AND promotion_id IS NOT NULL'),
    )
    op.create_index(
        'uq_order_promotions_live_participant',
        'order_promotions',
        ['promotion_id', 'user_id'],
        unique=True,
        postgresql_where=sa.text(
            'released_at IS NULL AND promotion_id IS NOT NULL AND code_cycle_id IS NULL'
        ),
    )
    op.create_index(
        'uq_order_promotions_live_code_cycle',
        'order_promotions',
        ['promotion_id', 'user_id', 'code_cycle_id'],
        unique=True,
        postgresql_where=sa.text('released_at IS NULL AND code_cycle_id IS NOT NULL'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_order_promotions_live_code_cycle', table_name='order_promotions')
    op.drop_index('uq_order_promotions_live_participant', table_name='order_promotions')
    op.create_index(
        'uq_order_promotions_live_participant',
        'order_promotions',
        ['promotion_id', 'user_id'],
        unique=True,
        postgresql_where=sa.text('released_at IS NULL AND promotion_id IS NOT NULL'),
    )
    op.drop_constraint(
        'fk_order_promotions_code_cycle_id_order_cycles', 'order_promotions', type_='foreignkey'
    )
    op.drop_column('order_promotions', 'code_cycle_id')
    op.drop_column('promotions', 'uses_per_customer')
    op.drop_index(op.f('ix_promotion_code_users_user_id'), table_name='promotion_code_users')
    op.drop_table('promotion_code_users')
