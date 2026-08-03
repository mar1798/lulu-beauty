from datetime import UTC, datetime

from app.cycles.schemas import CycleCreateRequest, CycleUpdateRequest


def test_cycle_create_accepts_camel_case_input() -> None:
    request = CycleCreateRequest.model_validate(
        {"deadlineAt": "2030-01-01T00:00:00Z", "label": "New Year Batch"}
    )
    assert request.deadline_at == datetime(2030, 1, 1, tzinfo=UTC)
    assert request.label == "New Year Batch"


def test_cycle_create_label_optional() -> None:
    request = CycleCreateRequest(deadline_at=datetime(2030, 1, 1, tzinfo=UTC))
    assert request.label is None


def test_cycle_update_all_fields_optional() -> None:
    request = CycleUpdateRequest()
    assert request.model_dump(exclude_unset=True) == {}


def test_cycle_update_only_serializes_provided_fields() -> None:
    request = CycleUpdateRequest(label="Renamed")
    assert request.model_dump(exclude_unset=True) == {"label": "Renamed"}
