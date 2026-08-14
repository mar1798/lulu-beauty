import io

import openpyxl
import pytest

from app.catalog.import_service import (
    ImportFileError,
    ImportRowError,
    normalize_header,
    parse_csv_rows,
    parse_in_stock,
    parse_price_cents,
    parse_rows,
    parse_xlsx_rows,
    validate_headers,
)


def test_normalize_header_lowercases_and_joins_spaces_and_hyphens() -> None:
    assert normalize_header(" In Stock ") == "in_stock"
    assert normalize_header("In-Stock") == "in_stock"
    assert normalize_header("Category") == "category"
    assert normalize_header(None) == ""


@pytest.mark.parametrize(
    ("raw", "expected_cents"),
    [("25.50", 2550), ("0", 0), ("10", 1000), ("10.005", 1001)],
)
def test_parse_price_cents_valid(raw: str, expected_cents: int) -> None:
    assert parse_price_cents(raw) == expected_cents


@pytest.mark.parametrize("raw", [None, "", "  ", "-5", "not-a-number"])
def test_parse_price_cents_rejects_invalid(raw: str | None) -> None:
    with pytest.raises(ImportRowError):
        parse_price_cents(raw)


@pytest.mark.parametrize("raw", ["nan", "NaN", "inf", "Infinity", "-inf", "1e30"])
def test_parse_price_cents_rejects_values_decimal_accepts_but_the_column_cannot(
    raw: str,
) -> None:
    """Decimal() parses all of these. Left to reach the end of the function they raise
    (InvalidOperation on the NaN comparison, OverflowError on int(Infinity)) or overflow
    the 32-bit column at flush — none of which is an ImportRowError, so a single such
    cell would 500 the whole upload instead of being reported as one bad line."""
    with pytest.raises(ImportRowError):
        parse_price_cents(raw)


@pytest.mark.parametrize("raw", ["true", "1", "yes", "y", "да", "TRUE", " Yes "])
def test_parse_in_stock_truthy(raw: str) -> None:
    assert parse_in_stock(raw) is True


@pytest.mark.parametrize("raw", ["false", "0", "no", "n", "нет", "FALSE"])
def test_parse_in_stock_falsy(raw: str) -> None:
    assert parse_in_stock(raw) is False


def test_parse_in_stock_defaults_true_when_blank() -> None:
    assert parse_in_stock(None) is True
    assert parse_in_stock("") is True
    assert parse_in_stock("   ") is True


def test_parse_in_stock_rejects_garbage() -> None:
    with pytest.raises(ImportRowError):
        parse_in_stock("maybe")


def test_parse_csv_rows_normalizes_headers_and_numbers_from_two() -> None:
    csv_text = "Name,Slug,Price,In Stock\nRose Serum,rose-serum,25.50,true\nBad Row,bad-row,,\n"
    rows = parse_csv_rows(csv_text.encode("utf-8"))

    assert [row_number for row_number, _ in rows] == [2, 3]
    assert rows[0][1] == {
        "name": "Rose Serum",
        "slug": "rose-serum",
        "price": "25.50",
        "in_stock": "true",
    }


def test_parse_csv_rows_empty_file_has_no_rows() -> None:
    assert parse_csv_rows(b"") == []


def _build_xlsx(headers: list[str], data_rows: list[list[object]]) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.append(headers)
    for row in data_rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_parse_xlsx_rows_normalizes_headers() -> None:
    content = _build_xlsx(
        ["Name", "Slug", "Price", "Category"],
        [["Rose Serum", "rose-serum", 25.5, "skincare"]],
    )

    rows = parse_xlsx_rows(content)

    assert rows == [
        (2, {"name": "Rose Serum", "slug": "rose-serum", "price": "25.5", "category": "skincare"})
    ]


def test_parse_xlsx_rows_skips_fully_blank_rows() -> None:
    content = _build_xlsx(
        ["Name", "Slug", "Price"],
        [["Rose Serum", "rose-serum", 25.5], [None, None, None]],
    )

    rows = parse_xlsx_rows(content)

    assert len(rows) == 1


def test_parse_rows_dispatches_by_extension() -> None:
    csv_content = b"Name,Slug,Price\nA,a,1\n"
    assert parse_rows("products.csv", csv_content) == parse_csv_rows(csv_content)


def test_parse_rows_rejects_unsupported_extension() -> None:
    with pytest.raises(ImportFileError):
        parse_rows("products.txt", b"whatever")


def test_validate_headers_reports_missing_columns() -> None:
    rows = [(2, {"name": "A", "slug": "a"})]  # missing "price"
    error = validate_headers(rows)
    assert error is not None
    assert "price" in error


def test_validate_headers_reports_a_missing_brand_column() -> None:
    """A brand is mandatory per row, so a file without the column fails as a file.

    Reported once here rather than as an identical error on every single line."""
    rows = [(2, {"name": "A", "slug": "a", "price": "1"})]
    error = validate_headers(rows)
    assert error is not None
    assert "brand" in error


def test_validate_headers_passes_when_required_columns_present() -> None:
    rows = [(2, {"name": "A", "slug": "a", "price": "1", "brand": "Round Lab"})]
    assert validate_headers(rows) is None


def test_validate_headers_none_for_empty_rows() -> None:
    assert validate_headers([]) is None
