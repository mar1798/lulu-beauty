"""The product description as the admin editor writes it: a small, fixed subset of HTML.

The editor in the admin panel (Tiptap) produces HTML, and the storefront renders it — so
this module is the trust boundary between the two. It does not trust the editor to have
limited itself: whatever arrives is cleaned against the same short list of tags the editor
offers (paragraphs, bold, italic, lists, one heading level, links), and anything else is
unwrapped to its text. The list is kept in step with the editor's extensions and with the
storefront's `RichText` renderer, which applies the same list again on the way out.

Everything that is not the product page — `<meta name="description">`, the JSON-LD, the
catalogue import and the xlsx export — keeps reading `Product.description` as plain text.
That column is derived here from the HTML on every save, so none of them has to learn that
the description can have markup.
"""

from dataclasses import dataclass
from html.parser import HTMLParser

import nh3

ALLOWED_TAGS = frozenset({"p", "br", "strong", "em", "ul", "ol", "li", "h2", "a"})
ALLOWED_ATTRIBUTES = {"a": {"href"}}
ALLOWED_URL_SCHEMES = frozenset({"http", "https", "mailto", "tel"})
# A description links to a brand site or a how-to at most: nothing the shop vouches for,
# so a search engine is told not to count it, and the opened page gets no opener.
LINK_REL = "noopener noreferrer nofollow"

# Tags that end a line of the plain-text version. `li` is here too: a list flattened into
# one run-on line reads as a single sentence in a search snippet.
_BLOCK_TAGS = frozenset({"p", "h2", "li"})


@dataclass(frozen=True)
class Description:
    """Both forms of one description, or neither: `None` in both means "no description"."""

    html: str | None
    text: str | None


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "br":
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def text(self) -> str:
        lines = (" ".join(line.split()) for line in "".join(self._parts).splitlines())
        return "\n".join(line for line in lines if line)


def clean_html(html: str) -> str:
    """The HTML with everything outside the editor's vocabulary taken out."""
    return nh3.clean(
        html,
        tags=set(ALLOWED_TAGS),
        attributes={tag: set(names) for tag, names in ALLOWED_ATTRIBUTES.items()},
        url_schemes=set(ALLOWED_URL_SCHEMES),
        link_rel=LINK_REL,
    )


def html_to_text(html: str) -> str:
    """The description as plain text: one line per paragraph, heading or list item."""
    extractor = _TextExtractor()
    extractor.feed(html)
    extractor.close()
    return extractor.text()


def description_from_html(html: str | None) -> Description:
    """What gets stored for the HTML the editor sent.

    An editor with nothing typed in it still sends `<p></p>`; that is stored as no
    description at all rather than as an empty paragraph, so the product page and the
    meta tag agree that there is nothing to show.
    """
    if html is None:
        return Description(html=None, text=None)
    cleaned = clean_html(html)
    text = html_to_text(cleaned)
    if not text:
        return Description(html=None, text=None)
    return Description(html=cleaned, text=text)
