from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.service import CartService
from app.catalog.import_service import CatalogImportService
from app.catalog.models import Category, Product, ProductImage
from app.catalog.serializers import product_response
from app.catalog.service import ProductNotFoundError, ProductService
from app.orders.service import OrdersService
from tests.integration.factories import (
    make_category,
    make_cycle,
    make_product,
    make_product_image,
    make_user,
    variant_id,
)


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


async def test_get_by_slug_sees_a_withdrawn_product_only_when_asked(
    db_session: AsyncSession,
) -> None:
    """The public product page needs 404 and 410 told apart; nothing else does.

    Every other caller (cart, wishlist, listings) must keep seeing a withdrawn product as
    absent, so the wider view is opt-in.
    """
    await make_product(db_session, name="Gone Product", slug="gone", deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    assert await service.get_by_slug("gone") is None

    withdrawn = await service.get_by_slug("gone", include_deleted=True)
    assert withdrawn is not None
    assert withdrawn.deleted_at is not None

    assert await service.get_by_slug("never-existed", include_deleted=True) is None


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

    added, replaced = await service.add_image(product.id, "new.jpg", "Новое фото")

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


async def test_a_changed_product_can_still_be_serialized(db_session: AsyncSession) -> None:
    """`updated_at` has to come back from the flush, not be fetched on attribute access.

    It is set by `onupdate=func.now()`, a SQL expression, so a flush that changes the row
    leaves the attribute expired — and reading an expired attribute on an async session
    is a `MissingGreenlet`, not a lazy load. Every admin endpoint that answers with the
    product it just wrote (`PATCH /admin/products/{id}`, `.../restore`) reads it, and
    each was a 500 until `TimestampMixin` asked for eager defaults.
    """
    product = await make_product(db_session, price_cents=1000, deleted_at=datetime.now(UTC))
    service = ProductService(db_session)

    restored = await service.restore(product.id)
    assert product_response(restored).updated_at is not None

    updated = await service.update(product.id, {"price_cents": 2000})
    assert product_response(updated).price_cents == 2000


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

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)

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

    В файле нет колонки «объём», поэтому строка — это цена «на товар», а у товара он один:
    вторая строка переписывает тот же вариант, как и раньше. Счётчики считают товары, а не
    строки: два ряда одного slug — это один созданный товар, а не созданный и обновлённый.
    """
    content = (
        "name,slug,price,brand\n"
        "Первый вариант,povtor,100.00,Round Lab\n"
        "Последний вариант,povtor,200.00,Round Lab\n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (1, 0, [])
    products = (
        (
            await db_session.execute(
                select(Product)
                .where(Product.slug == "povtor")
                .options(selectinload(Product.variants))
            )
        )
        .scalars()
        .all()
    )
    assert [(product.name, product.price_cents) for product in products] == [
        ("Последний вариант", 20000)
    ]
    assert [variant.price_cents for variant in products[0].live_variants] == [20000]


async def test_import_lower_cases_the_slug_column(db_session: AsyncSession) -> None:
    """A title-cased slug is imported, not rejected, and lands on the existing product.

    Supplier exports routinely title their slugs. Lower-casing happens before the upsert
    key is read, so "Krem-1" and "krem-1" are one product rather than two rows fighting
    over one UNIQUE index.
    """
    existing = await make_product(db_session, slug="krem-1", name="Старое имя")
    await db_session.flush()

    content = (
        "name,slug,price\n"
        "Новое имя,Krem-1,150.00\n"
        "Совсем новый,Celimax-Dual-Barrier-Creamy-Toner,10.00\n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (1, 1, [])
    await db_session.refresh(existing)
    assert existing.name == "Новое имя"
    created = (
        await db_session.execute(
            select(Product).where(Product.slug == "celimax-dual-barrier-creamy-toner")
        )
    ).scalar_one()
    assert created.name == "Совсем новый"


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

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert summary.errors == []
    brands = (await db_session.execute(select(Product.slug, Product.brand))).tuples().all()
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
        "name,slug,price,brand\nТонер,toner,100.00,Round Lab\nБезымянный,bezymyannyj,200.00,   \n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
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

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
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

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (2, 0, [])
    categories = (await db_session.execute(select(Category.slug, Category.name))).tuples().all()
    assert dict(categories) == {"toner": "Тонеры", "uhod-za-glazami": "Уход за глазами"}


async def test_import_leaves_columns_the_file_does_not_have_alone(
    db_session: AsyncSession,
) -> None:
    """A supplier price list is name/slug/price and nothing else.

    Every field used to be written on every row, defaults included, so re-importing such a
    file wiped the brand, the description and the category off every product it touched and
    put them all back in stock — silently, and reported as a successful update.
    """
    category = Category(name="Уход", slug="care", sort_order=0)
    db_session.add(category)
    await db_session.flush()

    product = await make_product(db_session, slug="serum", brand="Round Lab", in_stock=False)
    product.description = "Описание, написанное руками"
    product.category_id = category.id
    await db_session.flush()

    content = "name,slug,price\nСыворотка,serum,150.00\n".encode()
    summary, _ = await CatalogImportService(db_session).import_file("prices.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (0, 1, [])
    await db_session.refresh(product)
    assert product.price_cents == 15000
    assert product.brand == "Round Lab"
    assert product.description == "Описание, написанное руками"
    assert product.category_id == category.id
    assert product.in_stock is False


async def test_import_reads_the_camel_case_in_stock_column(db_session: AsyncSession) -> None:
    """ "inStock" is the spelling the admin panel documents, and it used to be ignored."""
    content = "name,slug,price,inStock\nСыворотка,serum,150.00,нет\n".encode()

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert (summary.created, summary.errors) == (1, [])
    product = (
        await db_session.execute(select(Product).where(Product.slug == "serum"))
    ).scalar_one()
    assert product.in_stock is False


async def test_import_reports_an_overlong_name_as_one_bad_row(db_session: AsyncSession) -> None:
    """name/slug/brand are String(255); past that the row failed at flush, which is a 500
    for the whole upload rather than one reported line."""
    content = (
        f"name,slug,price\n{'я' * 300},too-long,100.00\nНормальная строка,fine,100.00\n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert summary.created == 1
    assert [error.row for error in summary.errors] == [2]


async def test_import_pulls_its_price_changes_through_pending_orders(
    db_session: AsyncSession,
) -> None:
    """A price list is not only a catalog edit.

    The hand-edit path (`PATCH /admin/products/{id}`) has always repriced open orders;
    the mass path silently left them on the old price, so the owner paid one number and
    the order showed another. Only prices that actually moved count — the file re-states
    every product, including the ones it does not change.
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    moved = await make_product(db_session, slug="krem-1", name="Крем", price_cents=1000)
    same = await make_product(db_session, slug="krem-2", name="Тоник", price_cents=500)

    cart = CartService(db_session)
    await cart.add_item(user.id, variant_id(moved), 2)
    await cart.add_item(user.id, variant_id(same), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)

    content = ("name,slug,price\nКрем,krem-1,15.00\nТоник,krem-2,5.00\n").encode()

    summary, changes = await CatalogImportService(db_session).import_file("prices.csv", content)
    await db_session.flush()

    assert (summary.updated, summary.errors) == (2, [])
    assert order.total_cents == 3500
    assert [(change.product_name, change.new_price_cents) for change in changes] == [("Крем", 1500)]
    assert changes[0].order_id == order.id
    assert changes[0].total_cents == 3500


async def test_import_reports_no_price_changes_when_nothing_moved(
    db_session: AsyncSession,
) -> None:
    """Re-uploading yesterday's file must not tell anyone their order changed."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, slug="krem-1", name="Крем", price_cents=1000)
    await CartService(db_session).add_item(user.id, variant_id(product), 1)
    await OrdersService(db_session).checkout(user.id, note=None)

    content = "name,slug,price\nКрем,krem-1,10.00\n".encode()

    _, changes = await CatalogImportService(db_session).import_file("prices.csv", content)

    assert changes == []


async def test_search_also_matches_brand_and_category(db_session: AsyncSession) -> None:
    """One field for three things: the header search sends everything through `q`."""
    toners = await make_category(db_session, name="Тонеры", slug="toners")
    await make_product(db_session, name="Rose Serum", brand="Round Lab")
    await make_product(db_session, name="Lipstick", brand="Bloom", category_id=toners.id)
    service = ProductService(db_session)

    by_brand, _ = await service.list_public(None, None, 1, 20, "round")
    assert [product.name for product in by_brand] == ["Rose Serum"]

    by_category, _ = await service.list_public(None, None, 1, 20, "тонер")
    assert [product.name for product in by_category] == ["Lipstick"]


async def test_search_still_narrows_within_a_category_filter(db_session: AsyncSession) -> None:
    """The category arm is an extra `OR`, so it must not loosen an explicit filter."""
    toners = await make_category(db_session, name="Тонеры", slug="toners")
    await make_product(db_session, name="Rose Serum", brand="Lumen")
    await make_product(db_session, name="Rose Toner", brand="Lumen", category_id=toners.id)
    service = ProductService(db_session)

    found, total = await service.list_public("toners", None, 1, 20, "lumen")

    assert [product.name for product in found] == ["Rose Toner"]
    assert total == 1


async def test_suggest_groups_categories_brands_and_products(db_session: AsyncSession) -> None:
    toners = await make_category(db_session, name="Тонеры", slug="toners")
    await make_category(db_session, name="Тонеры для сухой кожи", slug="toners-dry")
    product = await make_product(
        db_session, name="Rose Toner", brand="Tonymoly", category_id=toners.id
    )
    await make_product_image(db_session, product, url="http://x/1.jpg", is_primary=True)
    await make_product(db_session, name="Lipstick", brand="Bloom")
    service = ProductService(db_session)

    suggestions = await service.suggest("тон")

    # Only the category with live products behind it — the empty one is not offered.
    assert [category.slug for category in suggestions.categories] == ["toners"]
    assert suggestions.brands == []
    assert [item.name for item in suggestions.products] == ["Rose Toner"]

    by_brand = await service.suggest("tony")
    assert by_brand.brands == ["Tonymoly"]
    assert [item.name for item in by_brand.products] == ["Rose Toner"]


async def test_suggest_collapses_brand_casing_and_hides_deleted(db_session: AsyncSession) -> None:
    await make_product(db_session, name="A", brand="Round Lab")
    await make_product(db_session, name="B", brand="round lab")
    await make_product(
        db_session, name="Round Lab Pad", brand="Purito", deleted_at=datetime.now(UTC)
    )
    service = ProductService(db_session)

    suggestions = await service.suggest("round")

    assert suggestions.brands == ["Round Lab"]
    assert [product.name for product in suggestions.products] == ["A", "B"]


async def test_suggest_puts_name_matches_before_the_rest(db_session: AsyncSession) -> None:
    """Five rows are the whole dropdown, so the literal hit must not be crowded out."""
    for index in range(6):
        await make_product(db_session, name=f"Anua Pad {index}", brand="Anua")
    await make_product(db_session, name="Ягодный тонер Anua", brand="Purito")
    service = ProductService(db_session)

    suggestions = await service.suggest("тонер")

    assert suggestions.products[0].name == "Ягодный тонер Anua"


async def test_suggest_caps_each_group(db_session: AsyncSession) -> None:
    for index in range(8):
        await make_product(db_session, name=f"Rose {index}", brand=f"Rose Brand {index}")
    service = ProductService(db_session)

    suggestions = await service.suggest("rose", product_limit=5, group_limit=3)

    assert len(suggestions.products) == 5
    assert len(suggestions.brands) == 3


async def test_import_reads_a_row_per_volume(db_session: AsyncSession) -> None:
    """Прайс поставщика — это строка на объём с повторяющимся slug, и ровно так же его
    пишет выгрузка: товар один, объёмов у него столько, сколько строк."""
    content = (
        "name,slug,price,volume\n"
        "Сыворотка Centella,centella,1000.00,30\n"
        "Сыворотка Centella,centella,1800.00,50 мл\n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("price.csv", content)
    await db_session.flush()

    assert (summary.created, summary.updated, summary.errors) == (1, 0, [])
    product = (
        await db_session.execute(
            select(Product)
            .where(Product.slug == "centella")
            .options(selectinload(Product.variants))
        )
    ).scalar_one()
    # Цены в файле — в рублях, в базе — в копейках.
    assert [(variant.volume_ml, variant.price_cents) for variant in product.live_variants] == [
        (30, 100_000),
        (50, 180_000),
    ]
    # Витринные поля пересчитаны по вариантам, а не взяты из последней строки файла.
    assert (product.price_cents, product.volume_ml) == (100_000, None)


async def test_import_reports_the_same_volume_twice_instead_of_dropping_a_price(
    db_session: AsyncSession,
) -> None:
    """Без этого вторая строка молча переписывала бы первую, и владелец не узнал бы,
    что половина прайса не доехала."""
    content = (
        "name,slug,price,volume\nСыворотка,centella,1000.00,30\nСыворотка,centella,1200.00,30\n"
    ).encode()

    summary, _ = await CatalogImportService(db_session).import_file("price.csv", content)

    assert summary.created == 1
    assert [error.row for error in summary.errors] == [3]
    assert "уже был выше" in summary.errors[0].message


async def test_a_price_only_file_still_moves_a_single_volume_product(
    db_session: AsyncSession,
) -> None:
    """Файл без колонки «объём» — обычный прайс: цена «на товар», и пока объём один,
    это по-прежнему осмысленно. Второй вариант при этом не заводится."""
    product = await make_product(db_session, slug="toner", volume_ml=200, price_cents=1000)
    await db_session.flush()

    content = "name,slug,price\nТоник,toner,1500.00\n".encode()
    summary, _ = await CatalogImportService(db_session).import_file("price.csv", content)
    await db_session.flush()

    assert summary.errors == []
    assert [(variant.volume_ml, variant.price_cents) for variant in product.live_variants] == [
        (200, 150_000)
    ]


async def test_a_price_only_file_refuses_a_product_sold_in_several_volumes(
    db_session: AsyncSession,
) -> None:
    """Одну цену на все объёмы — значит отменить разделение; угадать, какой имелся в
    виду, нельзя, поэтому строка отклоняется с подсказкой, чего файлу не хватает."""
    await make_product(db_session, slug="centella", variants=[(30, 1000, True), (50, 1800, True)])
    await db_session.flush()

    content = "name,slug,price\nСыворотка,centella,1200.00\n".encode()
    summary, _ = await CatalogImportService(db_session).import_file("price.csv", content)

    assert (summary.created, summary.updated) == (0, 0)
    assert [error.row for error in summary.errors] == [2]
    assert "колонку «объём»" in summary.errors[0].message


async def test_import_reprices_only_the_volume_whose_price_moved(
    db_session: AsyncSession,
) -> None:
    """Переоценка идёт по варианту: заявка на 30 мл не должна дорожать оттого, что
    подорожали 50."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(
        db_session,
        name="Сыворотка",
        slug="centella",
        variants=[(30, 1000, True), (50, 1800, True)],
    )
    await CartService(db_session).add_item(user.id, variant_id(product, 30), 1)
    await CartService(db_session).add_item(user.id, variant_id(product, 50), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)

    content = (
        "name,slug,price,volume\nСыворотка,centella,10.00,30\nСыворотка,centella,20.00,50\n"
    ).encode()
    _, changes = await CatalogImportService(db_session).import_file("price.csv", content)

    assert len(changes) == 1
    assert (changes[0].old_price_cents, changes[0].new_price_cents) == (1800, 2000)
    prices = {item.product_volume_ml: item.product_price_cents for item in order.items}
    assert prices == {30: 1000, 50: 2000}
