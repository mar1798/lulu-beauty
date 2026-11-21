import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.promotions.code_errors import (
    PromoCodeInvalidError,
    PromoCodeTakenError,
    PromoCodeUserNotFoundError,
)
from app.promotions.models import Promotion
from app.promotions.service import (
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
    PromotionNotFoundError,
)

NOW = datetime.now(UTC)
BODY: dict[str, Any] = {
    "title": "Скидка 10%",
    "startsAt": NOW.isoformat(),
    "rewards": [{"type": "GIFT", "gift": "CUSTOM"}],
}


def _client_as(role: Role) -> Callable[[], Iterator[AsyncClient]]:
    def fixture() -> Iterator[AsyncClient]:
        session = AsyncMock()
        session.scalar.return_value = role
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=uuid.uuid4(), role=role)
        try:
            yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        finally:
            app.dependency_overrides.clear()

    return fixture


owner = pytest.fixture(_client_as(Role.SUPER_ADMIN), name="owner")
admin = pytest.fixture(_client_as(Role.ADMIN), name="admin")


def _code() -> Promotion:
    return Promotion(
        id=uuid.uuid4(),
        slug="promo-code-x",
        code="LETO2026",
        title="Лето",
        description_html=None,
        starts_at=NOW - timedelta(days=1),
        ends_at=None,
        is_enabled=True,
        announce=False,
        sort_order=0,
        assigned_user_id=None,
        conditions=[],
        rewards=[{"type": "GIFT", "gift": "CUSTOM", "title": "Mystery box", "quantity": 1}],
        deleted_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


_ROUTES: list[tuple[str, str]] = [
    ("GET", "/admin/promo-codes"),
    ("POST", "/admin/promo-codes"),
    ("GET", f"/admin/promo-codes/{uuid.uuid4()}"),
    ("PUT", f"/admin/promo-codes/{uuid.uuid4()}"),
    ("PATCH", f"/admin/promo-codes/{uuid.uuid4()}/enabled"),
    ("DELETE", f"/admin/promo-codes/{uuid.uuid4()}"),
    ("GET", f"/admin/promo-codes/{uuid.uuid4()}/participants"),
]


@pytest.mark.parametrize(("method", "path"), _ROUTES)
async def test_a_plain_admin_is_refused_everywhere(
    admin: AsyncClient, method: str, path: str
) -> None:
    async with admin as client:
        response = await client.request(method, path, json=BODY)

    assert response.status_code == 403
    assert response.json()["detail"] == "super_admin_only"


async def test_list_derives_status_and_counts(owner: AsyncClient) -> None:
    code = _code()
    with patch("app.promotions.owner_codes_router.OwnerCodesService") as service_cls:
        service = service_cls.return_value
        service.list_all = AsyncMock(return_value=[code])
        service.participant_counts = AsyncMock(return_value={code.id: 2})
        service.users_of = AsyncMock(return_value={})
        async with owner as client:
            response = await client.get("/admin/promo-codes?includeDeleted=true")

    assert response.status_code == 200
    service.list_all.assert_awaited_once_with(include_deleted=True)
    [row] = response.json()
    assert row["code"] == "LETO2026" and row["status"] == "ACTIVE"
    assert row["participantsCount"] == 2 and row["assignedUser"] is None
    assert row["endsAt"] is None


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (PromoCodeTakenError(), 409, "promo_code_taken"),
        (PromoCodeInvalidError(), 422, "promo_code_invalid"),
        (PromoCodeUserNotFoundError(), 422, "promo_code_user_not_found"),
        (PromotionNotFoundError(), 404, "promo_code_not_found"),
        (PromotionEndsBeforeStartError(), 422, "promotion_ends_before_start"),
        (PromotionInvalidRulesError(), 409, "promotion_invalid_rules"),
    ],
)
async def test_write_refusals_are_codes(
    owner: AsyncClient, error: Exception, status: int, code: str
) -> None:
    with patch("app.promotions.owner_codes_router.OwnerCodesService") as service_cls:
        service_cls.return_value.create = AsyncMock(side_effect=error)
        service_cls.return_value.update = AsyncMock(side_effect=error)
        async with owner as client:
            created = await client.post("/admin/promo-codes", json=BODY)
            updated = await client.put(f"/admin/promo-codes/{uuid.uuid4()}", json=BODY)

    for response in (created, updated):
        assert response.status_code == status
        assert response.json()["detail"] == code


async def test_a_promo_code_reward_is_a_422(owner: AsyncClient) -> None:
    body = {
        **BODY,
        "rewards": [{"type": "PROMO_CODE", "validDays": 5, "conditions": [], "rewards": []}],
    }
    async with owner as client:
        response = await client.post("/admin/promo-codes", json=body)

    assert response.status_code == 422
