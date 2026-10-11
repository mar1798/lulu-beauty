import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, require_live_user
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.wanted.models import WantedProduct
from app.wanted.service import AccountGoneError

_CUSTOMER = CurrentUser(id=uuid.uuid4(), role=Role.CUSTOMER)


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def signed_in() -> Iterator[None]:
    app.dependency_overrides[require_live_user] = lambda: _CUSTOMER
    yield


def _stored() -> WantedProduct:
    wanted = WantedProduct(name="Аня", phone="+996555123456", message="Нужен крем")
    wanted.id = uuid.uuid4()
    wanted.created_at = datetime.now(UTC)
    return wanted


async def test_guest_is_refused(client: AsyncClient) -> None:
    """A wish needs an account: the owner answers on the number the bot vouched for."""
    with patch("app.wanted.router.WantedProductsService") as service_cls:
        async with client as c:
            response = await c.post("/wanted-products", json={"message": "Нужен крем"})

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"
    service_cls.assert_not_called()


async def test_an_unusable_token_is_refused(client: AsyncClient) -> None:
    async with client as c:
        response = await c.post(
            "/wanted-products",
            headers={"Authorization": "Bearer not-a-token"},
            json={"message": "Нужен крем"},
        )

    assert response.status_code == 401


@pytest.mark.usefixtures("signed_in")
async def test_customer_may_submit_a_wish_and_the_owner_is_told(client: AsyncClient) -> None:
    wanted = _stored()
    with (
        patch("app.wanted.router.WantedProductsService") as service_cls,
        patch("app.wanted.router.notify_wanted_product") as notify,
    ):
        submit: MagicMock = AsyncMock(return_value=wanted)
        service_cls.return_value.submit = submit
        async with client as c:
            response = await c.post("/wanted-products", json={"message": "Нужен крем"})

    assert response.status_code == 201
    assert response.json()["id"] == str(wanted.id)
    assert submit.await_args.kwargs == {"message": "Нужен крем", "user_id": _CUSTOMER.id}
    # Queued as a background task, so it runs after the response rather than inside it.
    notify.assert_called_once_with(wanted.id)


@pytest.mark.usefixtures("signed_in")
async def test_an_account_erased_mid_request_answers_401(client: AsyncClient) -> None:
    with patch("app.wanted.router.WantedProductsService") as service_cls:
        service_cls.return_value.submit = AsyncMock(side_effect=AccountGoneError)
        async with client as c:
            response = await c.post("/wanted-products", json={"message": "Нужен крем"})

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"
