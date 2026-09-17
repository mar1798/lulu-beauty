import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """`created_at`/`updated_at`, both filled by the database.

    `eager_defaults` is what makes that safe to read. `onupdate=func.now()` is a SQL
    expression, so the new value exists only inside the UPDATE the flush emits: without
    this, SQLAlchemy leaves `updated_at` expired afterwards and the next read of it goes
    back to the database on its own. In an async session that read happens outside the
    greenlet, which is not a slow path but a `MissingGreenlet` — a 500 out of every
    endpoint that serializes a row it has just changed (see `product_response`). With
    `eager_defaults`, the flush adds RETURNING to the same statement and the attribute
    comes back populated, at no extra round trip.
    """

    __mapper_args__: dict[str, Any] = {"eager_defaults": True}

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
