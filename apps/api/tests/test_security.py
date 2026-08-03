from app.auth.security import generate_otp_code, hash_password, hash_token, verify_password


def test_generate_otp_code_is_six_digits() -> None:
    for _ in range(50):
        code = generate_otp_code()
        assert len(code) == 6
        assert code.isdigit()


def test_hash_token_is_deterministic_and_unique() -> None:
    assert hash_token("token-a") == hash_token("token-a")
    assert hash_token("token-a") != hash_token("token-b")


def test_verify_password_accepts_matching_password() -> None:
    password_hash = hash_password("correct-horse-battery-staple")

    assert verify_password(password_hash, "correct-horse-battery-staple") is True


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("correct-horse-battery-staple")

    assert verify_password(password_hash, "wrong-password") is False


def test_verify_password_rejects_malformed_hash() -> None:
    assert verify_password("not-a-real-hash", "anything") is False
