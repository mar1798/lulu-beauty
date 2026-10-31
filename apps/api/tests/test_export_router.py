import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.auth import token_service
from app.auth.dependencies import CurrentUser, require_admin
from app.auth.models import Role
from app.checklist.models import ChecklistExtra
from app.db import get_session
from app.export.service import OrderExportRow
from app.main import app
from app.orders.models import OrderStatus

ADMIN_ID = uuid.uuid4()


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    # Nothing here reaches the database: the export services and the role lookup are
    # patched out in every test that would touch it.
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[require_admin] = lambda: CurrentUser(id=ADMIN_ID, role=Role.ADMIN)
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


async def test_an_orders_link_downloads_the_filtered_sheet_without_a_session(
    client: AsyncClient,
) -> None:
    cycle_id = uuid.uuid4()

    with (
        patch("app.export.router.load_admin", AsyncMock()) as load_admin,
        patch("app.export.router.ExportService") as service_cls,
    ):
        service_cls.return_value.export_orders = AsyncMock(return_value=(b"xlsx", "sheet.xlsx"))
        async with client as c:
            link = await c.post(
                "/admin/export/links",
                json={
                    "kind": "orders",
                    "cycleId": str(cycle_id),
                    "status": "CONFIRMED",
                    "includePrices": False,
                },
            )
            app.dependency_overrides.pop(require_admin)
            response = await c.get(f"/export/download/{link.json()['token']}")

    assert link.status_code == 200
    assert response.status_code == 200
    assert response.content == b"xlsx"
    assert response.headers["cache-control"] == "no-store"
    assert "sheet.xlsx" in response.headers["content-disposition"]
    load_admin.assert_awaited_once()
    assert load_admin.await_args is not None
    assert load_admin.await_args.args[0] == ADMIN_ID
    service_cls.return_value.export_orders.assert_awaited_once_with(
        cycle_id, OrderStatus.CONFIRMED, include_prices=False
    )


async def test_a_catalog_link_downloads_the_catalog(client: AsyncClient) -> None:
    token = token_service.create_download_token(ADMIN_ID, "products", {})

    with (
        patch("app.export.router.load_admin", AsyncMock()),
        patch("app.export.router.CatalogExportService") as service_cls,
    ):
        service_cls.return_value.export_products = AsyncMock(return_value=(b"cat", "cat.xlsx"))
        async with client as c:
            response = await c.get(f"/export/download/{token}")

    assert response.status_code == 200
    assert response.content == b"cat"


async def test_a_link_of_a_demoted_account_downloads_nothing(client: AsyncClient) -> None:
    """The role is read again at download time, not trusted from when the link was made."""
    token = token_service.create_download_token(ADMIN_ID, "products", {})
    refused = AsyncMock(side_effect=HTTPException(403, "admin_only"))

    with (
        patch("app.export.router.load_admin", refused),
        patch("app.export.router.CatalogExportService") as service_cls,
    ):
        async with client as c:
            response = await c.get(f"/export/download/{token}")

    assert response.status_code == 403
    service_cls.assert_not_called()


@pytest.mark.parametrize(
    "token",
    [
        "not-a-token",
        token_service.create_access_token(ADMIN_ID, Role.ADMIN),
        token_service.create_download_token(ADMIN_ID, "everything", {}),
    ],
)
async def test_anything_but_a_valid_download_link_is_refused(
    client: AsyncClient, token: str
) -> None:
    async with client as c:
        response = await c.get(f"/export/download/{token}")

    assert response.status_code == 401
    assert response.json()["detail"] == "export_link_invalid"


def _cycle(label: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(), label=label, deadline_at=datetime(2030, 6, 1, tzinfo=UTC)
    )


async def test_the_checklist_shows_the_open_cycle(client: AsyncClient) -> None:
    active = _cycle("Июнь")
    row = OrderExportRow(
        product_name="Крем",
        volume_ml=50,
        brand="Lulu",
        quantity=3,
        unit_price_cents=15000,
        product_slug="krem",
    )
    extra = ChecklistExtra(name="Пакеты", quantity=10, unit_price_cents=0)
    extra.id = uuid.uuid4()

    with (
        patch("app.export.router.CyclesService") as cycles_cls,
        patch("app.export.router.ExportService") as service_cls,
        patch("app.export.router.ChecklistExtrasService") as extras_cls,
    ):
        cycles_cls.return_value.get_active_cycle = AsyncMock(return_value=active)
        extras_cls.return_value.list = AsyncMock(return_value=[extra])
        cycles_cls.return_value.get_latest_closed_cycle = AsyncMock()
        service_cls.return_value.checklist_rows = AsyncMock(return_value=[row])
        async with client as c:
            response = await c.get("/admin/checklist")

    assert response.status_code == 200
    body = response.json()
    assert body["cycle"]["id"] == str(active.id)
    assert body["cycle"]["isActive"] is True
    assert body["items"] == [
        {
            "productName": "Крем",
            "productSlug": "krem",
            "volumeMl": 50,
            "shade": None,
            "brand": "Lulu",
            "quantity": 3,
            "unitPriceCents": 15000,
            "extraId": None,
        },
        # The owner's own line, after the orders' ones.
        {
            "productName": "Пакеты",
            "productSlug": None,
            "volumeMl": None,
            "shade": None,
            "brand": "-",
            "quantity": 10,
            "unitPriceCents": 0,
            "extraId": str(extra.id),
        },
    ]
    extras_cls.return_value.list.assert_awaited_once_with(active.id)
    cycles_cls.return_value.get_latest_closed_cycle.assert_not_awaited()
    service_cls.return_value.checklist_rows.assert_awaited_once_with(active.id)


async def test_without_an_open_cycle_the_checklist_falls_back_to_the_last_closed_one(
    client: AsyncClient,
) -> None:
    closed = _cycle("Май")

    with (
        patch("app.export.router.CyclesService") as cycles_cls,
        patch("app.export.router.ExportService") as service_cls,
        patch("app.export.router.ChecklistExtrasService") as extras_cls,
    ):
        extras_cls.return_value.list = AsyncMock(return_value=[])
        cycles_cls.return_value.get_active_cycle = AsyncMock(return_value=None)
        cycles_cls.return_value.get_latest_closed_cycle = AsyncMock(return_value=closed)
        service_cls.return_value.checklist_rows = AsyncMock(return_value=[])
        async with client as c:
            response = await c.get("/admin/checklist")

    assert response.json()["cycle"]["isActive"] is False
    service_cls.return_value.checklist_rows.assert_awaited_once_with(closed.id)


async def test_a_shop_without_cycles_gets_an_empty_checklist(client: AsyncClient) -> None:
    with patch("app.export.router.CyclesService") as cycles_cls:
        cycles_cls.return_value.get_active_cycle = AsyncMock(return_value=None)
        cycles_cls.return_value.get_latest_closed_cycle = AsyncMock(return_value=None)
        async with client as c:
            response = await c.get("/admin/checklist")

    assert response.json() == {"cycle": None, "items": []}
