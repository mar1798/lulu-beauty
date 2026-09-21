"""Search-text normalisation, shared by the query and the columns it runs against.

Someone typing "dral" means `Dr.Althea`, and "round lab" means `Round-Lab`. Neither
match is possible while the pattern runs against the raw column: the punctuation is in
the *data* as much as in the query, so normalising one side alone changes nothing.

Both sides are therefore stripped of the same characters. The query is stripped here;
the stored side is a generated column that applies the identical `translate()` in SQL
(`Product.name_norm`, `Product.brand_norm`, `Category.name_norm`). The two spellings of
one rule are the standing risk of this module — they drift silently, and a search that
finds nothing is the only symptom — so `NOISE` is the single source of both, and
`test_normalisation_matches_the_database` compares them row by row.
"""

# Punctuation and spacing that carry no meaning for a catalogue search: the ways a brand
# can be written down without becoming a different brand. Deliberately *not* here:
#
#   %  and  _   — LIKE wildcards. Dropping them from the data would make "50%" match a
#                 name containing plain "50", and the escaping in `like_pattern` exists
#                 precisely so that a typed "50%" stays literal.
#   ё / е       — a letter substitution, not punctuation. It belongs to a different
#                 decision (so does transliterating "Роунд Лаб" onto "Round Lab") and is
#                 not made here.
NOISE = " \t\n -‐‑–—.,'’‘\"«»()/\\"

# The same set as a SQL string literal for `translate(col, FROM, '')`, so the column
# definitions in `models.py` cannot spell the rule differently from the function above.
# Single quotes double, per SQL; nothing else needs escaping with
# standard_conforming_strings on, which is the default and what this database runs.
NOISE_SQL = NOISE.replace("'", "''")

_STRIPPED = str.maketrans("", "", NOISE)


def normalize_search(value: str) -> str:
    """The comparable form of a name, a brand or a query: its noise characters removed.

    Case is left alone — matching stays `ILIKE`, which is case-insensitive already and
    which `gin_trgm_ops` indexes as-is. A `lower()` in the generated column would buy
    nothing and would put a collation-dependent function inside a stored expression.
    """
    return value.translate(_STRIPPED)
