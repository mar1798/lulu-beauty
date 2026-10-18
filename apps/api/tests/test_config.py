import pytest
from pydantic import ValidationError

from app.config import Settings


def _settings(google_review_url: str) -> Settings:
    # Without the .env: the rest of the fields come from the placeholders in conftest.
    return Settings(_env_file=None, google_review_url=google_review_url)  # type: ignore[call-arg]


def test_google_review_url_keeps_an_https_link() -> None:
    url = "https://g.page/r/abc/review"
    assert _settings(f"  {url}\n").google_review_url == url


def test_google_review_url_may_stay_empty() -> None:
    assert _settings("   ").google_review_url == ""


@pytest.mark.parametrize(
    "url",
    ["g.page/r/abc/review", "http://g.page/r/abc/review", "https://", "https://g.page/r/a b"],
)
def test_google_review_url_refuses_what_telegram_would(url: str) -> None:
    """Telegram drops the whole message over a bad url button, so the thanks after
    pickup would vanish; better the API refuses to start."""
    with pytest.raises(ValidationError):
        _settings(url)
