# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime
ENV PATH="/app/.venv/bin:$PATH"
WORKDIR /app
RUN addgroup --system apigrp && adduser --system --ingroup apigrp --no-create-home apiusr
COPY --from=builder --chown=apiusr:apigrp /app /app
# The upload directory has to exist in the image, owned by the user that writes to it.
# docker-compose mounts a named volume at /app/uploads: Docker seeds such a volume from
# whatever the image has at that path, and creates the mount point as root:root when the
# image has nothing there. On a clean checkout (CI, a new machine, production) apps/api/
# uploads/ is git-ignored and so absent from the build context — the API came up fine and
# then failed every product photo upload with PermissionError.
RUN mkdir -p /app/uploads && chown apiusr:apigrp /app/uploads
USER apiusr
EXPOSE 3001
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3001}"]
