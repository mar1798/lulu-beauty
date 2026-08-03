from pydantic import BaseModel, ConfigDict


def to_camel_case(snake_str: str) -> str:
    head, *tail = snake_str.split("_")
    return head + "".join(word.capitalize() for word in tail)


class CamelModel(BaseModel):
    """Base for request/response schemas: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel_case, populate_by_name=True)
