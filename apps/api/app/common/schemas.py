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


def require_not_null[T](value: T) -> T:
    """Rejects an explicit `null` for a field that is optional only in the PATCH sense.

    A PATCH schema spells every field `X | None = None` so that omitting it means "leave
    it alone" — `model_dump(exclude_unset=True)` then never mentions it. But `None` is
    also a value a client can send, and the services assign whatever the dump contains
    straight onto the model: for a NOT NULL column that reached the database as a null
    write and came back as an IntegrityError, i.e. a 500 on a malformed request where a
    422 naming the field is what the caller needed.

    Used as a `mode="before"` validator, which pydantic runs only for fields that were
    actually supplied — so "omitted" and "explicitly null" stay distinguishable, which is
    the whole point of the pattern.
    """
    if value is None:
        raise ValueError("не может быть null")
    return value
