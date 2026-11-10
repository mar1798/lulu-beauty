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


def multi_line(value: str) -> str:
    """`value` with its line breaks kept and everything else tidied: each line as
    `single_line` makes it, blank lines dropped, the whole trimmed.

    For free text a person types into a textarea about themselves — a delivery address
    with the flat on a line of its own reads better that way, and nothing prints it
    where a line break could pass for something else. Tabs and stray control
    characters go; a paste with empty lines between the parts comes out compact.
    """
    lines = (single_line(line) for line in value.splitlines())
    return "\n".join(line for line in lines if line)
