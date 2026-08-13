from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import ProductImage
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
