"""Guest cart and wishlist: preview is public, merge needs an account."""

import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_live_user
from app.auth.models import Role
from app.cart.schemas import CartResponse
from app.cart.service import GuestCartCycleChangedError
from app.common.limits import MAX_GUEST_CART_LINES
from app.db import get_session
from app.main import app
from app.wishlist.schemas import GuestWishlistResponse

_EMPTY_CART = CartResponse(cycle_id=None, cycle_deadline_at=None, items=[], total_cents=0)


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _lines(count: int) -> list[dict[str, object]]:
    return [{"variantId": str(uuid.uuid4()), "quantity": 1} for _ in range(count)]


async def test_cart_preview_is_open_to_a_guest(client: AsyncClient) -> None:
    with patch("app.cart.router.CartService") as service_cls:
        service_cls.return_value.preview = AsyncMock(return_value=_EMPTY_CART)
        async with client as c:
            response = await c.post("/cart/preview", json={"items": _lines(2)})

    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_cart_preview_refuses_an_oversized_cart(client: AsyncClient) -> None:
    async with client as c:
        response = await c.post("/cart/preview", json={"items": _lines(MAX_GUEST_CART_LINES + 1)})

    assert response.status_code == 422


async def test_cart_merge_needs_an_account(client: AsyncClient) -> None:
    with patch("app.cart.router.CartService") as service_cls:
        async with client as c:
            response = await c.post("/cart/merge", json={"items": _lines(1)})

    assert response.status_code == 401
    service_cls.assert_not_called()


async def test_wishlist_preview_is_open_to_a_guest(client: AsyncClient) -> None:
    with patch("app.wishlist.router.WishlistService") as service_cls:
        service_cls.return_value.preview = AsyncMock(
            return_value=GuestWishlistResponse(products=[])
        )
        async with client as c:
            response = await c.post("/wishlist/preview", json={"productIds": [str(uuid.uuid4())]})

    assert response.status_code == 200
    assert response.json() == {"products": []}


async def test_wishlist_merge_needs_an_account(client: AsyncClient) -> None:
    with patch("app.wishlist.router.WishlistService") as service_cls:
        async with client as c:
            response = await c.post("/wishlist/merge", json={"productIds": []})

    assert response.status_code == 401
    service_cls.assert_not_called()


async def test_cart_merge_from_another_cycle_answers_cart_cycle_changed(
    client: AsyncClient,
) -> None:
    app.dependency_overrides[require_live_user] = lambda: CurrentUser(
        id=uuid.uuid4(), role=Role.CUSTOMER
    )
    cycle_id = uuid.uuid4()
    with patch("app.cart.router.CartService") as service_cls:
        service_cls.return_value.merge = AsyncMock(side_effect=GuestCartCycleChangedError)
        async with client as c:
            response = await c.post(
                "/cart/merge", json={"items": _lines(1), "cycleId": str(cycle_id)}
            )

    assert response.status_code == 409
    assert response.json()["detail"] == "cart_cycle_changed"
    assert service_cls.return_value.merge.call_args.args[2] == cycle_id
