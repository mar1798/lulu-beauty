"""Promo codes at the HTTP edge: the check, checkout's refusals, the customer's list."""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.dependencies import CurrentUser, get_current_user, require_live_user
from app.auth.models import Role
from app.db import get_session
from app.main import app
from app.promotions.code_errors import (
    PromoCodeAlreadyUsedError,
    PromoCodeConditionsNotMetError,
    PromoCodeError,
    PromoCodeExpiredError,
    PromoCodeNotFoundError,
    PromoCodeNotYetValidError,
)
from app.promotions.codes import (
    CODE_ALPHABET,
    CODE_LENGTH,
    PromoCodeView,
    code_status,
    generate_code,
    normalize_code,
)
from app.promotions.models import PromoCode, PromoCodeStatus

NOW = datetime.now(UTC)


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    user = CurrentUser(id=uuid.uuid4(), role=Role.CUSTOMER)
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_live_user] = lambda: user
    try:
        yield AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    finally:
        app.dependency_overrides.clear()


def _code(**overrides: object) -> PromoCode:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "code": "ABCD2345",
        "user_id": uuid.uuid4(),
        "promotion_id": uuid.uuid4(),
        "source_order_id": uuid.uuid4(),
        "conditions": [],
        "rewards": [{"type": "DISCOUNT", "kind": "PERCENT", "value": 10}],
        "valid_from": NOW - timedelta(days=1),
        "expires_at": NOW + timedelta(days=1),
        "status": PromoCodeStatus.ACTIVE,
        "used_order_id": None,
        "created_at": NOW,
    }
    values.update(overrides)
    return PromoCode(**values)


# --- Pure helpers -----------------------------------------------------------------------


def test_generated_codes_use_the_unambiguous_alphabet() -> None:
    codes = {generate_code() for _ in range(200)}
    assert all(len(code) == CODE_LENGTH and set(code) <= set(CODE_ALPHABET) for code in codes)
    assert not set(CODE_ALPHABET) & set("0O1I")
    assert len(codes) > 190


def test_a_typed_code_is_normalised() -> None:
    assert normalize_code(" abcd-2345 ") == "ABCD2345"
    assert normalize_code("ab cd\t2345") == "ABCD2345"


def test_expiry_is_derived_for_an_unused_code_only() -> None:
    expired = {"valid_from": NOW - timedelta(days=3), "expires_at": NOW - timedelta(days=1)}
    assert code_status(_code(), NOW) is PromoCodeView.ACTIVE
    assert code_status(_code(**expired), NOW) is PromoCodeView.EXPIRED
    # A code an order already took does not turn "expired" under it.
    assert code_status(_code(status=PromoCodeStatus.USED, **expired), NOW) is PromoCodeView.USED
    assert (
        code_status(_code(status=PromoCodeStatus.RESERVED, **expired), NOW)
        is PromoCodeView.RESERVED
    )
    assert code_status(_code(status=PromoCodeStatus.REVOKED), NOW) is PromoCodeView.REVOKED


# --- Endpoints --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("error", "status_code", "detail"),
    [
        (PromoCodeNotFoundError, 404, "promo_code_not_found"),
        (PromoCodeExpiredError, 409, "promo_code_expired"),
        (PromoCodeNotYetValidError, 409, "promo_code_not_yet_valid"),
        (PromoCodeAlreadyUsedError, 409, "promo_code_already_used"),
        (PromoCodeConditionsNotMetError, 409, "promo_code_conditions_not_met"),
    ],
)
async def test_the_check_maps_every_refusal(
    client: AsyncClient, error: type[PromoCodeError], status_code: int, detail: str
) -> None:
    with patch("app.cart.router.CartService") as service_cls:
        service_cls.return_value.check_promo_code = AsyncMock(side_effect=error)
        async with client as c:
            response = await c.post("/cart/promo-code/check", json={"code": "ABCD2345"})

    assert response.status_code == status_code
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize("error", [PromoCodeNotFoundError, PromoCodeExpiredError])
async def test_checkout_maps_a_refused_code(
    client: AsyncClient, error: type[PromoCodeError]
) -> None:
    with patch("app.orders.router.OrdersService") as service_cls:
        service_cls.return_value.checkout = AsyncMock(side_effect=error)
        async with client as c:
            response = await c.post("/orders/checkout", json={"promoCode": "ABCD2345"})

    assert response.status_code == error.status_code
    assert response.json() == {"detail": error.code}


async def test_checkout_passes_the_code_on(client: AsyncClient) -> None:
    with patch("app.orders.router.OrdersService") as service_cls:
        service_cls.return_value.checkout = AsyncMock(side_effect=PromoCodeNotFoundError)
        async with client as c:
            await c.post("/orders/checkout", json={"note": "n", "promoCode": "abcd"})

    assert service_cls.return_value.checkout.await_args.args[1:] == ("n", "abcd")


async def test_the_check_refuses_an_absurdly_long_code(client: AsyncClient) -> None:
    async with client as c:
        response = await c.post("/cart/promo-code/check", json={"code": "A" * 65})
    assert response.status_code == 422


async def test_the_check_needs_a_signed_in_customer() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        response = await c.post("/cart/promo-code/check", json={"code": "ABCD2345"})
    assert response.status_code == 401


async def test_my_promo_codes(client: AsyncClient) -> None:
    code = _code()
    with patch("app.promotions.codes_router.PromoCodesService") as service_cls:
        service_cls.return_value.list_for_user = AsyncMock(return_value=[(code, "Акция")])
        async with client as c:
            response = await c.get("/me/promo-codes")

    assert response.status_code == 200
    [body] = response.json()
    assert body["code"] == "ABCD2345" and body["status"] == "ACTIVE"
    assert body["promotionTitle"] == "Акция"
    assert body["rewards"][0]["type"] == "DISCOUNT" and body["conditions"] == []
    assert "expiresAt" in body and "validFrom" in body


async def test_my_promo_codes_needs_a_signed_in_customer() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        response = await c.get("/me/promo-codes")
    assert response.status_code == 401
