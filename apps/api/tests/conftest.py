import os

# Settings requires DATABASE_URL; set a placeholder before any test module imports
# app.config, so tests never depend on a real database being reachable.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
