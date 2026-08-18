from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


class _FakeConnect:
    """Stands in for engine.connect(): an async context manager over a connection."""

    def __init__(self, connection: AsyncMock | None = None, error: Exception | None = None) -> None:
        self._connection = connection
        self._error = error

    async def __aenter__(self) -> AsyncMock:
        if self._error is not None:
            raise self._error
        assert self._connection is not None
        return self._connection

    async def __aexit__(self, *exc_info: object) -> None:
        return None


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_health_reports_up_when_database_responds(client: AsyncClient) -> None:
    connection = AsyncMock()
    fake_engine = MagicMock(connect=MagicMock(return_value=_FakeConnect(connection=connection)))
    with patch("app.health.router.engine", fake_engine):
        async with client as c:
            response = await c.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "info": {"database": {"status": "up"}}}


async def test_health_reports_down_when_database_unreachable(client: AsyncClient) -> None:
    error = ConnectionError("connection refused")
    fake_engine = MagicMock(connect=MagicMock(return_value=_FakeConnect(error=error)))
    with patch("app.health.router.engine", fake_engine):
        async with client as c:
            response = await c.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["info"]["database"]["status"] == "down"
    # The endpoint is unauthenticated, so the driver's own text — which spells out the
    # database host, port and user — stays in the logs rather than in the response.
    assert "connection refused" not in body["info"]["database"]["message"]


def test_the_rate_limiter_is_mounted_on_the_real_app() -> None:
    """The unit tests build their own app, so nothing else would notice `create_app()`
    losing the middleware."""
    from app.common.rate_limit import RateLimitMiddleware
    from app.main import create_app

    assert any(
        middleware.cls is RateLimitMiddleware for middleware in create_app().user_middleware
    )
