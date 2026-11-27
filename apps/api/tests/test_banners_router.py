import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.banners.models import BannerKind, BannerState, NewsBanner
from app.banners.service import (
    BannerEndsBeforeStartError,
    BannerItem,
    BannerLinkInvalidError,
    BannerNotFoundError,
    BannerOrderMismatchError,
    TooManyNewsBannersError,
)
from app.db import get_session
from app.main import app
from app.promotions.service import PromotionNotFoundError

NOW = datetime.now(UTC)
BODY: dict[str, Any] = {"title": "Новый сбор открыт", "text": "Успейте", "linkUrl": "/catalog"}
ADMIN_PATHS: list[tuple[str, str]] = [
    ("GET", "/admin/banners"),
    ("PATCH", f"/admin/banners/promotions/{uuid.uuid4()}"),
    ("PUT", "/admin/banners/order"),
    ("POST", "/admin/banners/news"),
    ("GET", f"/admin/banners/news/{uuid.uuid4()}"),
    ("PUT", f"/admin/banners/news/{uuid.uuid4()}"),
    ("PATCH", f"/admin/banners/news/{uuid.uuid4()}/enabled"),
    ("DELETE", f"/admin/banners/news/{uuid.uuid4()}"),
    ("POST", f"/admin/banners/news/{uuid.uuid4()}/image?variant=mobile"),
    ("DELETE", f"/admin/banners/news/{uuid.uuid4()}/image?variant=mobile"),
]


def _client_as(role: Role) -> Callable[[], Iterator[AsyncClient]]:
    def fixture() -> Iterator[AsyncClient]:
        # `require_admin` reads the role from the database, not the token.
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
customer = pytest.fixture(_client_as(Role.CUSTOMER), name="customer")


def _news_item() -> BannerItem:
    news = NewsBanner(
        id=uuid.uuid4(),
        title="Новый сбор открыт",
        text=None,
        link_url="/catalog",
        cta_label=None,
        image_mobile_url=None,
        image_desktop_url=None,
        starts_at=None,
        ends_at=None,
        is_enabled=True,
        position=None,
        created_at=NOW,
        updated_at=NOW,
    )
    return BannerItem(
        kind=BannerKind.NEWS,
        state=BannerState.SHOWN,
        is_shown=True,
        position=None,
        created_at=NOW,
        news=news,
    )


@pytest.mark.parametrize(("method", "path"), ADMIN_PATHS)
async def test_anonymous_callers_are_turned_away(method: str, path: str) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, path)
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), ADMIN_PATHS)
async def test_a_customer_is_turned_away(customer: AsyncClient, method: str, path: str) -> None:
    async with customer as client:
        response = await client.request(method, path)
    assert response.status_code == 403
    assert response.json()["detail"] == "admin_only"


async def test_the_feed_is_public() -> None:
    session = AsyncMock()
    app.dependency_overrides[get_session] = lambda: session
    try:
        with patch("app.banners.router.BannersService") as service_cls:
            service_cls.return_value.feed = AsyncMock(return_value=[_news_item()])
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/banners")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    [slide] = response.json()
    assert slide["kind"] == "NEWS"
    assert slide["linkUrl"] == "/catalog"
    assert slide["promotionSlug"] is None
    assert slide["key"].startswith("news:")


@pytest.mark.parametrize(
    "body",
    [
        {**BODY, "title": ""},
        {**BODY, "title": "   "},
        {**BODY, "title": "x" * 121},
        {**BODY, "text": "x" * 301},
        {**BODY, "ctaLabel": "x" * 41},
        {**BODY, "linkUrl": "/" + "x" * 2048},
        {**BODY, "startsAt": "not a date"},
        {**BODY, "startsAt": "2026-01-01T00:00:00"},
    ],
)
async def test_a_bad_news_body_is_a_422(owner: AsyncClient, body: dict[str, Any]) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        async with owner as client:
            response = await client.post("/admin/banners/news", json=body)
    assert response.status_code == 422
    service_cls.return_value.create_news.assert_not_called()


async def test_blank_optional_texts_become_none(owner: AsyncClient) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        create = AsyncMock(side_effect=BannerLinkInvalidError())
        service_cls.return_value.create_news = create
        async with owner as client:
            await client.post(
                "/admin/banners/news",
                json={"title": " Сбор ", "text": "  ", "linkUrl": "", "ctaLabel": ""},
            )
    draft = create.await_args.args[0]
    assert (draft.title, draft.text, draft.link_url, draft.cta_label) == ("Сбор", None, None, None)


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (BannerLinkInvalidError(), 422, "banner_link_invalid"),
        (BannerEndsBeforeStartError(), 422, "banner_ends_before_start"),
        (TooManyNewsBannersError(), 409, "too_many_news_banners"),
    ],
)
async def test_create_refusals_are_codes(
    owner: AsyncClient, error: Exception, status: int, code: str
) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        service_cls.return_value.create_news = AsyncMock(side_effect=error)
        async with owner as client:
            response = await client.post("/admin/banners/news", json=BODY)
    assert response.status_code == status
    assert response.json()["detail"] == code


async def test_a_missing_news_item_is_a_404(admin: AsyncClient) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        service_cls.return_value.news_item = AsyncMock(side_effect=BannerNotFoundError())
        async with admin as client:
            response = await client.get(f"/admin/banners/news/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["detail"] == "banner_not_found"


async def test_a_missing_promotion_is_a_404(owner: AsyncClient) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        service_cls.return_value.set_promotion_shown = AsyncMock(
            side_effect=PromotionNotFoundError()
        )
        async with owner as client:
            response = await client.patch(
                f"/admin/banners/promotions/{uuid.uuid4()}", json={"isShown": False}
            )
    assert response.status_code == 404
    assert response.json()["detail"] == "promotion_not_found"


async def test_a_stale_order_is_a_conflict(owner: AsyncClient) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        service_cls.return_value.reorder = AsyncMock(side_effect=BannerOrderMismatchError())
        async with owner as client:
            response = await client.put(
                "/admin/banners/order", json={"keys": [f"news:{uuid.uuid4()}"]}
            )
    assert response.status_code == 409
    assert response.json()["detail"] == "banner_order_mismatch"


@pytest.mark.parametrize(
    "keys",
    [
        ["nonsense"],
        [f"banner:{uuid.uuid4()}"],
        [f"news:{uuid.uuid4()}"] * 2,
    ],
)
async def test_the_order_must_be_well_formed(owner: AsyncClient, keys: list[str]) -> None:
    async with owner as client:
        response = await client.put("/admin/banners/order", json={"keys": keys})
    assert response.status_code == 422


async def test_a_picture_must_be_an_image(owner: AsyncClient) -> None:
    with patch("app.banners.router.BannersService") as service_cls:
        async with owner as client:
            response = await client.post(
                f"/admin/banners/news/{uuid.uuid4()}/image?variant=mobile",
                files={"file": ("b.html", b"<html>", "text/html")},
            )
    assert response.status_code == 415
    assert response.json()["detail"] == "unsupported_image_type"
    service_cls.assert_not_called()


async def test_the_picture_variant_is_one_of_two(owner: AsyncClient) -> None:
    async with owner as client:
        response = await client.post(
            f"/admin/banners/news/{uuid.uuid4()}/image?variant=tablet",
            files={"file": ("b.png", b"x", "image/png")},
        )
    assert response.status_code == 422


async def test_replacing_a_picture_discards_the_old_file(owner: AsyncClient) -> None:
    item = _news_item()
    assert item.news is not None
    compressed = MagicMock(extension=".webp", content=b"webp")
    with (
        patch("app.banners.router.read_image", AsyncMock(return_value=compressed)),
        patch("app.banners.router.storage_service") as storage,
        patch("app.banners.router.discard_files", AsyncMock()) as discard,
        patch("app.banners.router.BannersService") as service_cls,
    ):
        storage.save = AsyncMock(return_value="new.webp")
        storage.url_for = lambda key: f"http://files/{key}"
        service = service_cls.return_value
        service.get_news = AsyncMock(return_value=item.news)
        service.set_news_image = AsyncMock(return_value=(item.news, "http://files/old.webp"))
        service.news_item = AsyncMock(return_value=item)
        async with owner as client:
            response = await client.post(
                f"/admin/banners/news/{item.news.id}/image?variant=desktop",
                files={"file": ("b.png", b"png", "image/png")},
            )

    assert response.status_code == 200
    args = service.set_news_image.await_args.args
    assert args[1].value == "desktop" and args[2] == "http://files/new.webp"
    discard.assert_awaited_once_with(["http://files/old.webp"])


async def test_deleting_news_discards_its_files(owner: AsyncClient) -> None:
    with (
        patch("app.banners.router.discard_files", AsyncMock()) as discard,
        patch("app.banners.router.BannersService") as service_cls,
    ):
        service_cls.return_value.delete_news = AsyncMock(return_value=["http://files/a.webp"])
        async with owner as client:
            response = await client.delete(f"/admin/banners/news/{uuid.uuid4()}")
    assert response.status_code == 204
    discard.assert_awaited_once_with(["http://files/a.webp"])


def test_a_window_in_the_past_is_still_a_valid_body() -> None:
    # The service, not the schema, decides what the window means; the schema only parses it.
    from app.banners.schemas import NewsBannerWriteRequest

    body = NewsBannerWriteRequest.model_validate(
        {"title": "x", "startsAt": (NOW - timedelta(days=2)).isoformat()}
    )
    assert body.starts_at is not None and body.ends_at is None
