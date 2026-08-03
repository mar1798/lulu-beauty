import io
import uuid
from datetime import UTC, datetime

import openpyxl

from app.export.service import (
    HEADER,
    OrderExportRow,
    build_orders_workbook,
    sanitize_filename_label,
)


def _row(**overrides: object) -> OrderExportRow:
    defaults: dict[str, object] = {
        "order_id": uuid.uuid4(),
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        "customer_name": "Jane Doe",
        "customer_phone": "+15551234567",
        "status": "PENDING",
        "note": "",
        "product_name": "Rose Serum",
        "quantity": 2,
        "unit_price_cents": 1500,
        "order_total_cents": 3000,
    }
    defaults.update(overrides)
    return OrderExportRow(**defaults)  # type: ignore[arg-type]


def test_build_orders_workbook_writes_header_row() -> None:
    content = build_orders_workbook([])

    workbook = openpyxl.load_workbook(io.BytesIO(content))
    sheet = workbook.active
    assert sheet is not None
    assert sheet.title == "Orders"
    header_row = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
    assert header_row == HEADER


def test_build_orders_workbook_converts_cents_to_currency_units() -> None:
    row = _row(quantity=3, unit_price_cents=1000, order_total_cents=3000)

    content = build_orders_workbook([row])

    workbook = openpyxl.load_workbook(io.BytesIO(content))
    sheet = workbook.active
    assert sheet is not None
    data_row = [cell.value for cell in next(sheet.iter_rows(min_row=2, max_row=2))]
    assert data_row[-3:] == [10.0, 30.0, 30.0]  # unit price, line total, order total


def test_build_orders_workbook_one_row_per_order_item() -> None:
    order_id = uuid.uuid4()
    rows = [
        _row(order_id=order_id, product_name="Rose Serum"),
        _row(order_id=order_id, product_name="Lip Balm"),
    ]

    content = build_orders_workbook(rows)

    workbook = openpyxl.load_workbook(io.BytesIO(content))
    sheet = workbook.active
    assert sheet is not None
    assert sheet.max_row == 3  # header + 2 item rows


def test_sanitize_filename_label_keeps_alphanumeric_dash_underscore() -> None:
    assert sanitize_filename_label("June 2026 / Batch #1") == "June-2026---Batch--1"


def test_sanitize_filename_label_passthrough_for_safe_label() -> None:
    assert sanitize_filename_label("new-year-batch_2") == "new-year-batch_2"
