import hashlib


def hash_token(token: str) -> str:
    """Fast, deterministic digest for indexed lookup of high-entropy tokens.

    Suitable precisely because the inputs are random 32-byte secrets (refresh tokens,
    login-session secrets): there is nothing to brute-force, so the slow, salted hashing
    a password would require would buy nothing and cost a lookup.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
