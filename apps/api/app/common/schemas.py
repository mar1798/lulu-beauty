from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


def to_camel_case(snake_str: str) -> str:
    head, *tail = snake_str.split("_")
    return head + "".join(word.capitalize() for word in tail)


class CamelModel(BaseModel):
    """Base for request/response schemas: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel_case, populate_by_name=True)


class PageResponse(CamelModel, Generic[T]):  # noqa: UP046 - PEP 695 generics aren't used elsewhere yet
    """Shared pagination envelope — used by catalog listings and admin order listings."""

    items: list[T]
    total: int
    page: int
    page_size: int
