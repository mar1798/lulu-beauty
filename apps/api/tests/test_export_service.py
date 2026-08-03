import io
import uuid
from datetime import UTC, datetime

import openpyxl

from app.export.service import (
    HEADER,
    OrderExportRow,
    build_orders_workbook,
    content_disposition,
    readable_filename_label,
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


def test_sanitize_filename_label_drops_non_ascii() -> None:
    """Regression: Cyrillic is alnum in Python, so it used to survive into the header."""
    sanitized = sanitize_filename_label("Июнь 2030")
    assert sanitized.isascii()
    assert sanitized.endswith("2030")
    assert sanitize_filename_label("june-2030") == "june-2030"


def test_readable_label_keeps_cyrillic_but_drops_path_characters() -> None:
    assert readable_filename_label("Июнь 2030") == "Июнь-2030"
    assert readable_filename_label("a/b:c") == "a-b-c"


def test_content_disposition_is_latin1_encodable_and_keeps_extension() -> None:
    header = content_disposition("orders-Июнь-2030.xlsx")

    # Starlette encodes response headers as latin-1; a non-encodable value was a 500.
    header.encode("latin-1")
    assert 'filename="orders-' in header
    assert '2030.xlsx"' in header  # the extension survives the ASCII fallback
    assert "filename*=UTF-8''" in header
    assert "%D0%98%D1%8E%D0%BD%D1%8C" in header  # percent-encoded "Июнь"


def test_content_disposition_handles_ascii_filename_unchanged() -> None:
    header = content_disposition("orders-all-cycles.xlsx")
    assert 'filename="orders-all-cycles.xlsx"' in header
