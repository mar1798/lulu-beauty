import csv
import io
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Category, Product
from app.catalog.schemas import SLUG_PATTERN, ImportRowErrorResponse, ImportSummaryResponse
from app.common.limits import MAX_PRICE_CENTS

REQUIRED_HEADERS = {"name", "slug", "price"}
TRUTHY_VALUES = {"true", "1", "yes", "y", "да"}
FALSY_VALUES = {"false", "0", "no", "n", "нет"}


class ImportFileError(Exception):
    pass


class ImportRowError(Exception):
    pass


def normalize_header(raw: str | None) -> str:
    return (raw or "").strip().lower().replace(" ", "_").replace("-", "_")


def parse_price_cents(raw: str | None) -> int:
    text = (raw or "").strip()
    if not text:
        raise ImportRowError("price is required")
    try:
        value = Decimal(text)
    except InvalidOperation as error:
        raise ImportRowError(f"invalid price: {raw!r}") from error
    # Decimal() happily parses "nan" and "inf". Both then blow up further down —
    # NaN raises on the comparison, Infinity on int() — and an exception here is not a
    # row error: it escapes import_file() and turns the whole upload into a 500, losing
    # every valid row in the file along with the report of what was wrong.
    if not value.is_finite():
        raise ImportRowError(f"invalid price: {raw!r}")
    if value < 0:
        raise ImportRowError("price must not be negative")

    cents = int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))
    # price_cents is a 32-bit column; past that the row fails at flush, i.e. again as a
    # 500 for the whole file rather than as one reported line.
    if cents > MAX_PRICE_CENTS:
        raise ImportRowError(f"price is too large: {raw!r}")
    return cents


def parse_in_stock(raw: str | None) -> bool:
    text = (raw or "").strip().lower()
    if not text:
        return True
    if text in TRUTHY_VALUES:
        return True
    if text in FALSY_VALUES:
        return False
    raise ImportRowError(f"invalid inStock value: {raw!r}")


def parse_csv_rows(content: bytes) -> list[tuple[int, dict[str, str]]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ImportFileError("file is not valid UTF-8 text") from error

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return []

    rows: list[tuple[int, dict[str, str]]] = []
    for row_number, row in enumerate(reader, start=2):
        rows.append((row_number, {normalize_header(k): (v or "") for k, v in row.items()}))
    return rows


def parse_xlsx_rows(content: bytes) -> list[tuple[int, dict[str, str]]]:
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as error:  # noqa: BLE001 - openpyxl raises various errors for a corrupt file
        raise ImportFileError(f"could not read xlsx file: {error}") from error

    sheet = workbook.active
    if sheet is None:
        return []

    rows_iter = sheet.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return []
    headers = [normalize_header(str(h) if h is not None else "") for h in header_row]

    rows: list[tuple[int, dict[str, str]]] = []
    for row_number, values in enumerate(rows_iter, start=2):
        row = {
            headers[i]: ("" if v is None else str(v))
            for i, v in enumerate(values)
            if i < len(headers)
        }
        if any(value for value in row.values()):
            rows.append((row_number, row))
    return rows


def parse_rows(filename: str, content: bytes) -> list[tuple[int, dict[str, str]]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        return parse_csv_rows(content)
    if suffix in (".xlsx", ".xlsm"):
        return parse_xlsx_rows(content)
    raise ImportFileError(f"unsupported file type: {suffix or '(none)'}")


def validate_headers(rows: list[tuple[int, dict[str, str]]]) -> str | None:
    if not rows:
        return None
    missing = REQUIRED_HEADERS - set(rows[0][1].keys())
    if missing:
        return f"missing required column(s): {', '.join(sorted(missing))}"
    return None


class CatalogImportService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def import_file(self, filename: str, content: bytes) -> ImportSummaryResponse:
        try:
            rows = parse_rows(filename, content)
        except ImportFileError as error:
            return ImportSummaryResponse(
                created=0, updated=0, errors=[ImportRowErrorResponse(row=0, message=str(error))]
            )

        header_error = validate_headers(rows)
        if header_error is not None:
            return ImportSummaryResponse(
                created=0, updated=0, errors=[ImportRowErrorResponse(row=0, message=header_error)]
            )

        categories_by_slug = await self._load_categories()

        created = 0
        updated = 0
        errors: list[ImportRowErrorResponse] = []

        for row_number, row in rows:
            try:
                fields = self._validate_row(row, categories_by_slug)
            except ImportRowError as error:
                errors.append(ImportRowErrorResponse(row=row_number, message=str(error)))
                continue

            if await self._upsert(fields):
                created += 1
            else:
                updated += 1

        await self._session.flush()
        return ImportSummaryResponse(created=created, updated=updated, errors=errors)

    def _validate_row(
        self, row: dict[str, str], categories_by_slug: dict[str, Category]
    ) -> dict[str, object]:
        name = row.get("name", "").strip()
        if not name:
            raise ImportRowError("name is required")

        slug = row.get("slug", "").strip()
        if not slug:
            raise ImportRowError("slug is required")
        if not re.fullmatch(SLUG_PATTERN, slug):
            raise ImportRowError(f"invalid slug: {slug!r}")

        price_cents = parse_price_cents(row.get("price"))
        in_stock = parse_in_stock(row.get("in_stock"))
        description = row.get("description", "").strip() or None
        brand = row.get("brand", "").strip() or None

        category_id = None
        category_slug = row.get("category", "").strip()
        if category_slug:
            category = categories_by_slug.get(category_slug)
            if category is None:
                raise ImportRowError(f"unknown category slug: {category_slug!r}")
            category_id = category.id

        return {
            "name": name,
            "slug": slug,
            "description": description,
            "brand": brand,
            "price_cents": price_cents,
            "in_stock": in_stock,
            "category_id": category_id,
        }

    async def _upsert(self, fields: dict[str, object]) -> bool:
        """Upserts by slug; returns True if a new product was created, False if updated."""
        result = await self._session.execute(select(Product).where(Product.slug == fields["slug"]))
        product = result.scalar_one_or_none()

        if product is None:
            self._session.add(Product(**fields))
            return True

        for field, value in fields.items():
            setattr(product, field, value)
        product.deleted_at = None  # re-importing revives a previously discontinued product
        return False

    async def _load_categories(self) -> dict[str, Category]:
        result = await self._session.execute(select(Category))
        return {category.slug: category for category in result.scalars().all()}
