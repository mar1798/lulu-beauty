"""Stored gift images stay readable after PUBLIC_FILES_BASE_URL changes - through the API.

The own-storage host check on a gift picture is a write-time rule. Every endpoint below
reads rules or snapshots saved under the old host, so none may re-run the check and 500.
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.cart.service import CartService
from app.config import settings
from app.db import get_session
from app.main import app
from app.orders.models import OrderStatus
from app.orders.service import OrdersService
from app.promotions.codes import PromoCodesService
from app.promotions.models import PromoCode
from tests.integration.factories import make_cycle, make_product, make_user, variant_id

NEW_BASE = "https://new-domain.example/files"


def _gift(image_url: str) -> dict[str, Any]:
    return {"type": "GIFT", "gift": "CUSTOM", "title": "Бокс", "imageUrl": image_url}


def _body(image_url: str) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "slug": "gift-promo",
        "title": "Подарок",
        "startsAt": (now - timedelta(hours=1)).isoformat(),
        "endsAt": (now + timedelta(days=3)).isoformat(),
        "rewards": [
            _gift(image_url),
            {
                "type": "PROMO_CODE",
                "validDays": 30,
                "rewards": [_gift(image_url)],
            },
        ],
    }


@pytest.fixture
async def http(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = session
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _as(user_id: uuid.UUID, role: Role) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, role=role)


async def test_stored_gift_images_are_readable_after_the_base_url_changes(
    db_session: AsyncSession, http: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = db_session
    await make_cycle(session)
    product = await make_product(session, price_cents=10_000, in_stock=True)
    owner = await make_user(session, role=Role.SUPER_ADMIN)
    owner_id = owner.id
    pending_buyer = await make_user(session)
    paid_buyer = await make_user(session)
    old_image = f"{settings.public_files_base_url}/box.webp"

    async with http as client:
        _as(owner_id, Role.SUPER_ADMIN)
        created = await client.post("/admin/promotions", json=_body(old_image))
        assert created.status_code == 201, created.text
        promotion_id = created.json()["id"]

        pending_buyer_id, paid_buyer_id, product_variant = (
            pending_buyer.id,
            paid_buyer.id,
            variant_id(product),
        )
        order_ids: list[uuid.UUID] = []
        for buyer_id in (pending_buyer_id, paid_buyer_id):
            await CartService(session).add_item(buyer_id, product_variant, 1)
            order = await OrdersService(session).checkout(buyer_id, note=None)
            assert order.gifts, "the order should hold the gift"
            order_ids.append(order.id)
            await session.commit()
        pending_id, paid_id = order_ids
        service = OrdersService(session)
        await service.update_status(paid_id, OrderStatus.AWAITING_PAYMENT)
        await service.update_status(paid_id, OrderStatus.CONFIRMED)
        await session.execute(delete(PromoCode))  # the code event "failed"
        await session.commit()

        monkeypatch.setattr(settings, "public_files_base_url", NEW_BASE)

        _as(pending_buyer_id, Role.CUSTOMER)
        public = await client.get("/promotions")
        assert public.status_code == 200, public.text
        assert (await client.get("/promotions/gift-promo")).status_code == 200

        _as(owner_id, Role.SUPER_ADMIN)
        assert (await client.get("/admin/promotions")).status_code == 200
        assert (await client.get(f"/admin/promotions/{promotion_id}")).status_code == 200
        participants = await client.get(f"/admin/promotions/{promotion_id}/participants")
        assert participants.status_code == 200, participants.text
        assert len(participants.json()["items"]) == 2

        _as(pending_buyer_id, Role.CUSTOMER)
        mine = await client.get(f"/orders/{pending_id}")
        assert mine.status_code == 200, mine.text
        revision = mine.json()["revision"]
        item_id = mine.json()["items"][0]["id"]
        preview = await client.post(
            f"/orders/{pending_id}/edit-preview",
            json={"revision": revision, "itemId": item_id, "quantity": 2},
        )
        assert preview.status_code == 200, preview.text
        edited = await client.patch(
            f"/orders/{pending_id}/items/{item_id}",
            json={"revision": revision, "quantity": 2},
        )
        assert edited.status_code == 200, edited.text

        # The sweep's path: the paid order's missing code is issued from the snapshot.
        issued = await PromoCodesService(session).issue_missing()
        assert len(issued) == 1

        # Writing is different: resubmitting the old host is refused (intended).
        _as(owner_id, Role.SUPER_ADMIN)
        rewrite = await client.put(f"/admin/promotions/{promotion_id}", json=_body(old_image))
        assert rewrite.status_code == 422
