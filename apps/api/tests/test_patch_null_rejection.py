"""An explicit `null` in a PATCH body must be a 422, not a NOT NULL violation.

Every PATCH schema here spells its fields `X | None = None` so that an omitted field
means "leave it alone" (`model_dump(exclude_unset=True)` drops it). The services then
assign whatever the dump contains straight onto the model — so for a field backed by a
NOT NULL column, an explicitly-sent `null` used to reach Postgres as a null write and
come back as an IntegrityError, i.e. a 500 on a malformed request.

Each schema is checked from both sides: the field still has to be omittable, and it
still has to accept a real value.
"""

import pytest
from pydantic import ValidationError

from app.catalog.schemas import CategoryUpdateRequest, ProductUpdateRequest
from app.cycles.schemas import CycleUpdateRequest
from app.users.schemas import UserUpdateRequest

NOT_NULL_FIELDS = [
    (UserUpdateRequest, "name", "Аня"),
    (CategoryUpdateRequest, "name", "Уход"),
    (CategoryUpdateRequest, "slug", "care"),
    (CategoryUpdateRequest, "sortOrder", 3),
    (ProductUpdateRequest, "name", "Тонер"),
    (ProductUpdateRequest, "slug", "toner"),
    (ProductUpdateRequest, "priceCents", 1000),
    (ProductUpdateRequest, "inStock", False),
    (CycleUpdateRequest, "deadlineAt", "2030-09-01T12:00:00+00:00"),
]

NULLABLE_FIELDS = [
    (ProductUpdateRequest, "description"),
    (ProductUpdateRequest, "volumeMl"),
    (ProductUpdateRequest, "categoryId"),
    (CycleUpdateRequest, "label"),
]


@pytest.mark.parametrize(("schema", "field", "value"), NOT_NULL_FIELDS)
def test_explicit_null_is_rejected(schema: type, field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        schema(**{field: None})


@pytest.mark.parametrize(("schema", "field", "value"), NOT_NULL_FIELDS)
def test_a_real_value_still_passes(schema: type, field: str, value: object) -> None:
    assert field in schema(**{field: value}).model_dump(exclude_unset=True, by_alias=True)


@pytest.mark.parametrize(("schema", "field", "value"), NOT_NULL_FIELDS)
def test_omitting_the_field_still_means_unchanged(schema: type, field: str, value: object) -> None:
    assert schema().model_dump(exclude_unset=True) == {}


@pytest.mark.parametrize(("schema", "field"), NULLABLE_FIELDS)
def test_nullable_fields_can_still_be_cleared(schema: type, field: str) -> None:
    """The other half of the rule: these columns are nullable, and clearing them is an edit."""
    assert field in schema(**{field: None}).model_dump(exclude_unset=True, by_alias=True)
