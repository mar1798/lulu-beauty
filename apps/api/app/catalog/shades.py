"""What a shade's name is, and when two names are the same shade.

A shade is free text the owner types ("05 Rose") or a price list carries ("05 rose "),
and it is half of a variant's identity — the other half being the volume. So the rule
for "is this the same shade" has to be one rule, used by the admin form, the import and
the photo tags alike: a second copy that trimmed differently would let one shade become
two variants depending on the path it came in by.

What the shades are *called* lives here too (`ShadeLabel`): the name of the axis rather than
a value on it.
"""

import enum


class ShadeLabel(enum.StrEnum):
    """What the product calls its shades — "Тон" for a foundation, "Аромат" for a perfume.

    A product's own setting, not a variant's: one axis has one name. A closed list rather
    than free text because the word is declined wherever it is printed ("Выбрать цвет",
    "Для всех оттенков", "Укажите аромат"), and the site keeps every form of
    each value (`packages/widgets/src/utils/shadeLabel.ts`). A free word could not be declined.
    Only the storefront and the admin form say it: an order line prints the shade's value
    alone ("Помада, 05 Rose"), so nothing is snapshotted.

    Adding a value is an `ALTER TYPE shade_label ADD VALUE` migration plus its forms on the
    site and its spelling in `SHADE_LABEL_NAMES`.
    """

    TONE = "TONE"
    COLOR = "COLOR"
    SHADE = "SHADE"
    SCENT = "SCENT"


# The Russian word for each value, as the products sheet writes it and the import reads it
# back. The site keeps its own copy with every case, which has to agree with this one.
SHADE_LABEL_NAMES = {
    ShadeLabel.TONE: "Тон",
    ShadeLabel.COLOR: "Цвет",
    ShadeLabel.SHADE: "Оттенок",
    ShadeLabel.SCENT: "Аромат",
}


def parse_shade_label(raw: str) -> ShadeLabel | None:
    """A sheet's cell as a label — "Цвет", "цвет" or "COLOR" alike; None for anything else."""
    text = raw.strip().lower()
    for label, name in SHADE_LABEL_NAMES.items():
        if text in (name.lower(), label.value.lower()):
            return label
    return None


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
