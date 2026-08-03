import re

PHONE_PATTERN = r"^\+[1-9]\d{7,14}$"


def normalize_phone(raw: str) -> str:
    """Normalizes a Telegram contact number (which may lack a leading '+') to E.164."""
    digits = re.sub(r"[^\d+]", "", raw)
    if not digits.startswith("+"):
        digits = f"+{digits}"
    return digits
