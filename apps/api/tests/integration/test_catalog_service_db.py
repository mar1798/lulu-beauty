from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.import_service import CatalogImportService
from app.catalog.models import Category, Product, ProductImage
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


async def test_list_filters_by_brand_ignoring_case(db_session: AsyncSession) -> None:
    """Rows that predate canonical_brand() may still differ in case — both must match."""
    await make_product(db_session, name="Rose Serum", brand="Round Lab")
    await make_product(db_session, name="Toner", brand="round lab")
    await make_product(db_session, name="Lipstick", brand="Bloom")
    service = ProductService(db_session)

    found, total = await service.list_public(None, None, 1, 20, brand="ROUND LAB")

    assert {product.name for product in found} == {"Rose Serum", "Toner"}
    assert total == 2


async def test_list_brands_covers_deleted_products_only_on_demand(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, brand="Bloom")
    await make_product(db_session, brand="Gone", deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    assert await service.list_brands() == ["Bloom"]
    assert await service.list_brands(include_deleted=True) == ["Bloom", "Gone"]


async def test_list_brands_collapses_case_variants(db_session: AsyncSession) -> None:
    """One entry per brand — which spelling survives is up to the collation, not us."""
    await make_product(db_session, brand="Round Lab")
    await make_product(db_session, brand="round lab")
    await make_product(db_session, brand="ROUND LAB")
    await make_product(db_session, brand="Bloom")
    service = ProductService(db_session)

    brands = await service.list_brands()

    assert len(brands) == 2
    assert brands[0] == "Bloom"
    assert brands[1].lower() == "round lab"


async def test_create_reuses_the_stored_spelling_of_a_known_brand(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, slug="known", brand="Round Lab")
    service = ProductService(db_session)

    product = await service.create("Toner", "toner", None, "  rOUND lAB  ", 1000, None, True)

    assert product.brand == "Round Lab"


async def test_create_keeps_an_unknown_brand_exactly_as_typed(db_session: AsyncSession) -> None:
    """Normalizing case is not the same as policing it — a new brand is taken at face value."""
    service = ProductService(db_session)

    product = await service.create("Toner", "toner", None, "  COSRX  ", 1000, None, True)

    assert product.brand == "COSRX"


async def test_create_matches_a_brand_left_only_on_a_deleted_product(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, slug="gone", brand="Round Lab", deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    product = await service.create("Toner", "toner", None, "round lab", 1000, None, True)

    assert product.brand == "Round Lab"


async def test_update_canonicalizes_the_brand(db_session: AsyncSession) -> None:
    """Заодно и про товар без бренда: строки, заведённые до того, как поле стало
    обязательным, живут в базе дальше — их бренд проставляется первым же сохранением."""
    await make_product(db_session, slug="known", brand="Round Lab")
    target = await make_product(db_session, slug="toner", brand=None)
    service = ProductService(db_session)

    updated = await service.update(target.id, {"brand": "ROUND LAB"})

    assert updated.brand == "Round Lab"


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
        "name,slug,price,brand\n"
        "Новое имя,krem-1,150.00,Round Lab\n"
        "Вернулся,krem-2,90.50,Round Lab\n"
        "Совсем новый,krem-3,10.00,COSRX\n"
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
        "name,slug,price,brand\n"
        "Первый вариант,povtor,100.00,Round Lab\n"
        "Последний вариант,povtor,200.00,Round Lab\n"
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


async def test_import_folds_brand_case_variants(db_session: AsyncSession) -> None:
    """Регистр бренда в файле не создаёт второй бренд.

    Уже известный каталогу бренд приводится к его написанию, а новый — к тому,
    как его написала первая строка файла.
    """
    await make_product(db_session, slug="known", brand="Round Lab")
    await db_session.flush()

    content = (
        "name,slug,price,brand\n"
        "Тонер,toner,100.00,round lab\n"
        "Крем,krem,200.00,COSRX\n"
        "Маска,maska,300.00,cosrx\n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert summary.errors == []
    brands = (
        (await db_session.execute(select(Product.slug, Product.brand))).tuples().all()
    )
    assert dict(brands) == {
        "known": "Round Lab",
        "toner": "Round Lab",
        "krem": "COSRX",
        "maska": "COSRX",
    }


async def test_import_accepts_a_row_without_a_brand(db_session: AsyncSession) -> None:
    """Пустой бренд — не повод отбить строку прайса: товар заводится без бренда.

    В фильтр каталога он не попадёт, пока бренд не проставят в карточке, — но это
    видно в админке, а потерянная строка файла не видна никак.
    """
    content = (
        "name,slug,price,brand\n"
        "Тонер,toner,100.00,Round Lab\n"
        "Безымянный,bezymyannyj,200.00,   \n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (2, 0, [])
    brands = (await db_session.execute(select(Product.slug, Product.brand))).tuples().all()
    assert dict(brands) == {"toner": "Round Lab", "bezymyannyj": None}


async def test_import_creates_categories_the_catalogue_does_not_have_yet(
    db_session: AsyncSession,
) -> None:
    """Незнакомая категория заводится, а не отбивает строку.

    Прайс пишут не по списку категорий магазина, поэтому «unknown category slug»
    отбивал целый файл там, где достаточно завести категорию. Знакомая категория
    при этом переиспользуется — второй с тем же слагом не появляется.
    """
    known = Category(name="Тонеры", slug="toner", sort_order=3)
    db_session.add(known)
    await db_session.flush()

    content = (
        "name,slug,price,brand,category\n"
        "Тонер,tonerok,100.00,Round Lab,toner\n"
        "Эссенция,essenciya,200.00,COSRX,essence\n"
        "Крем для век,krem-dlya-vek,300.00,COSRX,eye-cream\n"
        "Ещё эссенция,essenciya-2,400.00,COSRX,essence\n"
        "Без категории,bez-kategorii,500.00,COSRX,\n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (5, 0, [])
    categories = (
        (await db_session.execute(select(Category).order_by(Category.sort_order))).scalars().all()
    )
    assert [(category.slug, category.name, category.sort_order) for category in categories] == [
        ("toner", "Тонеры", 3),
        ("essence", "Essence", 4),
        ("eye-cream", "Eye Cream", 5),
    ]
    products = (await db_session.execute(select(Product).order_by(Product.slug))).scalars().all()
    by_slug = {product.slug: product for product in products}
    assert by_slug["tonerok"].category_id == known.id
    assert by_slug["essenciya"].category_id == by_slug["essenciya-2"].category_id
    assert by_slug["bez-kategorii"].category_id is None


async def test_import_takes_a_category_written_as_a_name(db_session: AsyncSession) -> None:
    """Русское название в колонке `category` — это название, а не слаг.

    Существующая категория находится по названию (регистр не важен), новая получает
    транслитерированный слаг — иначе такая ячейка не прошла бы `SLUG_PATTERN`.
    """
    db_session.add(Category(name="Тонеры", slug="toner", sort_order=0))
    await db_session.flush()

    content = (
        "name,slug,price,brand,category\n"
        "Тонер,tonerok,100.00,Round Lab,тонеры\n"
        "Патчи,patchi,200.00,COSRX,Уход за глазами\n"
    ).encode()

    summary = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (2, 0, [])
    categories = (await db_session.execute(select(Category.slug, Category.name))).tuples().all()
    assert dict(categories) == {"toner": "Тонеры", "uhod-za-glazami": "Уход за глазами"}
