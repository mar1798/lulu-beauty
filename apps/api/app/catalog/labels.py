"""How a variant is named in text — one spelling for every message, sheet and list.

A product sold in 30 ml and 50 ml, or in "01 Nude" and "05 Rose", is not named by its
name alone, and every place that prints a line of an order has to say which variant it
is. One function rather than a copy per place, so the bot, the purchase list and the
checklist never disagree about whether it is "50 мл, 05 Rose" or "05 Rose 50 мл".
"""


def variant_label(volume_ml: int | None, shade: str | None) -> str | None:
    """ "50 мл, 05 Rose", "50 мл", "05 Rose" — or None for a variant with neither."""
    parts = [f"{volume_ml} мл" if volume_ml is not None else None, shade]
    label = ", ".join(part for part in parts if part)
    return label or None


def product_label(product_name: str, volume_ml: int | None, shade: str | None = None) -> str:
    """The product, and the variant when it has one — "Тональный крем, 30 мл, 21 Light".

    One text for every message about a line: for a product sold in 30 and 50 ml, or in
    several shades, the name alone names nothing. Without the variant, two notices about
    one order — "the price went up" and "the price went down" — would read as being about
    the same item and contradict each other.
    """
    variant = variant_label(volume_ml, shade)
    return product_name if variant is None else f"{product_name}, {variant}"
