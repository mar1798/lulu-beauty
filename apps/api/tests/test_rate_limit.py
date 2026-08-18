"""Per-caller HTTP budgets.

The point of the identity rules is tested as hard as the counting: the API sits behind
the website's proxy, so keying on the peer address alone would let one impatient customer
throttle the whole shop.
"""

import time
import uuid
from collections.abc import Iterator

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import token_service
from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.models import Role
from app.common import rate_limit
from app.common.rate_limit import RateLimitMiddleware
from app.config import settings


@pytest.fixture
def limits() -> Iterator[None]:
    """Budgets small enough to exhaust in a test, restored afterwards."""
    original = (
        settings.rate_limit_enabled,
        settings.rate_limit_per_minute,
        settings.rate_limit_auth_per_minute,
        settings.rate_limit_trust_forwarded_for,
    )
    settings.rate_limit_enabled = True
    settings.rate_limit_per_minute = 3
    settings.rate_limit_auth_per_minute = 2
    settings.rate_limit_trust_forwarded_for = True
    yield
    (
        settings.rate_limit_enabled,
        settings.rate_limit_per_minute,
        settings.rate_limit_auth_per_minute,
        settings.rate_limit_trust_forwarded_for,
    ) = original


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.get("/products")
    async def products() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/auth/telegram/session")
    async def session() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/me")
    async def me(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
        return {"id": str(current_user.id)}

    return TestClient(app)


def _token() -> str:
    return token_service.create_access_token(uuid.uuid4(), Role.CUSTOMER)


def test_a_burst_is_allowed_and_then_refused(limits: None) -> None:
    client = _client()

    assert [client.get("/products").status_code for _ in range(3)] == [200, 200, 200]

    refused = client.get("/products")
    assert refused.status_code == 429
    assert refused.json() == {"detail": "rate_limited"}
    assert refused.headers["retry-after"] == "60"


def test_the_anonymous_sign_in_surface_has_its_own_stricter_budget(limits: None) -> None:
    """`POST /auth/telegram/session` writes a row and asks nothing of the caller — it is
    the reason this middleware exists."""
    client = _client()

    assert client.post("/auth/telegram/session").status_code == 200
    assert client.post("/auth/telegram/session").status_code == 200
    assert client.post("/auth/telegram/session").status_code == 429

    # Its own bucket: exhausting the strict one leaves the general budget alone.
    assert client.get("/products").status_code == 200


def test_health_is_never_throttled(limits: None) -> None:
    """It is polled by the container probe, where a 429 reads as the API being down."""
    client = _client()

    assert [client.get("/health").status_code for _ in range(10)] == [200] * 10


def test_two_visitors_behind_one_proxy_do_not_share_a_budget(limits: None) -> None:
    """The whole reason the peer address is not the key: behind the website's proxy it is
    the same address for everybody."""
    client = _client()

    for _ in range(3):
        assert client.get("/products", headers={"x-forwarded-for": "10.0.0.1"}).status_code == 200
    assert client.get("/products", headers={"x-forwarded-for": "10.0.0.1"}).status_code == 429

    assert client.get("/products", headers={"x-forwarded-for": "10.0.0.2"}).status_code == 200


def test_a_forwarded_chain_is_charged_to_its_left_most_entry(limits: None) -> None:
    client = _client()
    chain = "10.0.0.7, 172.16.0.1, 172.16.0.2"

    for _ in range(3):
        assert client.get("/products", headers={"x-forwarded-for": chain}).status_code == 200

    assert client.get("/products", headers={"x-forwarded-for": "10.0.0.7"}).status_code == 429


def test_the_forwarded_header_is_ignored_when_it_is_not_trusted(limits: None) -> None:
    """Reachable directly, the header is attacker-chosen — an unlimited supply of identities."""
    settings.rate_limit_trust_forwarded_for = False
    client = _client()

    for index in range(3):
        response = client.get("/products", headers={"x-forwarded-for": f"10.0.0.{index}"})
        assert response.status_code == 200

    assert client.get("/products", headers={"x-forwarded-for": "10.0.0.99"}).status_code == 429


def test_authenticated_callers_are_charged_to_their_own_account(limits: None) -> None:
    """Signed, so a customer can neither spend somebody else's budget nor escape their own
    by rotating an address."""
    client = _client()
    one = {"authorization": f"Bearer {_token()}", "x-forwarded-for": "10.0.0.1"}
    two = {"authorization": f"Bearer {_token()}", "x-forwarded-for": "10.0.0.1"}

    for _ in range(3):
        assert client.get("/me", headers=one).status_code == 200
    assert client.get("/me", headers=one).status_code == 429

    assert client.get("/me", headers=two).status_code == 200


def test_the_same_account_cannot_escape_its_budget_by_changing_address(limits: None) -> None:
    client = _client()
    token = _token()

    for index in range(3):
        headers = {"authorization": f"Bearer {token}", "x-forwarded-for": f"10.0.0.{index}"}
        assert client.get("/me", headers=headers).status_code == 200

    headers = {"authorization": f"Bearer {token}", "x-forwarded-for": "10.0.0.99"}
    assert client.get("/me", headers=headers).status_code == 429


def test_an_unparseable_token_falls_back_to_the_address(limits: None) -> None:
    """Those requests are about to be refused as 401s anyway, and bounding the attempts is
    exactly what the limit is for."""
    client = _client()
    headers = {"authorization": "Bearer not-a-token", "x-forwarded-for": "10.0.0.5"}

    for _ in range(3):
        assert client.get("/me", headers=headers).status_code == 401
    assert client.get("/me", headers=headers).status_code == 429


def test_the_bucket_refills(limits: None) -> None:
    client = _client()
    for _ in range(3):
        client.get("/products")
    assert client.get("/products").status_code == 429

    # 3/minute refills one token in 20s; the clock is monotonic, so it is moved rather
    # than waited on.
    real = time.monotonic
    try:
        time.monotonic = lambda: real() + 25  # type: ignore[assignment]
        assert client.get("/products").status_code == 200
    finally:
        time.monotonic = real


def test_nothing_is_throttled_while_the_limiter_is_off(limits: None) -> None:
    settings.rate_limit_enabled = False
    client = _client()

    assert [client.get("/products").status_code for _ in range(10)] == [200] * 10


def test_idle_buckets_are_pruned(limits: None) -> None:
    """Keyed by caller, which is unbounded input from outside."""
    rule = rate_limit._Rule(per_minute=5)
    now = time.monotonic()
    for index in range(rate_limit.PRUNE_AT):
        rule.allows(f"ip:10.0.{index // 256}.{index % 256}", now)

    assert len(rule.buckets) == rate_limit.PRUNE_AT

    rule.allows("ip:fresh", now + rate_limit.IDLE_TTL_SECONDS + 1)

    assert len(rule.buckets) == 1
