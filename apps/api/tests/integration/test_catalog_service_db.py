from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.import_service import CatalogImportService
from app.catalog.models import Product, ProductImage
from app.catalog.service import ProductNotFoundError, ProductService
from tests.integration.factories import make_product, make_product_image


async def test_list_public_hides_soft_deleted_but_admin_can_include_them(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, name="Live Product")
    await make_product(db_session, name="Gone Product", deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    public, public_total = await service.list_public(None, None, 1, 20)
    assert [product.name for product in public] == ["Live Product"]
    assert public_total == 1

    admin_default, _ = await service.list_admin(None, None, 1, 20)
    assert [product.name for product in admin_default] == ["Live Product"]

    admin_with_deleted, total = await service.list_admin(None, None, 1, 20, include_deleted=True)
    assert {product.name for product in admin_with_deleted} == {"Live Product", "Gone Product"}
    assert total == 2


async def test_search_matches_name_case_insensitively(db_session: AsyncSession) -> None:
    await make_product(db_session, name="Rose Serum")
    await make_product(db_session, name="Lipstick")
    service = ProductService(db_session)

    found, total = await service.list_public(None, None, 1, 20, "rose")

    assert [product.name for product in found] == ["Rose Serum"]
    assert total == 1


async def test_search_escapes_like_wildcards(db_session: AsyncSession) -> None:
    """A literal % must not turn into a match-everything pattern."""
    await make_product(db_session, name="Rose Serum")
    await make_product(db_session, name="50% Off Bundle")
    service = ProductService(db_session)

    found, total = await service.list_public(None, None, 1, 20, "50%")

    assert [product.name for product in found] == ["50% Off Bundle"]
    assert total == 1


async def test_list_filters_by_brand(db_session: AsyncSession) -> None:
    await make_product(db_session, name="Rose Serum", brand="Lumen")
    await make_product(db_session, name="Lipstick", brand="Bloom")
    service = ProductService(db_session)

    found, total = await service.list_public(None, None, 1, 20, brand="Lumen")

    assert [product.name for product in found] == ["Rose Serum"]
    assert total == 1


async def test_list_brands_returns_distinct_sorted_values(db_session: AsyncSession) -> None:
    await make_product(db_session, brand="Lumen")
    await make_product(db_session, brand="Lumen")
    await make_product(db_session, brand="Bloom")
    await make_product(db_session, brand=None)
    await make_product(db_session, brand="")
    service = ProductService(db_session)

    assert await service.list_brands() == ["Bloom", "Lumen"]


async def test_list_brands_covers_deleted_products_only_on_demand(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, brand="Bloom")
    await make_product(db_session, brand="Gone", deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    assert await service.list_brands() == ["Bloom"]
    assert await service.list_brands(include_deleted=True) == ["Bloom", "Gone"]


async def test_add_image_replaces_every_previous_one(db_session: AsyncSession) -> None:
    """A product carries exactly one photo — including ones left by older, multi-image data."""
    product = await make_product(db_session)
    await make_product_image(db_session, product, url="old.jpg", is_primary=True)
    await make_product_image(db_session, product, url="older.jpg", sort_order=1)
    service = ProductService(db_session)

    added = await service.add_image(product.id, "new.jpg", "Новое фото")

    images = (
        (
            await db_session.execute(
                select(ProductImage).where(ProductImage.product_id == product.id)
            )
        )
        .scalars()
        .all()
    )
    assert [image.id for image in images] == [added.id]
    assert added.url == "new.jpg"
    assert added.is_primary is True


async def test_restore_undoes_a_soft_delete(db_session: AsyncSession) -> None:
    product = await make_product(db_session, deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    with pytest.raises(ProductNotFoundError):
        await service.get_by_id(product.id)

    restored = await service.restore(product.id)

    assert restored.deleted_at is None
    assert (await service.get_by_id(product.id)).id == product.id


async def test_import_upserts_by_slug_against_the_existing_catalogue(
    db_session: AsyncSession,
) -> None:
    """Строки файла раскладываются на существующие товары одним запросом, не по одному.

    Товар ищется по slug: совпавший обновляется (и воскресает, если был снят с продажи),
    несовпавший создаётся.
    """
    existing = await make_product(db_session, slug="krem-1", name="Старое имя")
    revived = await make_product(db_session, slug="krem-2", deleted_at=datetime.now(UTC))
    await db_session.flush()

    content = (
        "name,slug,price\n"
        "Новое имя,krem-1,150.00\n"
        "Вернулся,krem-2,90.50\n"
        "Совсем новый,krem-3,10.00\n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)

    assert (summary.created, summary.updated, summary.errors) == (1, 2, [])
    await db_session.refresh(existing)
    await db_session.refresh(revived)
    assert existing.name == "Новое имя"
    assert existing.price_cents == 15000
    assert revived.deleted_at is None


async def test_import_folds_a_slug_repeated_inside_one_file(db_session: AsyncSession) -> None:
    """Один slug дважды в файле — это один товар, а не нарушение UNIQUE.

    Раньше строку спасал автосброс сессии перед каждым построчным SELECT; теперь товары
    разрешаются заранее, и повтор должен попасть в тот же объект, что создала первая строка.
    """
    content = (
        "name,slug,price\n"
        "Первый вариант,povtor,100.00\n"
        "Последний вариант,povtor,200.00\n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (1, 1, [])
    products = (
        (await db_session.execute(select(Product).where(Product.slug == "povtor")))
        .scalars()
        .all()
    )
    assert [(product.name, product.price_cents) for product in products] == [
        ("Последний вариант", 20000)
    ]
