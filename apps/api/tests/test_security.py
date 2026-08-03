from app.auth.security import hash_password, verify_password


def test_verify_password_accepts_matching_password() -> None:
    password_hash = hash_password("correct-horse-battery-staple")

    assert verify_password(password_hash, "correct-horse-battery-staple") is True


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("correct-horse-battery-staple")

    assert verify_password(password_hash, "wrong-password") is False


def test_verify_password_rejects_malformed_hash() -> None:
    assert verify_password("not-a-real-hash", "anything") is False
