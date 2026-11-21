import pytest

from app.promotions.code_errors import PromoCodeInvalidError
from app.promotions.codes import CODE_ALPHABET, generate_code, validate_owner_code


def test_a_typed_code_is_normalised() -> None:
    assert validate_owner_code(" leto-2026 ") == "LETO-2026"
    assert validate_owner_code("ле то_2026!") == "ЛЕТО_2026!"


@pytest.mark.parametrize("raw", ["abc", "a" * 17, "", "   ", "a b c"])
def test_a_malformed_code_is_refused(raw: str) -> None:
    with pytest.raises(PromoCodeInvalidError):
        validate_owner_code(raw)


@pytest.mark.parametrize(
    "raw", ["abcd", "A" * 16, "0O1I2345", "лето", "ab_cd", "ab.cd", "SULU-AB3CD"]
)
def test_the_edges_of_the_format_pass(raw: str) -> None:
    assert validate_owner_code(raw) == raw.upper()


def test_a_generated_code_uses_the_alphabet() -> None:
    code = generate_code()

    assert len(code) == 8
    assert set(code) <= set(CODE_ALPHABET)
