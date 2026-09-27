"""The owner's picks for the home page's hero: `Product.is_featured`, at most three."""

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.service import FeaturedLimitError, ProductService
from app.common.limits import MAX_FEATURED_PRODUCTS
from tests.integration.factories import make_product


async def _pin_up_to_the_limit(db_session: AsyncSession) -> None:
    for index in range(MAX_FEATURED_PRODUCTS):
        await make_product(db_session, name=f"Pinned {index}", is_featured=True)


async def test_a_pin_past_the_limit_is_refused(db_session: AsyncSession) -> None:
    await _pin_up_to_the_limit(db_session)
    extra = await make_product(db_session, name="Extra")
    service = ProductService(db_session)

    with pytest.raises(FeaturedLimitError):
        await service.update(extra.id, {"is_featured": True})


async def test_a_new_product_cannot_be_created_pinned_past_the_limit(
    db_session: AsyncSession,
) -> None:
    await _pin_up_to_the_limit(db_session)
    service = ProductService(db_session)

    with pytest.raises(FeaturedLimitError):
        await service.create("Extra", "extra", None, "Anua", 1000, None, True, is_featured=True)


async def test_a_pinned_product_can_be_saved_again_at_the_limit(
    db_session: AsyncSession,
) -> None:
    """Re-saving one of the three with the switch still on is an edit, not a fourth pin."""
    await _pin_up_to_the_limit(db_session)
    pinned = await make_product(db_session, name="Fourth", is_featured=False)
    service = ProductService(db_session)
    listed, _ = await service.list_public(None, None, 1, 20, featured=True)

    saved = await service.update(listed[0].id, {"is_featured": True, "name": "Renamed"})

    assert saved.is_featured is True
    assert pinned.is_featured is False


async def test_unpinning_frees_a_slot(db_session: AsyncSession) -> None:
    await _pin_up_to_the_limit(db_session)
    extra = await make_product(db_session, name="Extra")
    service = ProductService(db_session)
    listed, _ = await service.list_public(None, None, 1, 20, featured=True)

    await service.update(listed[0].id, {"is_featured": False})
    saved = await service.update(extra.id, {"is_featured": True})

    assert saved.is_featured is True


async def test_a_withdrawn_product_leaves_the_home_page_and_its_slot(
    db_session: AsyncSession,
) -> None:
    await _pin_up_to_the_limit(db_session)
    extra = await make_product(db_session, name="Extra")
    service = ProductService(db_session)
    listed, _ = await service.list_public(None, None, 1, 20, featured=True)

    await service.soft_delete(listed[0].id)
    restored = await service.restore(listed[0].id)
    saved = await service.update(extra.id, {"is_featured": True})

    assert restored.is_featured is False
    assert saved.is_featured is True


async def test_a_deleted_row_still_marked_does_not_hold_a_slot(db_session: AsyncSession) -> None:
    """A row pinned before `soft_delete` unpinned, or by hand, must not block a new pick."""
    for index in range(MAX_FEATURED_PRODUCTS):
        await make_product(
            db_session,
            name=f"Gone {index}",
            is_featured=True,
            deleted_at=datetime.now(UTC) if index == 0 else None,
        )
    extra = await make_product(db_session, name="Extra")

    saved = await ProductService(db_session).update(extra.id, {"is_featured": True})

    assert saved.is_featured is True


async def test_the_featured_filter_lists_only_live_picks(db_session: AsyncSession) -> None:
    await make_product(db_session, name="Pinned", is_featured=True)
    await make_product(
        db_session, name="Pinned but gone", is_featured=True, deleted_at=datetime.now(UTC)
    )
    await make_product(db_session, name="Plain")
    service = ProductService(db_session)

    featured, total = await service.list_public(None, None, 1, 20, featured=True)

    assert [product.name for product in featured] == ["Pinned"]
    assert total == 1
