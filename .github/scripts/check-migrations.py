#!/usr/bin/env python3
"""Reports contracting operations in Alembic migrations.

Production never runs ``alembic downgrade``: the api container upgrades on every
start and nothing brings the schema back (see "Releases" in docs/deployment.md).
So a release may only carry expanding migrations — add a nullable column, a
table, an index — and a contracting one can be undone only by restoring a
backup, which is exactly the thing nobody wants to discover while rolling back.

Contracting is read as "the previous release stops working against this schema",
which is wider than dropping things: a `NOT NULL` column added without a default
breaks the old code's inserts just as surely as a dropped one breaks its selects.

Called by .github/workflows/release-tag.yml with the migrations a release adds
or changes; run it by hand the same way, before the release PR:

    python3 .github/scripts/check-migrations.py $(
      git diff --name-only --diff-filter=AM origin/master...HEAD \
        -- apps/api/migrations/versions
    )

Each finding is printed as ``path:line: operation``. Exit codes: 0 when there is
nothing contracting, 1 when there is, and 2 when a file could not be read or
parsed — a caller that treats anything non-zero as "found something" would turn
a broken file into a passing check, so the two cases are kept apart.
"""

from __future__ import annotations

import ast
import re
import sys
from collections.abc import Set as AbstractSet

# Dropping any of these takes data or a guarantee with it, and the code that was
# rolled back still expects both. `rename_table` is here for the same reason a
# renamed column is: the old code goes looking for the old name.
#
# `drop_index` deliberately isn't. The rule being enforced is "the previous
# release still runs against this schema", and it does run without an index —
# only slower. A dropped *unique* index is the argument for including it, but
# that is a constraint, and `drop_constraint` covers it.
CONTRACTING = {"drop_column", "drop_table", "drop_constraint", "rename_table"}

# op.execute() is the hole in everything above: `op.execute("ALTER TABLE …
# DROP COLUMN …")` is a drop that no amount of looking at call names will find.
# Flagging every execute would be useless here — the migrations in this
# repository use it for `CREATE EXTENSION`, `ALTER TYPE … ADD VALUE` and plain
# `UPDATE`s, all of them expanding, and a check that cries wolf on the ordinary
# case is a check that gets ignored. So the SQL itself is read.
CONTRACTING_SQL = (
    (re.compile(r"\bDROP\s+TABLE\b", re.I), "execute (DROP TABLE)"),
    (re.compile(r"\bDROP\s+COLUMN\b", re.I), "execute (DROP COLUMN)"),
    (re.compile(r"\bDROP\s+CONSTRAINT\b", re.I), "execute (DROP CONSTRAINT)"),
    # A type the previous release still names in its enums.
    (re.compile(r"\bDROP\s+TYPE\b", re.I), "execute (DROP TYPE)"),
    (re.compile(r"\bRENAME\s+(TO|COLUMN)\b", re.I), "execute (RENAME)"),
    (re.compile(r"\bSET\s+NOT\s+NULL\b", re.I), "execute (SET NOT NULL)"),
    # The SQL spelling of create_index(unique=True), create_unique_constraint
    # and create_check_constraint: rules the previous release's inserts may
    # break. Unlike the op.* calls, these are flagged even on a table the same
    # migration creates — telling which table the SQL names is parsing SQL, and
    # a new table's index belongs in op.create_index anyway.
    (re.compile(r"\bCREATE\s+UNIQUE\s+INDEX\b", re.I), "execute (CREATE UNIQUE INDEX)"),
    (
        re.compile(
            r"\bADD\s+(CONSTRAINT\s+(\"[^\"]*\"|\S+)\s+)?(UNIQUE|PRIMARY\s+KEY|CHECK|EXCLUDE)\b",
            re.I,
        ),
        "execute (ADD CONSTRAINT)",
    ),
)

# Rules on rows that the previous release inserts without knowing about them.
# Like a uniqueness rule, harmless only on a table the same migration creates.
CONSTRAINING = {"create_check_constraint", "create_exclude_constraint", "create_primary_key"}

# SQL that can hand the old code's rows a value in a column it never names — see
# refilled_columns(), which stops trusting any column once it sees one.
FILLS_COLUMN_SQL = re.compile(
    r"\bSET\s+DEFAULT\b|\bCREATE\s+(OR\s+REPLACE\s+)?(TRIGGER|FUNCTION|RULE)\b", re.I
)


def const_str(node: ast.expr | None) -> str | None:
    """The value of a plain string literal, or None for anything computed."""

    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def positional(node: ast.Call, index: int) -> ast.expr | None:
    """Argument ``index`` of a call, or None when it isn't there."""

    return node.args[index] if len(node.args) > index else None


def is_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def is_true(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is True


def new_tables(upgrade: ast.FunctionDef) -> set[str]:
    """Tables this migration creates — nothing done to them can break anything.

    A unique index or a `NOT NULL` column on a table that did not exist a moment
    ago constrains no data and no running code. Without this, the ordinary
    autogenerated shape (``create_table`` followed by ``create_index(unique=True)``
    on its own column) would fail the guard on every new table, and a check that
    cries wolf on the ordinary case is a check that gets ignored.
    """

    return {
        name
        for node in ast.walk(upgrade)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "create_table"
        for name in (const_str(positional(node, 0)),)
        if name is not None
    }


def fresh_nullable_columns(upgrade: ast.FunctionDef) -> set[tuple[str, str]]:
    """``(table, column)`` pairs this migration adds as nullable and leaves empty.

    A uniqueness rule on such a column is as harmless as one on a new table: the
    previous release doesn't know the column, so every row it inserts carries
    NULL there, and NULLs never collide under a Postgres unique constraint or
    index. The existing rows are all NULL too, so the rule is created over
    nothing. Only when the database leaves the column empty, though — a
    `server_default` or a `Computed` hands the old code's rows a value of its
    own choosing, and those can collide, which is why `database_fills_it` takes
    a column *out* of this set.

    A default that arrives afterwards does the same, and it may arrive in
    another migration of the same release — see `refilled_columns`, which the
    caller subtracts for every file in the release. Only a literal
    ``nullable=True`` (or none at all) and no ``primary_key`` count as nullable,
    and a ``**kwargs`` that could hide either, or a `server_default`, counts as
    not knowing.
    """

    fresh: set[tuple[str, str]] = set()

    for node in ast.walk(upgrade):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "add_column"
        ):
            continue

        table = const_str(positional(node, 0))
        for argument in node.args:
            if not (
                isinstance(argument, ast.Call)
                and isinstance(argument.func, ast.Attribute)
                and argument.func.attr == "Column"
            ):
                continue
            keywords = {keyword.arg: keyword.value for keyword in argument.keywords}
            column = const_str(positional(argument, 0))
            nullable = keywords.get("nullable")
            if (
                table is not None
                and column is not None
                and (nullable is None or is_true(nullable))
                and "primary_key" not in keywords
                and None not in keywords
                and only_name_type_and_foreign_keys(argument)
                and not database_fills_it(argument)
                and not {"schema", None} & {keyword.arg for keyword in node.keywords}
            ):
                fresh.add((table, column))

    return fresh


def only_name_type_and_foreign_keys(column: ast.Call) -> bool:
    """Whether a ``sa.Column(...)`` has nothing positional past its type but `ForeignKey`s.

    The rest of what a Column takes positionally — `DefaultClause`,
    `FetchedValue`, `Identity`, `Sequence`, `Computed` — is the database
    choosing a value, which `database_fills_it` doesn't try to list in full.
    A column that has any of them, or anything this can't name, is not one the
    old code is sure to leave NULL.
    """

    return all(
        isinstance(argument, ast.Call)
        and isinstance(argument.func, ast.Attribute)
        and argument.func.attr == "ForeignKey"
        for argument in column.args[2:]
    )


def execute_sql(node: ast.Call) -> ast.expr | None:
    """The statement argument of an ``execute`` call, or None when it has none.

    Positional or as the ``sqltext=`` (`op.execute`) / ``statement=``
    (`Connection.execute`) keyword — reading only ``args[0]`` let
    ``op.execute(sqltext="DROP TABLE …")`` through. A ``**kwargs`` is returned
    as the statement: `sql_text` can't read it, so the caller reports it.
    """

    if node.args:
        return node.args[0]
    return next(
        (
            keyword.value
            for keyword in node.keywords
            if keyword.arg in ("sqltext", "statement", None)
        ),
        None,
    )


def refilled_columns(upgrade: ast.FunctionDef) -> set[tuple[str, str]] | None:
    """Columns this migration may give a database-side value, or None for "any".

    `alter_column` on a column (a `server_default`, or anything else this
    doesn't try to tell apart) names it. An `op.execute` that sets a default,
    creates a trigger, or redefines a function an existing trigger may call
    can't be pinned to a column without parsing SQL, so it means every column —
    as does an `alter_column` whose table or column isn't a plain literal.
    """

    refilled: set[tuple[str, str]] = set()

    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr == "alter_column":
            table = const_str(positional(node, 0))
            column = const_str(positional(node, 1))
            if table is None or column is None:
                return None
            refilled.add((table, column))
        elif node.func.attr == "execute" and (statement := execute_sql(node)) is not None:
            sql = sql_text(statement)
            if sql is not None and FILLS_COLUMN_SQL.search(sql):
                return None

    return refilled


def only_fresh_columns(node: ast.Call, fresh: set[tuple[str, str]]) -> bool:
    """Whether a unique constraint or index covers only columns from `fresh`.

    `create_unique_constraint` and `create_index` share the shape
    ``(name, table, columns)``. Anything this can't read — a computed table, an
    expression in the column list, a ``**kwargs`` — is not waved through.
    Neither is ``postgresql_nulls_not_distinct=True``, which makes NULLs collide
    after all.
    """

    keywords = {keyword.arg: keyword.value for keyword in node.keywords}
    if {"postgresql_nulls_not_distinct", "schema", None} & keywords.keys():
        return False

    table = const_str(positional(node, 1))
    columns = positional(node, 2) or keywords.get("columns")
    if table is None or not isinstance(columns, (ast.List, ast.Tuple)) or not columns.elts:
        return False

    return all((table, const_str(column)) in fresh for column in columns.elts)


def database_fills_it(column: ast.Call) -> bool:
    """Whether the database supplies this column's value without being asked.

    Two ways it does. A `server_default` fills in the rows the old code inserts
    without naming the column. A `Computed` goes further: the column is
    `GENERATED ALWAYS … STORED`, so the old code not only may leave it out, it
    *must* — naming a generated column in an INSERT is an error. Either way the
    previous release keeps inserting rows, which is the whole question.

    `Computed` is looked for positionally as well as by keyword, because that is
    how `sa.Column("x", sa.String(), sa.Computed(…))` is written and how Alembic
    renders it.
    """

    keywords = {keyword.arg: keyword.value for keyword in column.keywords}
    if "server_default" in keywords or "computed" in keywords:
        return True

    return any(
        isinstance(argument, ast.Call)
        and isinstance(argument.func, ast.Attribute)
        and argument.func.attr == "Computed"
        for argument in column.args
    )


def added_column_not_null(node: ast.Call) -> bool:
    """``op.add_column(t, sa.Column(..., nullable=False))`` the old code can't fill.

    Not a drop, but contracting all the same: the previous release doesn't know
    the column, so every insert it makes lacks a value for it and the database
    refuses the row. When the database fills the value itself the old code keeps
    working — see `database_fills_it` — which is why that case is let through,
    and why the expanding way to add a required field it *can't* fill is two
    releases: nullable now, `NOT NULL` once the old code is gone.
    """

    for argument in node.args:
        if (
            isinstance(argument, ast.Call)
            and isinstance(argument.func, ast.Attribute)
            and argument.func.attr == "Column"
        ):
            keywords = {keyword.arg: keyword.value for keyword in argument.keywords}
            if is_false(keywords.get("nullable")) and not database_fills_it(argument):
                return True

    return False


def sql_text(node: ast.expr) -> str | None:
    """The readable SQL in an ``op.execute`` argument, or None if opaque.

    An f-string is read through: the interpolated parts are values, and the DDL
    verb is in the literal text around them. Anything else — a bare name, a
    `sa.text(built_elsewhere)` — cannot be judged from here and says so.
    """

    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, str) else None

    if isinstance(node, ast.JoinedStr):
        # " " between the parts so an interpolation can't splice two words into
        # one that the patterns above would then miss.
        return " ".join(
            part.value
            for part in node.values
            if isinstance(part, ast.Constant) and isinstance(part.value, str)
        )

    # sa.text("…") and the like: one string argument, same question one level in.
    if isinstance(node, ast.Call) and len(node.args) == 1 and not node.keywords:
        return sql_text(node.args[0])

    return None


def read_upgrade(path: str) -> ast.FunctionDef | None:
    """The ``upgrade()`` of a migration file, or None when it has none.

    Only upgrade(): every autogenerated migration mirrors itself in
    downgrade(), so looking at the whole file flags the very migration that
    *creates* the table it drops on the way back.
    """

    with open(path, encoding="utf-8") as handle:
        tree = ast.parse(handle.read(), path)

    return next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
        ),
        None,
    )


def findings(
    path: str, refilled_in_release: AbstractSet[tuple[str, str]] | None = frozenset()
) -> list[str]:
    """Contracting calls in the ``upgrade()`` of a single migration file.

    `refilled_in_release` is `refilled_columns` over the other migrations of
    the release: a nullable column this one adds is fresh only if none of them
    gives it a default either, since the old code meets the schema they leave
    behind together. None means one of them could have touched any column.
    """

    upgrade = read_upgrade(path)
    if upgrade is None:
        return []

    found: list[str] = []
    created = new_tables(upgrade)
    refilled = refilled_columns(upgrade)
    fresh = (
        set()
        if refilled is None or refilled_in_release is None
        else fresh_nullable_columns(upgrade) - refilled - refilled_in_release
    )

    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue

        name = node.func.attr
        keywords = {keyword.arg: keyword.value for keyword in node.keywords}

        if name in CONTRACTING:
            operation = name
        # A required column and a uniqueness rule are both promises the previous
        # release never made: it inserts rows without that column, and rows that
        # collide on that index — and a check, exclusion or primary key rule,
        # rows it never knew to keep. All are skipped on a table this migration
        # creates — see new_tables() — and uniqueness also on a nullable column
        # it adds — see fresh_nullable_columns(). The table name is the first
        # argument of add_column and the second of the others; a computed one
        # is not matched against `created` and so is checked rather than waved
        # through.
        elif name == "add_column" and added_column_not_null(node):
            if const_str(positional(node, 0)) in created:
                continue
            operation = "add_column (NOT NULL the database cannot fill)"
        elif name == "create_unique_constraint":
            if const_str(positional(node, 1)) in created or only_fresh_columns(node, fresh):
                continue
            operation = "create_unique_constraint"
        elif name == "create_index" and is_true(keywords.get("unique")):
            if const_str(positional(node, 1)) in created or only_fresh_columns(node, fresh):
                continue
            operation = "create_index (unique)"
        elif name in CONSTRAINING:
            if const_str(positional(node, 1)) in created:
                continue
            operation = name
        # alter_column narrows only when it renames or forbids NULL. Widening a
        # type (order_total to bigint) or making a column nullable is expanding,
        # and the old code keeps working against both.
        elif name == "alter_column" and "new_column_name" in keywords:
            operation = "alter_column (rename)"
        elif name == "alter_column" and is_false(keywords.get("nullable")):
            operation = "alter_column (NOT NULL)"
        elif name == "execute" and (statement := execute_sql(node)) is not None:
            sql = sql_text(statement)
            if sql is None:
                # Not a judgement that it contracts — a statement that this
                # script cannot tell, which is the one thing it must not report
                # as "expanding only".
                operation = "execute (SQL this script cannot read — check by hand)"
            else:
                operation = next(
                    (label for pattern, label in CONTRACTING_SQL if pattern.search(sql)),
                    "",
                )
                if not operation:
                    continue
        else:
            continue

        found.append(f"{path}:{node.lineno}: {operation}")

    return found


def main(paths: list[str]) -> int:
    found: list[str] = []

    # A file that won't parse is not a file without drops in it: reported on
    # stderr and with its own exit code, so the guard fails loudly instead of
    # waving the release through on an empty stdout.
    try:
        # The release as a whole first: a default set in one migration makes a
        # column another one adds non-fresh — see findings().
        refilled: set[tuple[str, str]] | None = set()
        for path in paths:
            upgrade = read_upgrade(path)
            if upgrade is None:
                continue
            here = refilled_columns(upgrade)
            refilled = None if here is None or refilled is None else refilled | here

        for path in paths:
            found.extend(findings(path, refilled))
    except (OSError, SyntaxError, ValueError) as error:
        print(f"cannot check {path}: {error}", file=sys.stderr)
        return 2

    for line in found:
        print(line)

    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
