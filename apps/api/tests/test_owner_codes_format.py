import uuid

import pytest

from app.promotions.code_errors import PromoCodeInvalidError
from app.promotions.codes import CODE_ALPHABET, generate_code, validate_owner_code
from app.promotions.models import Promotion
from app.promotions.owner_codes import handed_to


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


def _code(*, enabled: bool = True) -> Promotion:
    return Promotion(code="LETO2026", is_enabled=enabled, deleted_at=None)


def test_a_new_personal_code_goes_to_its_customers() -> None:
    alice, bob = uuid.uuid4(), uuid.uuid4()
    assert handed_to(_code(), [alice, bob]) == [alice, bob]


def test_a_general_or_switched_off_code_goes_to_nobody() -> None:
    assert handed_to(_code(), []) == []
    assert handed_to(_code(enabled=False), [uuid.uuid4()]) == []


def test_adding_or_switching_on_hands_it_over_but_an_edit_does_not() -> None:
    alice, bob = uuid.uuid4(), uuid.uuid4()
    code = _code()

    assert handed_to(code, [alice, bob], was_user_ids=[alice], was_enabled=True) == [bob]
    assert handed_to(code, [alice], was_user_ids=[alice], was_enabled=False) == [alice]
    assert handed_to(code, [alice], was_user_ids=[alice, bob], was_enabled=True) == []
