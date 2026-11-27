import pytest

from app.banners.links import is_valid_banner_link


@pytest.mark.parametrize(
    "url",
    [
        "/",
        "/catalog",
        "/catalog?category=lips&page=2",
        "/promotions/black-friday#rules",
        "https://example.com",
        "https://example.com/news/1?utm=x",
        "https://sub.example.com:8443/a",
        "https://t.me/sululu",
    ],
)
def test_links_the_site_may_follow(url: str) -> None:
    assert is_valid_banner_link(url)


@pytest.mark.parametrize(
    "url",
    [
        "",
        "http://example.com",
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "//evil.example",
        "/\\evil.example",
        "/catalog with space",
        " /catalog",
        "/catalog\n",
        "/cat\talog",
        "https://",
        "https:///path",
        "https://exa mple.com",
        "https://example.com\\@evil.example",
        "ftp://example.com",
        "mailto:a@b.c",
        "catalog",
        "www.example.com",
    ],
)
def test_links_the_site_refuses(url: str) -> None:
    assert not is_valid_banner_link(url)
