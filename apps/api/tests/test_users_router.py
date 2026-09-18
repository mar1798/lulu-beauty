import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.users.service import (
    AccountHasUnfinishedOrdersError,
    AccountNotDeletableError,
    UserNotFoundError,
)

CURRENT_USER_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=CURRENT_USER_ID, role=Role.CUSTOMER
    )
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _service(mock_service_cls: MagicMock, withdrawn: list[uuid.UUID]) -> MagicMock:
    service = mock_service_cls.return_value
    service.delete_account = AsyncMock(return_value=withdrawn)
    return service


async def test_delete_me_erases_the_caller_and_answers_without_a_body(
    client: AsyncClient,
) -> None:
    """204, and it is the caller's own id that gets erased — never one from the request."""
    with (
        patch("app.users.router.UsersService") as service_cls,
        patch("app.users.router.notify_account_deleted") as notify,
    ):
        service = _service(service_cls, [])
        async with client as c:
            response = await c.delete("/users/me")

    assert response.status_code == 204
    assert response.content == b""
    service.delete_account.assert_awaited_once_with(CURRENT_USER_ID)
    notify.assert_not_called()


async def test_delete_me_tells_the_owner_about_withdrawn_orders(client: AsyncClient) -> None:
    """The owner hears only when something actually left their purchase list."""
    withdrawn = [uuid.uuid4(), uuid.uuid4()]
    with (
        patch("app.users.router.UsersService") as service_cls,
        patch("app.users.router.notify_account_deleted") as notify,
    ):
        _service(service_cls, withdrawn)
        async with client as c:
            response = await c.delete("/users/me")

    assert response.status_code == 204
    notify.assert_called_once_with(withdrawn)


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (UserNotFoundError(), 404, "user_not_found"),
        (AccountNotDeletableError(), 403, "account_not_deletable"),
        (AccountHasUnfinishedOrdersError([uuid.uuid4()]), 409, "account_has_unfinished_orders"),
    ],
)
async def test_delete_me_maps_each_refusal_to_its_own_code(
    client: AsyncClient, error: Exception, status: int, code: str
) -> None:
    """Every refusal is branched on by the site (`apiErrors.ts`), so each needs its own
    code — a shared 400 would leave the person reading "не удалось" about a rule."""
    with (
        patch("app.users.router.UsersService") as service_cls,
        patch("app.users.router.notify_account_deleted"),
    ):
        service_cls.return_value.delete_account = AsyncMock(side_effect=error)
        async with client as c:
            response = await c.delete("/users/me")

    assert response.status_code == status
    assert response.json()["detail"] == code


async def test_deletion_state_reports_what_blocks_the_erasure(client: AsyncClient) -> None:
    """The account page draws its button from this, so the blocking ids have to come back
    — a bare "no" would leave the page unable to say which orders to close."""
    blocking = [uuid.uuid4()]
    with patch("app.users.router.UsersService") as service_cls:
        service = service_cls.return_value
        service.get = AsyncMock()
        service.deletion_blockers = AsyncMock(return_value=blocking)
        async with client as c:
            response = await c.get("/users/me/deletion")

    assert response.status_code == 200
    assert response.json() == {
        "isDeletable": False,
        "blockingOrders": [str(blocking[0])],
    }
    service.deletion_blockers.assert_awaited_once_with(CURRENT_USER_ID)


async def test_deletion_state_says_yes_when_nothing_is_in_the_way(client: AsyncClient) -> None:
    with patch("app.users.router.UsersService") as service_cls:
        service = service_cls.return_value
        service.get = AsyncMock()
        service.deletion_blockers = AsyncMock(return_value=[])
        async with client as c:
            response = await c.get("/users/me/deletion")

    assert response.json() == {"isDeletable": True, "blockingOrders": []}


async def test_deletion_state_is_404_for_an_account_already_erased(client: AsyncClient) -> None:
    """A still-valid access token outlives the row it names; the answer is the same
    `user_not_found` every other profile endpoint gives it."""
    with patch("app.users.router.UsersService") as service_cls:
        service_cls.return_value.get = AsyncMock(side_effect=UserNotFoundError())
        async with client as c:
            response = await c.get("/users/me/deletion")

    assert response.status_code == 404
    assert response.json()["detail"] == "user_not_found"
