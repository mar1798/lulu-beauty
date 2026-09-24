"""A product sold in several volumes: the catalogue, the cart and the order.

The one thing every test here is really about is that a volume — not a product — is what
a customer chooses, puts in a cart and is charged for.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.service import CartService, ProductNotFoundError
from app.catalog.import_service import CatalogImportService
from app.catalog.models import Product, ProductVariant
from app.catalog.results import VariantSpec
from app.catalog.service import (
    DuplicateVariantVolumeError,
    EmptyVariantsError,
    ProductHasVariantsError,
    ProductService,
)
from app.export.service import ExportService
from app.orders.models import OrderStatus
from app.orders.service import OrdersService
from tests.integration.factories import make_cycle, make_product, make_user, variant_id


async def _two_volumes(session: AsyncSession) -> Product:
    """Одна сыворотка в двух объёмах — 30 мл за 1000 и 50 мл за 1800."""
    return await make_product(
        session,
        name="Сыворотка Centella",
        slug="centella-serum",
        variants=[(30, 1000, True), (50, 1800, True)],
    )


async def test_display_fields_follow_the_variants(db_session: AsyncSession) -> None:
    """Цена, объём и наличие на товаре — производные, и это то, что читает витрина."""
    product = await _two_volumes(db_session)

    # Цена — минимальная из живых: карточка говорит «от 1000».
    assert product.price_cents == 1000
    # Объём один назвать нельзя, поэтому его нет: карточка покажет сами объёмы.
    assert product.volume_ml is None
    assert product.in_stock is True


async def test_a_product_is_in_stock_while_any_of_its_volumes_is(
    db_session: AsyncSession,
) -> None:
    """Кончившиеся 30 мл не убирают сыворотку из каталога — 50 мл ещё есть."""
    product = await make_product(
        db_session, slug="serum", variants=[(30, 1000, False), (50, 1800, True)]
    )

    assert product.in_stock is True
    # Но цена — минимальная среди живых, а не среди тех, что в наличии: «от» на карточке
    # описывает товар, а не сегодняшний остаток.
    assert product.price_cents == 1000


async def test_both_volumes_live_in_one_cart_with_their_own_prices(
    db_session: AsyncSession,
) -> None:
    """То, ради чего снят UNIQUE(cart_id, product_id): 30 и 50 мл — две строки."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    service = CartService(db_session)

    await service.add_item(user.id, variant_id(product, 30), 2)
    cart = await service.add_item(user.id, variant_id(product, 50), 1)

    assert [(item.product_volume_ml, item.quantity) for item in cart.items] == [(30, 2), (50, 1)]
    assert [item.product_price_cents for item in cart.items] == [1000, 1800]
    # 2 x 1000 + 1800 — цена берётся с варианта, а не с товара.
    assert cart.total_cents == 3800


async def test_a_sold_out_volume_drops_out_of_the_cart_and_the_other_stays(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    service = CartService(db_session)
    await service.add_item(user.id, variant_id(product, 30), 1)
    await service.add_item(user.id, variant_id(product, 50), 1)

    # Владелец снял с продажи только маленький объём.
    next(variant for variant in product.live_variants if variant.volume_ml == 30).in_stock = False
    await db_session.flush()

    cart = await service.get_cart(user.id)

    assert [item.product_volume_ml for item in cart.items] == [50]


async def test_adding_a_sold_out_volume_is_refused(db_session: AsyncSession) -> None:
    """Наличие — свойство объёма: товар «в наличии» не пропускает кончившийся объём."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(
        db_session, slug="serum", variants=[(30, 1000, False), (50, 1800, True)]
    )

    with pytest.raises(ProductNotFoundError):
        await CartService(db_session).add_item(user.id, variant_id(product, 30), 1)


async def test_checkout_snapshots_the_volume_it_was_placed_for(
    db_session: AsyncSession,
) -> None:
    """Объём — снимок на строке заявки: потом по товару его уже не восстановить."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    cart = CartService(db_session)
    await cart.add_item(user.id, variant_id(product, 30), 1)
    await cart.add_item(user.id, variant_id(product, 50), 1)

    order = await OrdersService(db_session).checkout(user.id, note=None)

    lines = sorted(order.items, key=lambda item: item.product_price_cents)
    assert [(line.product_volume_ml, line.product_price_cents) for line in lines] == [
        (30, 1000),
        (50, 1800),
    ]
    assert order.total_cents == 2800


async def test_the_purchase_list_splits_a_product_by_volume(
    db_session: AsyncSession,
) -> None:
    """Закупочный лист — то, с чем владелец идёт к поставщику: 30 и 50 мл покупаются
    отдельно, и одна суммарная строка была бы числом, с которым нечего делать."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    cart = CartService(db_session)
    await cart.add_item(user.id, variant_id(product, 30), 3)
    await cart.add_item(user.id, variant_id(product, 50), 2)
    await OrdersService(db_session).checkout(user.id, note=None)

    rows = await ExportService(db_session)._export_rows(None)

    assert [(row.label, row.quantity) for row in rows] == [
        ("Сыворотка Centella, 30 мл", 3),
        ("Сыворотка Centella, 50 мл", 2),
    ]


async def test_editing_a_price_keeps_the_variant_row_and_the_cart_with_it(
    db_session: AsyncSession,
) -> None:
    """Список объёмов заменяется целиком, но сверяется по объёму — иначе правка цены
    удаляла бы строку, на которую ссылается чужая корзина, и корзина пустела бы."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    small = variant_id(product, 30)
    await CartService(db_session).add_item(user.id, small, 1)

    updated = await ProductService(db_session).update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=30, price_cents=1200, in_stock=True),
            VariantSpec(volume_ml=50, price_cents=1800, in_stock=True),
        ],
    )

    assert variant_id(updated, 30) == small
    cart = await CartService(db_session).get_cart(user.id)
    assert [(item.variant_id, item.product_price_cents) for item in cart.items] == [(small, 1200)]


async def test_a_withdrawn_volume_is_soft_deleted_and_comes_back_as_itself(
    db_session: AsyncSession,
) -> None:
    """Снятый объём ещё цитируют заявки, поэтому строка остаётся — и возвращается та же."""
    product = await _two_volumes(db_session)
    small = variant_id(product, 30)
    service = ProductService(db_session)

    await service.update(
        product.id, {}, [VariantSpec(volume_ml=50, price_cents=1800, in_stock=True)]
    )
    assert [variant.volume_ml for variant in product.live_variants] == [50]
    assert product.volume_ml == 50  # снова один объём — товар опять может его назвать

    revived = await service.update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=30, price_cents=1100, in_stock=True),
            VariantSpec(volume_ml=50, price_cents=1800, in_stock=True),
        ],
    )

    assert variant_id(revived, 30) == small


async def test_withdrawing_a_volume_takes_it_out_of_pending_orders(
    db_session: AsyncSession,
) -> None:
    """Снятый объём — та же новость, что снятый с продажи товар, и уходит так же.

    Раньше строка оставалась висеть: витрина объём больше не предлагала, корзина
    роняла его молча, а заявка, ждущая ответа, продолжала просить то, чего магазин
    уже не продаёт. Второй объём того же товара при этом не трогается — ради этого
    `drop_variants` и отличается от `drop_product`.
    """
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    cart = CartService(db_session)
    await cart.add_item(user.id, variant_id(product, 30), 2)
    await cart.add_item(user.id, variant_id(product, 50), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    small = variant_id(product, 30)

    await ProductService(db_session).update(
        product.id, {}, [VariantSpec(volume_ml=50, price_cents=1800, in_stock=True)]
    )
    drops = await OrdersService(db_session).drop_variants([small])

    assert [(item.product_volume_ml, item.quantity) for item in order.items] == [(50, 1)]
    assert order.total_cents == 1800
    assert order.status is OrderStatus.PENDING
    # Объём назван в уведомлении: без него покупатель читает «убран товар: Сыворотка»
    # и не понимает, почему та же сыворотка осталась в заявке.
    assert [(drop.product_volume_ml, drop.is_cancelled) for drop in drops] == [(30, False)]


async def test_withdrawing_the_only_ordered_volume_cancels_the_order(
    db_session: AsyncSession,
) -> None:
    """Заявка без позиций — не заявка: отменяется от имени владельца, как и при снятии товара."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product, 30), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    small = variant_id(product, 30)

    await ProductService(db_session).update(
        product.id, {}, [VariantSpec(volume_ml=50, price_cents=1800, in_stock=True)]
    )
    drops = await OrdersService(db_session).drop_variants([small])

    assert order.items == []
    assert order.status is OrderStatus.CANCELLED_BY_OWNER
    assert [drop.is_cancelled for drop in drops] == [True]


async def test_confirmed_orders_keep_a_withdrawn_volume(db_session: AsyncSession) -> None:
    """Подтверждённая заявка — запись о договорённости, и снятие объёма её не меняет."""
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _two_volumes(db_session)
    await CartService(db_session).add_item(user.id, variant_id(product, 30), 1)
    order = await OrdersService(db_session).checkout(user.id, note=None)
    order.status = OrderStatus.CONFIRMED
    await db_session.flush()

    drops = await OrdersService(db_session).drop_variants([variant_id(product, 30)])

    assert drops == []
    assert len(order.items) == 1


async def test_a_flat_price_is_refused_once_a_product_is_sold_in_several(
    db_session: AsyncSession,
) -> None:
    """`price_cents` на товаре — сокращение для «единственного объёма», и как только их
    два, применять одно число ко всем — значит молча отменить разделение."""
    product = await _two_volumes(db_session)

    with pytest.raises(ProductHasVariantsError):
        await ProductService(db_session).update(product.id, {"price_cents": 1500})


async def test_a_flat_price_still_works_for_a_product_sold_in_one(
    db_session: AsyncSession,
) -> None:
    """Обратная сторона того же правила: обычный товар правится как раньше, и цена
    доезжает до варианта — иначе покупателю предлагали бы старую."""
    product = await make_product(db_session, slug="toner", price_cents=1000, volume_ml=200)

    updated = await ProductService(db_session).update(product.id, {"price_cents": 1500})

    assert updated.price_cents == 1500
    assert [variant.price_cents for variant in updated.live_variants] == [1500]


async def test_a_product_cannot_be_left_without_volumes(db_session: AsyncSession) -> None:
    product = await _two_volumes(db_session)

    with pytest.raises(EmptyVariantsError):
        await ProductService(db_session).update(product.id, {}, [])


async def test_the_same_volume_twice_is_refused_before_it_reaches_the_index(
    db_session: AsyncSession,
) -> None:
    """Иначе это 500 из частичного уникального индекса на flush, а не ошибка формы."""
    product = await _two_volumes(db_session)

    with pytest.raises(DuplicateVariantVolumeError):
        await ProductService(db_session).update(
            product.id,
            {},
            [
                VariantSpec(volume_ml=30, price_cents=1000, in_stock=True),
                VariantSpec(volume_ml=30, price_cents=1200, in_stock=True),
            ],
        )


async def test_create_gives_a_plain_product_one_variant(db_session: AsyncSession) -> None:
    """Инвариант каталога: вариант есть всегда, в том числе у товара без объёма."""
    service = ProductService(db_session)

    product = await service.create("Патчи", "patchi", None, "Petitfee", 900, None, True)

    assert [(variant.volume_ml, variant.price_cents) for variant in product.live_variants] == [
        (None, 900)
    ]


async def test_two_live_variants_cannot_share_a_volume_in_the_database(
    db_session: AsyncSession,
) -> None:
    """Проверка не только в сервисе: частичный уникальный индекс — последнее слово."""
    from sqlalchemy.exc import IntegrityError

    product = await make_product(db_session, slug="serum", volume_ml=30, price_cents=1000)
    db_session.add(ProductVariant(product_id=product.id, volume_ml=30, price_cents=1200))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_a_product_can_hold_only_one_volumeless_variant(
    db_session: AsyncSession,
) -> None:
    """NULL в Postgres не равен NULL, поэтому «объём не указан» стережёт отдельный индекс."""
    from sqlalchemy.exc import IntegrityError

    product = await make_product(db_session, slug="patchi", price_cents=900)
    db_session.add(ProductVariant(product_id=product.id, volume_ml=None, price_cents=950))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_variants_come_back_in_the_order_the_owner_arranged_them(
    db_session: AsyncSession,
) -> None:
    await _two_volumes(db_session)

    loaded = (
        await db_session.execute(
            select(Product)
            .where(Product.slug == "centella-serum")
            .options(selectinload(Product.variants))
        )
    ).scalar_one()

    assert [variant.volume_ml for variant in loaded.live_variants] == [30, 50]


async def test_import_refuses_an_empty_volume_cell_for_a_product_that_has_volumes(
    db_session: AsyncSession,
) -> None:
    """Пустая ячейка «объём» у товара с объёмами — ошибка строки, а не третий вариант.

    «Объёма нет» — это настоящий вариант (патчи, тканевые маски), поэтому раньше пустая
    ячейка в файле, который объёмы называет, заводила рядом с 30 и 50 мл третий,
    безымянный: на странице товара — кнопка «Один размер» из пропущенной ячейки.
    """
    await _two_volumes(db_session)
    await db_session.flush()

    content = "name,slug,price,volume\nСыворотка Centella,centella-serum,500.00,\n".encode()
    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert [error.message for error in summary.errors] == [
        "у товара есть объёмы - укажите объём в строке"
    ]
    loaded = (
        await db_session.execute(
            select(Product)
            .where(Product.slug == "centella-serum")
            .options(selectinload(Product.variants))
        )
    ).scalar_one()
    assert [variant.volume_ml for variant in loaded.live_variants] == [30, 50]


async def test_import_still_prices_a_product_whose_only_variant_has_no_volume(
    db_session: AsyncSession,
) -> None:
    """Запрет — на *создание* безымянного объёма, а не на правку того, что уже есть.

    У патчей объёма нет вовсе, и пустая ячейка в файле с колонкой «объём» — это ровно
    их строка: цена должна доехать.
    """
    await make_product(db_session, slug="patchi", name="Патчи", variants=[(None, 900, True)])
    await db_session.flush()

    content = "name,slug,price,volume\nПатчи,patchi,7.00,\n".encode()
    summary, _ = await CatalogImportService(db_session).import_file("catalog.csv", content)
    await db_session.flush()

    assert summary.errors == []
    loaded = (
        await db_session.execute(
            select(Product).where(Product.slug == "patchi").options(selectinload(Product.variants))
        )
    ).scalar_one()
    assert [(variant.volume_ml, variant.price_cents) for variant in loaded.live_variants] == [
        (None, 700)
    ]


async def test_suggestions_say_how_many_volumes_a_product_is_sold_in(
    db_session: AsyncSession,
) -> None:
    """Выпадашка поиска подписывает цену «от» — и узнаёт об этом только отсюда.

    По `volume_ml` товара не отличить «объёма нет» от «объёмов несколько»: у обоих NULL.
    """
    await _two_volumes(db_session)
    await make_product(db_session, slug="centella-pads", name="Патчи Centella", price_cents=900)
    await db_session.flush()

    suggestions = await ProductService(db_session).suggest("centella")
    counts = {product.slug: len(product.live_variants) for product in suggestions.products}

    assert counts == {"centella-serum": 2, "centella-pads": 1}
