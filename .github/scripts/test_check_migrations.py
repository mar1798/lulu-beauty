"""Tests for check-migrations.py — the guard that keeps a release rollback-able.

Run them the way CI does, from the repository root:

    uv run --project apps/api pytest .github/scripts/test_check_migrations.py

The script is the only thing standing between a contracting migration and a
release whose rollback is "restore from backup", and it is the kind of code that
fails silently: a pattern that stops matching reports "expanding only", which
reads exactly like a clean release. So both directions are asserted here — what
must be flagged, and what must not be.
"""

from __future__ import annotations

import importlib.util
import sys
import textwrap
from pathlib import Path
from types import ModuleType

import pytest

# The script is a CLI with a hyphen in its name, so it cannot be imported by
# name. Loading it by path keeps the name (which is what the docs and the
# workflow spell) and still gives the tests the functions.
SCRIPT = Path(__file__).with_name("check-migrations.py")


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_migrations", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = _load()


def migration(tmp_path: Path, upgrade: str, downgrade: str = "pass") -> str:
    """A migration file with the given bodies, as Alembic would generate it."""

    source = textwrap.dedent(
        """\
        import sqlalchemy as sa
        from alembic import op


        def upgrade() -> None:
        {upgrade}


        def downgrade() -> None:
        {downgrade}
        """
    ).format(
        upgrade=textwrap.indent(textwrap.dedent(upgrade).strip(), "    "),
        downgrade=textwrap.indent(textwrap.dedent(downgrade).strip(), "    "),
    )

    path = tmp_path / "abc123_migration.py"
    path.write_text(source, encoding="utf-8")
    return str(path)


def operations(tmp_path: Path, upgrade: str, downgrade: str = "pass") -> list[str]:
    """The operations reported for a migration, without paths or line numbers."""

    return [
        line.split(": ", 1)[1]
        for line in check.findings(migration(tmp_path, upgrade, downgrade))
    ]


# --- Expanding: the ordinary release, and it must stay quiet -----------------


def test_expanding_migration_is_silent(tmp_path: Path) -> None:
    assert (
        operations(
            tmp_path,
            """
            op.add_column("products", sa.Column("note", sa.String(), nullable=True))
            op.create_index("ix_products_note", "products", ["note"])
            op.create_table(
                "banners",
                sa.Column("id", sa.Integer(), nullable=False),
            )
            """,
        )
        == []
    )


def test_drop_index_is_allowed(tmp_path: Path) -> None:
    # The previous release runs without an index, only slower. A unique one is a
    # constraint, and drop_constraint covers that.
    assert operations(tmp_path, 'op.drop_index("ix_products_note", "products")') == []


def test_widening_alter_column_is_allowed(tmp_path: Path) -> None:
    assert (
        operations(
            tmp_path,
            """
            op.alter_column("orders", "total_cents", type_=sa.BigInteger())
            op.alter_column("orders", "comment", nullable=True)
            """,
        )
        == []
    )


# --- Contracting: the whole point -------------------------------------------


@pytest.mark.parametrize(
    ("call", "operation"),
    [
        ('op.drop_column("products", "note")', "drop_column"),
        ('op.drop_table("banners")', "drop_table"),
        ('op.drop_constraint("uq_products_slug", "products")', "drop_constraint"),
        ('op.rename_table("banners", "promos")', "rename_table"),
    ],
)
def test_drops_are_flagged(tmp_path: Path, call: str, operation: str) -> None:
    assert operations(tmp_path, call) == [operation]


def test_alter_column_rename_and_not_null_are_flagged(tmp_path: Path) -> None:
    assert operations(
        tmp_path, 'op.alter_column("products", "note", new_column_name="comment")'
    ) == ["alter_column (rename)"]
    assert operations(tmp_path, 'op.alter_column("products", "note", nullable=False)') == [
        "alter_column (NOT NULL)"
    ]


def test_required_column_without_a_default_is_flagged(tmp_path: Path) -> None:
    # The old code inserts rows without that column and the database refuses
    # them — contracting without dropping anything.
    assert operations(
        tmp_path,
        'op.add_column("products", sa.Column("sku", sa.String(), nullable=False))',
    ) == ["add_column (NOT NULL the database cannot fill)"]


def test_required_column_with_a_server_default_is_allowed(tmp_path: Path) -> None:
    assert (
        operations(
            tmp_path,
            """
            op.add_column(
                "products",
                sa.Column("sku", sa.String(), nullable=False, server_default=""),
            )
            """,
        )
        == []
    )


def test_required_generated_column_is_allowed(tmp_path: Path) -> None:
    """A `GENERATED ALWAYS … STORED` column the old code neither knows nor may name.

    `products.name_norm` is the live case (c7f2a8d15b40). `NOT NULL` with no
    `server_default` looks exactly like the flagged shape, but the database
    computes the value for every row — including the ones the previous release
    inserts, which could not name the column even if they knew about it.
    """

    assert (
        operations(
            tmp_path,
            """
            op.add_column(
                "products",
                sa.Column(
                    "name_norm",
                    sa.String(255),
                    sa.Computed("translate(name, ' -.', '')", persisted=True),
                    nullable=False,
                ),
            )
            """,
        )
        == []
    )


def test_required_generated_column_by_keyword_is_allowed(tmp_path: Path) -> None:
    """The same column written with `computed=` instead of positionally."""

    assert (
        operations(
            tmp_path,
            """
            op.add_column(
                "products",
                sa.Column(
                    "name_norm",
                    sa.String(255),
                    computed=sa.Computed("translate(name, ' -.', '')"),
                    nullable=False,
                ),
            )
            """,
        )
        == []
    )


def test_new_uniqueness_on_an_existing_table_is_flagged(tmp_path: Path) -> None:
    unique = 'op.create_unique_constraint("uq_p_slug", "products", ["slug"])'
    assert operations(tmp_path, unique) == ["create_unique_constraint"]
    assert operations(
        tmp_path, 'op.create_index("ix_p_slug", "products", ["slug"], unique=True)'
    ) == ["create_index (unique)"]


def test_everything_is_allowed_on_a_table_this_migration_creates(tmp_path: Path) -> None:
    # The autogenerated shape for any new table. Flagging it would make the
    # guard cry wolf on every release that adds one.
    assert (
        operations(
            tmp_path,
            """
            op.create_table(
                "banners",
                sa.Column("id", sa.Integer(), nullable=False),
                sa.Column("slug", sa.String(), nullable=False),
            )
            op.add_column("banners", sa.Column("title", sa.String(), nullable=False))
            op.create_index("ix_banners_slug", "banners", ["slug"], unique=True)
            op.create_unique_constraint("uq_banners_slug", "banners", ["slug"])
            """,
        )
        == []
    )


# --- downgrade() is not read -------------------------------------------------


def test_the_mirror_in_downgrade_is_ignored(tmp_path: Path) -> None:
    # The reason this is a parser and not a grep: every autogenerated migration
    # undoes itself in downgrade(), so reading the whole file would flag the very
    # migration that creates the table.
    assert (
        operations(
            tmp_path,
            'op.create_table("banners", sa.Column("id", sa.Integer(), nullable=False))',
            downgrade='op.drop_table("banners")',
        )
        == []
    )


def test_a_migration_without_upgrade_reports_nothing(tmp_path: Path) -> None:
    path = tmp_path / "no_upgrade.py"
    path.write_text("revision = 'abc123'\n", encoding="utf-8")
    assert check.findings(str(path)) == []


# --- op.execute: read as SQL, not trusted and not blanket-refused ------------


@pytest.mark.parametrize(
    "sql",
    [
        'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
        "ALTER TYPE orderstatus ADD VALUE 'CANCELLED_BY_OWNER'",
        "UPDATE products SET price_cents = 0 WHERE price_cents IS NULL",
    ],
)
def test_expanding_sql_is_allowed(tmp_path: Path, sql: str) -> None:
    assert operations(tmp_path, f"op.execute({sql!r})") == []


@pytest.mark.parametrize(
    ("sql", "operation"),
    [
        ("DROP TABLE banners", "execute (DROP TABLE)"),
        ("ALTER TABLE products DROP COLUMN note", "execute (DROP COLUMN)"),
        ("ALTER TABLE products DROP CONSTRAINT uq_p_slug", "execute (DROP CONSTRAINT)"),
        ("DROP TYPE orderstatus", "execute (DROP TYPE)"),
        ("ALTER TABLE products RENAME COLUMN note TO comment", "execute (RENAME)"),
        ("ALTER TABLE products ALTER COLUMN sku SET NOT NULL", "execute (SET NOT NULL)"),
    ],
)
def test_contracting_sql_is_flagged(tmp_path: Path, sql: str, operation: str) -> None:
    assert operations(tmp_path, f"op.execute({sql!r})") == [operation]


def test_sql_is_read_through_an_f_string_and_sa_text(tmp_path: Path) -> None:
    assert operations(tmp_path, 'op.execute(f"DROP TABLE {name}")') == ["execute (DROP TABLE)"]
    assert operations(tmp_path, 'op.execute(sa.text("DROP TABLE banners"))') == [
        "execute (DROP TABLE)"
    ]


def test_an_f_string_cannot_splice_two_words_into_one(tmp_path: Path) -> None:
    # The parts are joined with a space, so "DROP" + name + "TABLE" does not
    # become the literal "DROPTABLE" and slip past the pattern.
    assert operations(tmp_path, 'op.execute(f"DROP{sep}TABLE banners")') == [
        "execute (DROP TABLE)"
    ]


def test_sql_this_script_cannot_read_is_reported_rather_than_waved_through(
    tmp_path: Path,
) -> None:
    # "I could not tell" must never come out as "expanding only".
    assert operations(tmp_path, "op.execute(statement)") == [
        "execute (SQL this script cannot read — check by hand)"
    ]


# --- The exit codes the workflow branches on ---------------------------------


def test_exit_code_is_zero_for_an_expanding_release(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = migration(tmp_path, 'op.add_column("p", sa.Column("n", sa.String(), nullable=True))')
    assert check.main([path]) == 0
    assert capsys.readouterr().out == ""


def test_exit_code_is_one_and_findings_go_to_stdout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = migration(tmp_path, 'op.drop_column("products", "note")')
    assert check.main([path]) == 1

    out = capsys.readouterr().out.strip()
    assert out.startswith(f"{path}:")
    assert out.endswith(": drop_column")


def test_a_file_that_will_not_parse_exits_two(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Not "no drops found": the guard must fail loudly instead of waving a
    # release through on an empty stdout.
    path = tmp_path / "broken.py"
    path.write_text("def upgrade() -> None\n", encoding="utf-8")

    assert check.main([str(path)]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "cannot check" in captured.err


def test_a_missing_file_exits_two(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert check.main([str(tmp_path / "gone.py")]) == 2
    assert "cannot check" in capsys.readouterr().err


def test_no_arguments_is_a_clean_release(capsys: pytest.CaptureFixture[str]) -> None:
    # How the workflow calls it when a release carries no migrations at all.
    assert check.main([]) == 0
    assert capsys.readouterr().out == ""
