import io
from datetime import UTC, datetime

import openpyxl
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.import_service import CatalogImportService
from app.export.products import HEADER, CatalogExportService
from tests.integration.factories import make_category, make_product, make_product_image


async def test_rows_carry_the_catalogue_in_the_shape_the_import_reads_back(
    db_session: AsyncSession,
) -> None:
    category = await make_category(db_session, name="Уход", slug="care")
    await make_product(
        db_session,
        name="Крем",
        slug="krem",
        brand="Lulu",
        price_cents=15000,
        volume_ml=50,
        category_id=category.id,
    )

    rows = await CatalogExportService(db_session)._rows()

    assert len(rows) == 1
    assert (rows[0].name, rows[0].slug, rows[0].brand) == ("Крем", "krem", "Lulu")
    # The slug, not the name: only the slug is the category's identity for the import.
    assert rows[0].category_slug == "care"
    assert (rows[0].price_cents, rows[0].volume_ml, rows[0].in_stock) == (15000, 50, True)


async def test_soft_deleted_products_stay_out_of_the_sheet(db_session: AsyncSession) -> None:
    """Re-uploading the sheet must not resurrect them: the import matches on slug alone."""
    await make_product(db_session, name="Живой", slug="alive")
    await make_product(db_session, name="Удалён", slug="gone", deleted_at=datetime.now(UTC))

    rows = await CatalogExportService(db_session)._rows()

    assert [row.slug for row in rows] == ["alive"]


async def test_a_product_without_a_category_exports_with_an_empty_one(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, name="Крем", slug="krem", brand=None)

    rows = await CatalogExportService(db_session)._rows()

    assert (rows[0].category_slug, rows[0].brand) == (None, None)


async def test_the_round_trip_keeps_descriptions_and_photos(db_session: AsyncSession) -> None:
    """The point of leaving `description` and the images out of the sheet.

    Not a property of the export alone: it holds because the import treats a column it
    cannot see as "leave this field alone". Asserted end to end — the export's own bytes
    go back through the real import — because a test of the header list would keep passing
    if the import ever started writing defaults for the columns a file omits.
    """
    category = await make_category(db_session, name="Уход", slug="care")
    product = await make_product(
        db_session,
        name="Крем",
        slug="krem",
        brand="Lulu",
        price_cents=15000,
        volume_ml=50,
        category_id=category.id,
        description="Длинное описание, которое никто не правит в таблице.",
    )
    await make_product_image(db_session, product, url="http://localhost:3001/files/krem.jpg")

    content, _ = await CatalogExportService(db_session).export_products()
    summary, _ = await CatalogImportService(db_session).import_file("catalog.xlsx", content)

    # `images` is a lazy relationship, and the import never touches it — loaded explicitly
    # rather than off the instance, where an await would land outside the greenlet.
    await db_session.refresh(product, ["images"])

    assert (summary.created, summary.updated, summary.errors) == (0, 1, [])
    assert product.description == "Длинное описание, которое никто не правит в таблице."
    assert [image.url for image in product.images] == ["http://localhost:3001/files/krem.jpg"]


async def test_the_round_trip_keeps_brand_category_volume_and_stock(
    db_session: AsyncSession,
) -> None:
    """The columns the sheet *does* carry come back as themselves, not as defaults.

    `in_stock=False` on purpose: an empty cell means "in stock" to the import, so a product
    out of stock is exactly the value a blank would silently flip.
    """
    category = await make_category(db_session, name="Уход", slug="care")
    product = await make_product(
        db_session,
        name="Тоник",
        slug="tonik",
        brand="Round Lab",
        price_cents=999,
        volume_ml=None,
        in_stock=False,
        category_id=category.id,
    )

    content, _ = await CatalogExportService(db_session).export_products()
    summary, _ = await CatalogImportService(db_session).import_file("catalog.xlsx", content)

    assert (summary.created, summary.errors) == (0, [])
    assert (product.brand, product.category_id) == ("Round Lab", category.id)
    assert (product.price_cents, product.volume_ml, product.in_stock) == (999, None, False)


def _with_price(content: bytes, price: float) -> bytes:
    """The exported sheet with the first product's price overwritten — Excel, in effect."""
    workbook = openpyxl.load_workbook(io.BytesIO(content))
    sheet = workbook.active
    assert sheet is not None
    sheet.cell(row=2, column=HEADER.index("price") + 1).value = price

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def test_a_price_edited_in_the_sheet_comes_back_as_an_update(
    db_session: AsyncSession,
) -> None:
    """The workflow itself: export, change a price in Excel, upload the file back.

    `created == 0` is the half that matters. The import matches on slug, so if the export
    ever wrote the slug column under a name the import does not read, every row would
    arrive as a new product and the upload would double the catalogue instead of
    repricing it.
    """
    product = await make_product(
        db_session, name="Крем", slug="krem", brand="Lulu", price_cents=15000
    )

    content, _ = await CatalogExportService(db_session).export_products()
    summary, _ = await CatalogImportService(db_session).import_file(
        "catalog.xlsx", _with_price(content, 175.5)
    )

    assert (summary.created, summary.updated, summary.errors) == (0, 1, [])
    assert product.price_cents == 17550
