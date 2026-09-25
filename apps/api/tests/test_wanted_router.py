import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import get_session
from app.main import app
from app.wanted.models import WantedProduct
from app.wanted.service import ContactRequiredError


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    """No auth override: the point of this endpoint is that it answers without one."""
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _stored() -> WantedProduct:
    wanted = WantedProduct(name="Аня", phone="+996555123456", message="Нужен крем")
    wanted.id = uuid.uuid4()
    wanted.created_at = datetime.now(UTC)
    return wanted


async def test_guest_may_submit_a_wish_and_the_owner_is_told(client: AsyncClient) -> None:
    wanted = _stored()
    with (
        patch("app.wanted.router.WantedProductsService") as service_cls,
        patch("app.wanted.router.notify_wanted_product") as notify,
    ):
        service_cls.return_value.submit = AsyncMock(return_value=wanted)
        async with client as c:
            response = await c.post(
                "/wanted-products",
                json={"message": "Нужен крем", "name": "Аня", "phone": "+996555123456"},
            )

    assert response.status_code == 201
    assert response.json()["id"] == str(wanted.id)
    # Queued as a background task, so it runs after the response rather than inside it.
    notify.assert_called_once_with(wanted.id)


async def test_guest_without_a_contact_gets_a_machine_code(client: AsyncClient) -> None:
    with patch("app.wanted.router.WantedProductsService") as service_cls:
        service_cls.return_value.submit = AsyncMock(side_effect=ContactRequiredError)
        async with client as c:
            response = await c.post("/wanted-products", json={"message": "Нужен крем"})

    assert response.status_code == 400
    assert response.json()["detail"] == "contact_required"


async def test_an_unusable_token_is_treated_as_a_guest(client: AsyncClient) -> None:
    """The page never asked anyone to sign in - an expired token must not answer 401."""
    with (
        patch("app.wanted.router.WantedProductsService") as service_cls,
        patch("app.wanted.router.notify_wanted_product"),
    ):
        submit: MagicMock = AsyncMock(return_value=_stored())
        service_cls.return_value.submit = submit
        async with client as c:
            response = await c.post(
                "/wanted-products",
                headers={"Authorization": "Bearer not-a-token"},
                json={"message": "Нужен крем", "name": "Аня", "phone": "+996555123456"},
            )

    assert response.status_code == 201
    assert submit.await_args.kwargs["user_id"] is None
