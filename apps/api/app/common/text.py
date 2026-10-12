import unicodedata


def single_line(value: str) -> str:
    """`value` as one line: every run of whitespace — line breaks and tabs included —
    becomes one space, other control characters are dropped, the ends are trimmed.

    For a person's name. It is printed into the bot's messages to the owner on a line of
    its own, and a name carrying a line break made up lines of its own there — up to a
    whole forged «Покупатель: …, +996…» line under the real one.
    """
    visible = "".join(
        char for char in value if char.isspace() or unicodedata.category(char) != "Cc"
    )
    return " ".join(visible.split())
