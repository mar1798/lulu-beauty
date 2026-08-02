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
    assert "connection refused" in body["info"]["database"]["message"]
