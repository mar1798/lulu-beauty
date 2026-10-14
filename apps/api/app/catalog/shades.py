"""What a shade's name is, and when two names are the same shade.

A shade is free text the owner types ("05 Rose") or a price list carries ("05 rose "),
and it is half of a variant's identity — the other half being the volume. So the rule
for "is this the same shade" has to be one rule, used by the admin form, the import and
the photo tags alike: a second copy that trimmed differently would let one shade become
two variants depending on the path it came in by.
"""


def normalize_shade(raw: str | None) -> str | None:
    """The shade as it is stored and shown: inner whitespace collapsed, None if empty.

    The case is kept — "05 Rose" is how the brand writes it, and the customer reads it.
    Matching ignores case instead (`shade_key`).
    """
    shade = " ".join((raw or "").split())
    return shade or None


def shade_key(shade: str | None) -> str | None:
    """What two shades are compared by — the same expression the unique index uses."""
    shade = normalize_shade(shade)
    return None if shade is None else shade.lower()
