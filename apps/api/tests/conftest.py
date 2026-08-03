import os

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
