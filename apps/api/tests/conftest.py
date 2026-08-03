import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Settings requires these fields; set placeholders before any test module imports
# app.config, so tests never depend on a real database being reachable or a real .env file.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("JWT_ACCESS_SECRET", "test-access-secret-at-least-32-bytes-long")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-at-least-32-bytes-long")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-telegram-token")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "test_bot")
os.environ.setdefault("OWNER_PHONE", "+10000000000")
os.environ.setdefault("OWNER_NAME", "Test Owner")
os.environ.setdefault("OWNER_PASSWORD", "test-owner-password")

import app.models  # noqa: E402, F401 - populates Base.metadata for TRUNCATE below
from app.db import Base, async_session, engine  # noqa: E402 - must follow the env setup above


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Most of this suite is DB-free by design (see PLAN.md); the DB-integration tests

    under tests/integration/ additionally need a real Postgres reachable at DATABASE_URL
    (provided by the `postgres` service in .github/workflows/api.yml). Locally, without
    that service running, they skip instead of failing.

    Disposes the engine's connection pool at the start of every test: pytest-asyncio gives
    each test its own event loop, but asyncpg connections are bound to the loop they were
    opened on, so a pooled connection from a previous test's loop would otherwise raise
    "another operation is in progress" the moment this test tries to use it.
    """
    await engine.dispose()
    try:
        async with engine.begin() as connection:
            table_names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
            await connection.execute(
                text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE")
            )
    except Exception:
        pytest.skip("Postgres not reachable at DATABASE_URL; skipping DB-integration test")

    async with async_session() as session:
        yield session
