"""Where a news slide may point: a path on this site or an https address.

Everything else is refused — `http:` (the site is https only), `javascript:` and `data:`
(script in a link), and `//host` or `/\\host` (a path that browsers read as another site).
"""

from urllib.parse import urlsplit


def is_valid_banner_link(url: str) -> bool:
    if not url or any(char.isspace() or ord(char) < 0x20 or ord(char) == 0x7F for char in url):
        return False
    if url.startswith("/"):
        return not url.startswith(("//", "/\\")) and "\\" not in url
    if not url.startswith("https://") or "\\" in url:
        return False
    try:
        parts = urlsplit(url)
        return bool(parts.hostname) and parts.scheme == "https"
    except ValueError:
        return False
