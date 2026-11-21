import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.promotions.models import Promotion
from app.promotions.service import (
    PromotionCodeWindowPastError,
    PromotionEndsBeforeStartError,
    PromotionInvalidRulesError,
    PromotionNotFoundError,
    PromotionSlugTakenError,
)

NOW = datetime.now(UTC)
BODY: dict[str, Any] = {
    "slug": "black-friday",
    "title": "Чёрная пятница",
    "startsAt": NOW.isoformat(),
    "endsAt": (NOW + timedelta(days=3)).isoformat(),
    "rewards": [{"type": "GIFT", "gift": "CUSTOM"}],
}


def _client_as(role: Role) -> Callable[[], Iterator[AsyncClient]]:
    def fixture() -> Iterator[AsyncClient]:
        # `require_super_admin` reads the role from the database, not the token.
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


def _promotion() -> Promotion:
    return Promotion(
        id=uuid.uuid4(),
        slug="black-friday",
        title="Чёрная пятница",
        description_html=None,
        banner_mobile_url=None,
        banner_desktop_url=None,
        starts_at=NOW - timedelta(days=1),
        ends_at=NOW + timedelta(days=1),
        is_enabled=True,
        announce=False,
        announced_at=None,
        sort_order=0,
        conditions=[],
        rewards=[{"type": "GIFT", "gift": "CUSTOM", "title": "Mystery box", "quantity": 1}],
        deleted_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


async def test_an_admin_is_not_the_owner(admin: AsyncClient) -> None:
    async with admin as client:
        response = await client.get("/admin/promotions")
    assert response.status_code == 403
    assert response.json()["detail"] == "super_admin_only"


async def test_list_derives_status_and_counts(owner: AsyncClient) -> None:
    promotion = _promotion()
    with patch("app.promotions.router.PromotionsService") as service_cls:
        service = service_cls.return_value
        service.list_all = AsyncMock(return_value=[promotion])
        service.participant_counts = AsyncMock(return_value={promotion.id: 3})
        async with owner as client:
            response = await client.get("/admin/promotions?includeDeleted=true")

    assert response.status_code == 200
    service.list_all.assert_awaited_once_with(include_deleted=True)
    [row] = response.json()
    assert row["status"] == "ACTIVE"
    assert row["participantsCount"] == 3
    assert row["rewards"][0]["title"] == "Mystery box"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (PromotionSlugTakenError(), 409, "promotion_slug_taken"),
        (PromotionEndsBeforeStartError(), 422, "promotion_ends_before_start"),
        (PromotionInvalidRulesError(), 409, "promotion_invalid_rules"),
        (PromotionCodeWindowPastError(), 422, "promotion_code_window_past"),
    ],
)
async def test_create_refusals_are_codes(
    owner: AsyncClient, error: Exception, status: int, code: str
) -> None:
    with patch("app.promotions.router.PromotionsService") as service_cls:
        service_cls.return_value.create = AsyncMock(side_effect=error)
        async with owner as client:
            response = await client.post("/admin/promotions", json=BODY)

    assert response.status_code == status
    assert response.json()["detail"] == code


@pytest.mark.parametrize("ends_at", [None, "omitted"])
async def test_an_end_date_is_optional(owner: AsyncClient, ends_at: str | None) -> None:
    body = {key: value for key, value in BODY.items() if key != "endsAt"}
    if ends_at is None:
        body["endsAt"] = None
    with patch("app.promotions.router.PromotionsService") as service_cls:
        create = AsyncMock(side_effect=PromotionSlugTakenError())
        service_cls.return_value.create = create
        async with owner as client:
            response = await client.post("/admin/promotions", json=body)

    # Past validation and into the service, with the end left open.
    assert response.status_code == 409
    assert create.await_args is not None
    assert create.await_args.args[0].ends_at is None


async def test_banner_variant_is_one_of_two(owner: AsyncClient) -> None:
    async with owner as client:
        response = await client.post(
            f"/admin/promotions/{uuid.uuid4()}/banner?variant=tablet",
            files={"file": ("b.png", b"x", "image/png")},
        )
    assert response.status_code == 422


async def test_banner_must_be_an_image(owner: AsyncClient) -> None:
    with patch("app.promotions.router.PromotionsService") as service_cls:
        async with owner as client:
            response = await client.post(
                f"/admin/promotions/{uuid.uuid4()}/banner?variant=mobile",
                files={"file": ("b.html", b"<html>", "text/html")},
            )
    assert response.status_code == 415
    assert response.json()["detail"] == "unsupported_image_type"
    service_cls.assert_not_called()


async def test_replacing_a_banner_discards_the_old_file(owner: AsyncClient) -> None:
    promotion = _promotion()
    compressed = MagicMock(extension=".webp", content=b"webp")
    with (
        patch("app.promotions.router.read_image", AsyncMock(return_value=compressed)),
        patch("app.promotions.router.storage_service") as storage,
        patch("app.promotions.router.discard_files", AsyncMock()) as discard,
        patch("app.promotions.router.PromotionsService") as service_cls,
    ):
        storage.save = AsyncMock(return_value="new.webp")
        storage.url_for = lambda key: f"http://files/{key}"
        service = service_cls.return_value
        service.get = AsyncMock(return_value=promotion)
        service.set_banner = AsyncMock(return_value=(promotion, "http://files/old.webp"))
        service.participant_counts = AsyncMock(return_value={})
        async with owner as client:
            response = await client.post(
                f"/admin/promotions/{promotion.id}/banner?variant=desktop",
                files={"file": ("b.png", b"png", "image/png")},
            )

    assert response.status_code == 200
    args = service.set_banner.await_args.args
    assert args[1].value == "desktop" and args[2] == "http://files/new.webp"
    discard.assert_awaited_once_with(["http://files/old.webp"])


async def test_gift_image_must_be_an_image(owner: AsyncClient) -> None:
    async with owner as client:
        response = await client.post(
            "/admin/promotions/gift-image",
            files={"file": ("g.html", b"<html>", "text/html")},
        )
    assert response.status_code == 415
    assert response.json()["detail"] == "unsupported_image_type"


async def test_gift_image_returns_the_storage_address(owner: AsyncClient) -> None:
    compressed = MagicMock(extension=".webp", content=b"webp")
    with (
        patch("app.promotions.router.read_image", AsyncMock(return_value=compressed)),
        patch("app.promotions.router.storage_service") as storage,
    ):
        storage.save = AsyncMock(return_value="gift.webp")
        storage.url_for = lambda key: f"http://files/{key}"
        async with owner as client:
            response = await client.post(
                "/admin/promotions/gift-image",
                files={"file": ("g.png", b"png", "image/png")},
            )

    assert response.status_code == 200
    assert response.json() == {"url": "http://files/gift.webp"}
    assert storage.save.await_args.args[0] == "gift.webp"


async def test_gift_image_is_for_the_owner_only() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/admin/promotions/gift-image", files={"file": ("g.png", b"png", "image/png")}
        )
    assert response.status_code == 401


async def test_public_list_is_open_and_trimmed() -> None:
    promotion = _promotion()
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session
    try:
        with patch("app.promotions.router.PromotionsService") as service_cls:
            service_cls.return_value.list_active = AsyncMock(return_value=[promotion])
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/promotions")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    [item] = response.json()
    assert item["slug"] == "black-friday"
    assert item["rewards"][0]["type"] == "GIFT"
    assert not {"isEnabled", "participantsCount", "announce", "deletedAt"} & item.keys()


async def test_public_promotion_not_running_is_404() -> None:
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session
    try:
        with patch("app.promotions.router.PromotionsService") as service_cls:
            service_cls.return_value.get_active = AsyncMock(side_effect=PromotionNotFoundError())
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/promotions/old")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "promotion_not_found"
