import pytest

from app.catalog.search import normalize_search
from app.catalog.service import like_pattern


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Dr.Althea", "DrAlthea"),
        ("Round Lab", "RoundLab"),
        ("round-lab", "roundlab"),
        ("I'm from", "Imfrom"),
        ("A’pieu", "Apieu"),
        ("Крем, 50 мл", "Крем50мл"),
        ("Anua — Heartleaf", "AnuaHeartleaf"),
        (" toner ", "toner"),
    ],
)
def test_noise_characters_are_dropped(value: str, expected: str) -> None:
    assert normalize_search(value) == expected


@pytest.mark.parametrize("value", ["50%", "under_score", "ёлка", "SPF50"])
def test_meaningful_characters_survive(value: str) -> None:
    """Wildcards keep their place in the text, and letters are never substituted.

    `%` and `_` are escaped rather than stripped, so they have to reach `like_pattern`
    intact; `ё` is a letter, and folding it onto `е` is a decision this rule does not make.
    """
    assert normalize_search(value) == value


def test_normalisation_runs_before_escaping() -> None:
    """The order matters: escaping adds backslashes, normalisation removes them.

    Done the other way round, `like_pattern` would strip the very backslashes it had
    just added and hand Postgres an unescaped wildcard.
    """
    assert like_pattern("50% off") == "%50\\%off%"
    assert like_pattern("a\\b") == "%ab%"
