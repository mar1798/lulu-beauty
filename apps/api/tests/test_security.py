from app.auth.security import hash_token


def test_hash_token_is_deterministic_and_unique() -> None:
    assert hash_token("token-a") == hash_token("token-a")
    assert hash_token("token-a") != hash_token("token-b")


def test_hash_token_output_is_a_sha256_digest() -> None:
    """Fixed width matters: the column storing it is String(255) and is UNIQUE."""
    assert len(hash_token("token-a")) == 64
