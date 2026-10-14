"""Shades: the second axis of a variant, and the photos tagged with them."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cart.service import CartService
from app.catalog.import_service import CatalogImportService
from app.catalog.models import Product, ProductImage, ProductVariant
from app.catalog.results import ImageArrangement, VariantSpec
from app.catalog.serializers import product_response
from app.catalog.service import (
    DuplicateVariantVolumeError,
    ImageArrangementError,
    ImageTagUnknownError,
    ProductService,
    ShadeMissingError,
    ShadePricesDifferError,
    TooManyImagesError,
)
from app.common.limits import MAX_PRODUCT_IMAGES, MAX_PRODUCT_VARIANTS
from app.orders.service import OrdersService
from tests.integration.factories import make_cycle, make_product, make_product_image, make_user


async def _lipstick(
    session: AsyncSession, shades: tuple[str, ...] = ("01 Nude", "05 Rose")
) -> Product:
    return await ProductService(session).create(
        name="Помада Velvet",
        slug="pomada-velvet",
        description=None,
        brand="Lulu",
        price_cents=70000,
        category_id=None,
        in_stock=True,
        variants=[VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade=shade)
                  for shade in shades],
    )  # fmt: skip


def _by_shade(product: Product) -> dict[str | None, ProductVariant]:
    return {variant.shade: variant for variant in product.live_variants}


async def test_a_product_is_created_in_shades(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)

    assert [variant.shade for variant in product.live_variants] == ["01 Nude", "05 Rose"]
    assert product.price_cents == 70000


async def test_shades_of_one_volume_keep_the_product_volume(db_session: AsyncSession) -> None:
    # Counted by volume, not by row: the card and the page title say "50 мл" for a
    # lipstick in two shades of one size, as they do for one without shades.
    product = await ProductService(db_session).create(
        name="Тональный крем",
        slug="tonalnyi-krem",
        description=None,
        brand="Lulu",
        price_cents=90000,
        category_id=None,
        in_stock=True,
        variants=[VariantSpec(volume_ml=50, price_cents=90000, in_stock=True, shade=shade)
                  for shade in ("21 Light", "23 Beige")],
    )  # fmt: skip

    assert product.volume_ml == 50


async def test_shades_of_one_volume_cannot_be_priced_apart(db_session: AsyncSession) -> None:
    with pytest.raises(ShadePricesDifferError):
        ProductService._require_specs(
            [
                VariantSpec(volume_ml=30, price_cents=100, in_stock=True, shade="01"),
                VariantSpec(volume_ml=30, price_cents=200, in_stock=True, shade="05"),
            ]
        )


async def test_volumes_with_shades_keep_a_price_each(db_session: AsyncSession) -> None:
    specs = [
        VariantSpec(volume_ml=volume, price_cents=volume * 10, in_stock=True, shade=shade)
        for volume in (30, 50)
        for shade in ("01", "05")
    ]

    assert ProductService._require_specs(specs) == specs


async def test_shades_are_all_or_none(db_session: AsyncSession) -> None:
    with pytest.raises(ShadeMissingError):
        ProductService._require_specs(
            [
                VariantSpec(volume_ml=None, price_cents=100, in_stock=True, shade="01"),
                VariantSpec(volume_ml=30, price_cents=100, in_stock=True, shade=None),
            ]
        )


async def test_the_same_shade_in_another_case_is_a_duplicate(db_session: AsyncSession) -> None:
    with pytest.raises(DuplicateVariantVolumeError):
        ProductService._require_specs(
            [
                VariantSpec(volume_ml=None, price_cents=100, in_stock=True, shade="05 Rose"),
                VariantSpec(volume_ml=None, price_cents=100, in_stock=True, shade="05 rose"),
            ]
        )


async def test_a_renamed_shade_stays_the_same_variant_and_keeps_its_photo(
    db_session: AsyncSession,
) -> None:
    product = await _lipstick(db_session, ("01 Nude", "05 Rosee"))
    rose = _by_shade(product)["05 Rosee"]
    nude = _by_shade(product)["01 Nude"]
    service = ProductService(db_session)
    image = await service.add_image(product.id, "rose.jpg", None, shades=["05 Rosee"])

    updated = await service.update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="01 Nude",
                        id=nude.id),
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="05 Rose",
                        id=rose.id),
        ],
    )  # fmt: skip

    assert _by_shade(updated)["05 Rose"].id == rose.id
    await db_session.refresh(image)
    assert image.shades == ["05 Rose"]


async def test_two_shade_names_can_swap_places(db_session: AsyncSession) -> None:
    """Postgres checks the unique index row by row, so a swap collides halfway unless the
    rows step out of the index first — see `_apply_specs`."""
    product = await _lipstick(db_session)
    nude = _by_shade(product)["01 Nude"]
    rose = _by_shade(product)["05 Rose"]

    updated = await ProductService(db_session).update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="05 Rose",
                        id=nude.id),
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="01 Nude",
                        id=rose.id),
        ],
    )  # fmt: skip
    await db_session.flush()

    assert _by_shade(updated)["05 Rose"].id == nude.id
    assert _by_shade(updated)["01 Nude"].id == rose.id


async def test_a_shade_can_take_the_name_of_one_being_withdrawn(
    db_session: AsyncSession,
) -> None:
    product = await _lipstick(db_session)
    nude = _by_shade(product)["01 Nude"]
    rose = _by_shade(product)["05 Rose"]

    updated = await ProductService(db_session).update(
        product.id,
        {},
        [VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="05 Rose",
                     id=nude.id)],
    )  # fmt: skip
    await db_session.flush()

    assert [variant.id for variant in updated.live_variants] == [nude.id]
    assert rose.deleted_at is not None


async def test_lines_without_ids_match_by_shade_ignoring_case(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)
    rose = _by_shade(product)["05 Rose"]

    updated = await ProductService(db_session).update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=None, price_cents=80000, in_stock=True, shade="01 Nude"),
            VariantSpec(volume_ml=None, price_cents=80000, in_stock=False, shade="05 ROSE"),
        ],
    )

    assert _by_shade(updated)["05 ROSE"].id == rose.id
    assert _by_shade(updated)["05 ROSE"].in_stock is False


async def test_a_withdrawn_shade_comes_back_as_itself(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)
    rose = _by_shade(product)["05 Rose"]
    service = ProductService(db_session)
    only_nude = [VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="01 Nude")]
    await service.update(product.id, {}, only_nude)

    updated = await service.update(
        product.id,
        {},
        [
            *only_nude,
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="05 Rose"),
        ],
    )

    assert _by_shade(updated)["05 Rose"].id == rose.id


async def test_the_first_photo_is_primary_and_later_ones_queue(db_session: AsyncSession) -> None:
    product = await make_product(db_session)
    service = ProductService(db_session)

    first = await service.add_image(product.id, "a.jpg", None)
    second = await service.add_image(product.id, "b.jpg", None)

    assert (first.is_primary, second.is_primary) == (True, False)
    assert (first.sort_order, second.sort_order) == (0, 1)


async def test_the_gallery_has_a_ceiling(db_session: AsyncSession) -> None:
    product = await make_product(db_session)
    service = ProductService(db_session)
    for index in range(MAX_PRODUCT_IMAGES):
        await service.add_image(product.id, f"{index}.jpg", None)

    with pytest.raises(TooManyImagesError):
        await service.add_image(product.id, "one-more.jpg", None)


async def test_a_photo_cannot_be_tagged_with_a_shade_the_product_lacks(
    db_session: AsyncSession,
) -> None:
    product = await _lipstick(db_session)

    with pytest.raises(ImageTagUnknownError):
        await ProductService(db_session).add_image(product.id, "x.jpg", None, shades=["99 Black"])


async def test_arranging_reorders_retags_and_moves_the_primary(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)
    service = ProductService(db_session)
    first = await service.add_image(product.id, "a.jpg", None)
    second = await service.add_image(product.id, "b.jpg", None)

    images = await service.arrange_images(
        product.id,
        [
            ImageArrangement(id=second.id, shades=("05 Rose",)),
            ImageArrangement(id=first.id),
        ],
    )

    assert [image.id for image in images] == [second.id, first.id]
    assert (second.is_primary, first.is_primary) == (True, False)
    assert second.shades == ["05 Rose"]


async def test_arranging_rewrites_alt_only_where_one_is_sent(db_session: AsyncSession) -> None:
    # The form edits a photo's caption through the same save as its tags; a photo the
    # request says nothing about keeps its own.
    product = await make_product(db_session)
    service = ProductService(db_session)
    first = await service.add_image(product.id, "a.jpg", "Old caption")
    second = await service.add_image(product.id, "b.jpg", "Kept caption")
    third = await service.add_image(product.id, "c.jpg", "Cleared caption")

    await service.arrange_images(
        product.id,
        [
            ImageArrangement(id=first.id, alt="Tube, front", alt_given=True),
            ImageArrangement(id=second.id),
            ImageArrangement(id=third.id, alt=None, alt_given=True),
        ],
    )

    assert (first.alt, second.alt, third.alt) == ("Tube, front", "Kept caption", None)


async def test_arranging_a_gallery_that_changed_meanwhile_is_refused(
    db_session: AsyncSession,
) -> None:
    product = await make_product(db_session)
    service = ProductService(db_session)
    first = await service.add_image(product.id, "a.jpg", None)
    await service.add_image(product.id, "b.jpg", None)

    with pytest.raises(ImageArrangementError):
        await service.arrange_images(product.id, [ImageArrangement(id=first.id)])


async def test_deleting_the_primary_photo_promotes_the_next(db_session: AsyncSession) -> None:
    product = await make_product(db_session)
    service = ProductService(db_session)
    first = await service.add_image(product.id, "a.jpg", None)
    second = await service.add_image(product.id, "b.jpg", None)

    await service.delete_image(product.id, first.id)
    await db_session.flush()

    assert second.is_primary is True


async def test_the_cart_shows_the_shade_and_its_photo(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session)
    service = ProductService(db_session)
    await service.add_image(product.id, "all.jpg", None)
    await service.add_image(product.id, "rose.jpg", None, shades=["05 Rose"])

    cart = await CartService(db_session).add_item(user.id, _by_shade(product)["05 Rose"].id, 1)

    assert cart.items[0].product_shade == "05 Rose"
    assert cart.items[0].product_image_url == "rose.jpg"


async def test_an_order_line_snapshots_the_shade(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session)
    await CartService(db_session).add_item(user.id, _by_shade(product)["01 Nude"].id, 2)

    order = await OrdersService(db_session).checkout(user.id, None)

    assert [(item.product_shade, item.quantity) for item in order.items] == [("01 Nude", 2)]


async def _import(session: AsyncSession, csv: str) -> list[str]:
    summary, _ = await CatalogImportService(session).import_file("x.csv", csv.encode())
    return [error.message for error in summary.errors]


async def _variants(session: AsyncSession, slug: str) -> list[tuple[int | None, str | None, int]]:
    session.expire_all()
    product = (
        await session.execute(
            select(Product).where(Product.slug == slug).options(selectinload(Product.variants))
        )
    ).scalar_one()
    return [
        (variant.volume_ml, variant.shade, variant.price_cents) for variant in product.live_variants
    ]


async def test_the_import_reads_a_row_per_shade(db_session: AsyncSession) -> None:
    errors = await _import(
        db_session,
        "name,slug,price,volume,тон\n"
        "Тон,ton,500,30,21 Light\n"
        "Тон,ton,500,30,23 Beige\n"
        "Тон,ton,800,50,21 Light\n",
    )

    assert errors == []
    assert await _variants(db_session, "ton") == [
        (30, "21 Light", 50000),
        (30, "23 Beige", 50000),
        (50, "21 Light", 80000),
    ]


async def test_the_import_refuses_two_prices_for_one_volume(db_session: AsyncSession) -> None:
    errors = await _import(
        db_session,
        "name,slug,price,shade\nПомада,pomada,500,01\nПомада,pomada,600,05\n",
    )

    assert len(errors) == 1
    assert "цена одна" in errors[0]


async def test_a_price_list_without_shades_prices_every_shade(db_session: AsyncSession) -> None:
    await _lipstick(db_session)

    errors = await _import(db_session, "name,slug,price\nПомада Velvet,pomada-velvet,900\n")

    assert errors == []
    assert [price for *_, price in await _variants(db_session, "pomada-velvet")] == [90000, 90000]


async def test_stock_without_a_shade_column_is_refused_for_a_shaded_product(
    db_session: AsyncSession,
) -> None:
    await _lipstick(db_session)

    errors = await _import(
        db_session, "name,slug,price,in_stock\nПомада Velvet,pomada-velvet,900,нет\n"
    )

    assert len(errors) == 1
    assert "колонку «тон»" in errors[0]


async def test_a_nameless_variant_takes_the_first_shade_in_place(
    db_session: AsyncSession,
) -> None:
    product = await make_product(db_session, slug="gloss")
    before = product.live_variants[0].id

    errors = await _import(db_session, "name,slug,price,shade\nБлеск,gloss,300,01\n")

    assert errors == []
    db_session.expire_all()
    variant = await db_session.get(ProductVariant, before)
    assert variant is not None
    assert variant.shade == "01"


async def test_an_empty_shade_cell_is_refused_beside_named_ones(db_session: AsyncSession) -> None:
    await _lipstick(db_session)

    errors = await _import(db_session, "name,slug,price,shade\nПомада Velvet,pomada-velvet,700,\n")

    assert errors == ["у товара есть тона - укажите тон в строке"]


async def test_tags_survive_on_photos_in_the_response(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)
    await ProductService(db_session).add_image(product.id, "rose.jpg", None, shades=["05 Rose"])

    images = (
        (
            await db_session.execute(
                select(ProductImage).where(ProductImage.product_id == product.id)
            )
        )
        .scalars()
        .all()
    )

    assert [(image.url, image.shades) for image in images] == [("rose.jpg", ["05 Rose"])]


async def test_a_row_moved_to_another_volume_is_a_new_variant(db_session: AsyncSession) -> None:
    service = ProductService(db_session)
    product = await service.create(
        name="Сыворотка",
        slug="serum",
        description=None,
        brand="Lulu",
        price_cents=1000,
        category_id=None,
        in_stock=True,
        variants=[VariantSpec(volume_ml=30, price_cents=1000, in_stock=True)],
    )
    small = product.live_variants[0]

    updated = await service.update(
        product.id, {}, [VariantSpec(volume_ml=50, price_cents=2000, in_stock=True, id=small.id)]
    )

    [large] = updated.live_variants
    assert large.id != small.id
    assert large.volume_ml == 50
    assert small.deleted_at is not None
    assert small.volume_ml == 30


async def test_a_renamed_shade_reaches_pending_orders(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session, ("01 Nude", "05 Rosee"))
    rose = _by_shade(product)["05 Rosee"]
    await CartService(db_session).add_item(user.id, rose.id, 1)
    orders = OrdersService(db_session)
    order = await orders.checkout(user.id, None)

    await orders.rename_variants({rose.id: "05 Rose"})

    assert [item.product_shade for item in order.items] == ["05 Rose"]


async def test_an_import_naming_a_shade_reaches_pending_orders(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await make_product(db_session, slug="gloss")
    await CartService(db_session).add_item(user.id, product.live_variants[0].id, 1)
    order = await OrdersService(db_session).checkout(user.id, None)

    errors = await _import(db_session, "name,slug,price,shade\nБлеск,gloss,1000,01\n")

    assert errors == []
    await db_session.refresh(order, attribute_names=["items"])
    assert [item.product_shade for item in order.items] == ["01"]


async def test_a_price_notice_quotes_the_shade_as_the_import_respells_it(
    db_session: AsyncSession,
) -> None:
    # Renamed before repriced: the notice is about the line as it now reads.
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session)
    await CartService(db_session).add_item(user.id, _by_shade(product)["05 Rose"].id, 1)
    await OrdersService(db_session).checkout(user.id, None)

    summary, changes = await CatalogImportService(db_session).import_file(
        "x.csv", "name,slug,price,shade\nПомада Velvet,pomada-velvet,800,05 ROSE\n".encode()
    )

    assert summary.errors == []
    assert [change.product_shade for change in changes] == ["05 ROSE"]


async def test_a_half_shaded_product_is_reported_against_its_row(
    db_session: AsyncSession,
) -> None:
    await make_product(db_session, slug="tint", variants=[(30, 1000, True), (50, 2000, True)])

    summary, _ = await CatalogImportService(db_session).import_file(
        "x.csv", "name,slug,price,volume,shade\nТинт,tint,1000,30,01\n".encode()
    )

    assert [error.row for error in summary.errors] == [2]


async def test_a_withdrawn_shade_hides_its_photo(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session)
    service = ProductService(db_session)
    # Primary as well: an untagged "any" would have put a rose tube on the card.
    image = await service.add_image(product.id, "rose.jpg", None, shades=["05 Rose"])
    await service.add_image(product.id, "common.jpg", None)

    product = await service.update(
        product.id,
        {},
        [VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade="01 Nude")],
    )

    await db_session.refresh(image)
    assert (image.volumes_ml, image.shades, image.hidden) == ([], [], True)
    assert [shown.url for shown in product_response(product).images] == ["common.jpg"]
    cart = await CartService(db_session).add_item(user.id, _by_shade(product)["01 Nude"].id, 1)
    assert cart.items[0].product_image_url == "common.jpg"


async def test_a_withdrawn_volume_hides_a_photo_of_that_volume(
    db_session: AsyncSession,
) -> None:
    product = await make_product(
        db_session, slug="cream", variants=[(30, 1000, True), (50, 2000, True)]
    )
    service = ProductService(db_session)
    image = await service.add_image(product.id, "50.jpg", None, volumes_ml=[50])
    both = await service.add_image(product.id, "both.jpg", None, volumes_ml=[30, 50])

    await service.update(
        product.id, {}, [VariantSpec(volume_ml=30, price_cents=1000, in_stock=True)]
    )

    await db_session.refresh(image)
    await db_session.refresh(both)
    assert (image.volumes_ml, image.hidden) == ([], True)
    # One of its volumes is still sold: the photo stays, tagged with what is left.
    assert (both.volumes_ml, both.hidden) == ([30], False)


async def _foundation(session: AsyncSession) -> Product:
    """30 ml in two shades, 50 ml in one of them."""
    return await ProductService(session).create(
        name="Тональный крем",
        slug="tonalnyi-krem",
        description=None,
        brand="Lulu",
        price_cents=50000,
        category_id=None,
        in_stock=True,
        variants=[
            VariantSpec(volume_ml=30, price_cents=50000, in_stock=True, shade="21 Light"),
            VariantSpec(volume_ml=30, price_cents=50000, in_stock=True, shade="23 Beige"),
            VariantSpec(volume_ml=50, price_cents=80000, in_stock=True, shade="21 Light"),
        ],
    )


async def test_a_photo_can_show_several_shades(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session, ("01 Nude", "05 Rose", "12 Berry"))
    service = ProductService(db_session)
    await service.add_image(product.id, "all.jpg", None)
    image = await service.add_image(
        product.id, "pair.jpg", None, shades=["01 Nude", "05 rose", "05 Rose"]
    )

    cart = await CartService(db_session).add_item(user.id, _by_shade(product)["05 Rose"].id, 1)

    # Each shade once, in the spelling the owner sent first.
    assert image.shades == ["01 Nude", "05 rose"]
    assert cart.items[0].product_image_url == "pair.jpg"


async def test_tags_that_meet_in_no_variant_are_refused(db_session: AsyncSession) -> None:
    product = await _foundation(db_session)
    service = ProductService(db_session)

    with pytest.raises(ImageTagUnknownError):
        await service.add_image(product.id, "x.jpg", None, volumes_ml=[50], shades=["23 Beige"])

    # One of the two volumes has the shade, and that is enough.
    image = await service.add_image(
        product.id, "beige.jpg", None, volumes_ml=[50, 30], shades=["23 Beige"]
    )
    assert image.volumes_ml == [30, 50]


async def test_a_withdrawn_shade_leaves_the_other_tags_of_a_photo(
    db_session: AsyncSession,
) -> None:
    product = await _lipstick(db_session, ("01 Nude", "05 Rose", "12 Berry"))
    service = ProductService(db_session)
    image = await service.add_image(product.id, "pair.jpg", None, shades=["01 Nude", "12 Berry"])

    await service.update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=None, price_cents=70000, in_stock=True, shade=shade)
            for shade in ("01 Nude", "05 Rose")
        ],
    )

    await db_session.refresh(image)
    assert image.shades == ["01 Nude"]


async def test_a_withdrawn_volume_keeps_the_shades_its_photo_is_of(
    db_session: AsyncSession,
) -> None:
    product = await _foundation(db_session)
    service = ProductService(db_session)
    image = await service.add_image(
        product.id, "light.jpg", None, volumes_ml=[50], shades=["21 Light"]
    )

    await service.update(
        product.id,
        {},
        [
            VariantSpec(volume_ml=30, price_cents=50000, in_stock=True, shade="21 Light"),
            VariantSpec(volume_ml=30, price_cents=50000, in_stock=True, shade="23 Beige"),
        ],
    )

    await db_session.refresh(image)
    assert (image.volumes_ml, image.shades) == ([], ["21 Light"])


async def test_arranging_retags_with_several_volumes_and_shades(
    db_session: AsyncSession,
) -> None:
    product = await _foundation(db_session)
    service = ProductService(db_session)
    image = await service.add_image(product.id, "a.jpg", None)

    await service.arrange_images(
        product.id,
        [ImageArrangement(id=image.id, volumes_ml=(50, 30), shades=("21 Light", "23 Beige"))],
    )

    assert (image.volumes_ml, image.shades) == ([30, 50], ["21 Light", "23 Beige"])

    with pytest.raises(ImageTagUnknownError):
        await service.arrange_images(product.id, [ImageArrangement(id=image.id, volumes_ml=(100,))])


async def test_a_stale_tag_nobody_touches_does_not_block_arranging(
    db_session: AsyncSession,
) -> None:
    product = await _lipstick(db_session)
    stale = await make_product_image(db_session, product, url="a.jpg", shades=["12 Berry"])
    other = await make_product_image(db_session, product, url="b.jpg", sort_order=1)
    service = ProductService(db_session)

    images = await service.arrange_images(
        product.id,
        [
            ImageArrangement(id=other.id),
            ImageArrangement(id=stale.id, shades=("12 Berry",)),
        ],
    )

    assert [image.id for image in images] == [other.id, stale.id]


async def test_a_hidden_photo_drops_its_tags_and_leaves_the_storefront(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    await make_cycle(db_session)
    product = await _lipstick(db_session)
    service = ProductService(db_session)
    first = await service.add_image(product.id, "rose.jpg", None, shades=["05 Rose"])
    second = await service.add_image(product.id, "all.jpg", None)

    await service.arrange_images(
        product.id,
        [
            ImageArrangement(id=first.id, shades=("05 Rose",), hidden=True),
            ImageArrangement(id=second.id),
        ],
    )
    cart = await CartService(db_session).add_item(user.id, _by_shade(product)["05 Rose"].id, 1)
    product = await service.get_by_id(product.id)

    assert (first.hidden, first.shades) == (True, [])
    assert cart.items[0].product_image_url == "all.jpg"
    # The storefront does not see it, and the next photo is its primary one; the admin
    # form gets the whole gallery back.
    public = product_response(product).images
    assert [(image.url, image.is_primary) for image in public] == [("all.jpg", True)]
    admin = product_response(product, include_hidden=True).images
    assert [(image.url, image.hidden) for image in admin] == [
        ("rose.jpg", True),
        ("all.jpg", False),
    ]


async def test_a_photo_can_be_uploaded_hidden(db_session: AsyncSession) -> None:
    product = await _lipstick(db_session)

    image = await ProductService(db_session).add_image(
        product.id, "x.jpg", None, shades=["01 Nude"], hidden=True
    )

    assert (image.hidden, image.shades) == (True, [])


async def test_the_import_keeps_to_the_variant_ceiling(db_session: AsyncSession) -> None:
    rows = "".join(f"Помада,pomada,500,{shade:03}\n" for shade in range(MAX_PRODUCT_VARIANTS + 1))

    errors = await _import(db_session, "name,slug,price,shade\n" + rows)

    assert errors == [f"у товара уже {MAX_PRODUCT_VARIANTS} вариантов - больше не добавить"]
    assert len(await _variants(db_session, "pomada")) == MAX_PRODUCT_VARIANTS


async def test_a_refused_row_does_not_hold_its_variant_against_the_next(
    db_session: AsyncSession,
) -> None:
    # The first row is refused for its empty shade cell. Its price, 700, must not become
    # "the price of this volume": the next row is correct at 900 and has to be applied,
    # and only a real repeat of an applied row is a duplicate.
    await _lipstick(db_session)

    errors = await _import(
        db_session,
        "name,slug,price,shade\n"
        "Помада Velvet,pomada-velvet,700,\n"
        "Помада Velvet,pomada-velvet,900,01 Nude\n"
        "Помада Velvet,pomada-velvet,900,01 Nude\n",
    )

    assert errors == [
        "у товара есть тона - укажите тон в строке",
        "этот вариант товара уже был выше в файле",
    ]
