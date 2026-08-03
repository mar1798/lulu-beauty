from app.common.phone import normalize_phone


def test_normalize_phone_adds_missing_plus() -> None:
    assert normalize_phone("996700123456") == "+996700123456"


def test_normalize_phone_keeps_existing_plus() -> None:
    assert normalize_phone("+996700123456") == "+996700123456"


def test_normalize_phone_strips_formatting() -> None:
    assert normalize_phone("+996 (700) 123-456") == "+996700123456"
