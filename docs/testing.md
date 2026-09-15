# Testing

Three suites, none of which covers another.

| Package            | Runner                   | Command                                                        |
| ------------------ | ------------------------ | -------------------------------------------------------------- |
| `packages/widgets` | vitest + Testing Library | `npm test -w widgets` (or `npm test` from the root, via turbo) |
| `apps/api`         | pytest + pytest-asyncio  | `uv run pytest` from `apps/api`                                |
| `apps/website`     | _(no test suite)_        | covered by `npm run check` — types + lint                      |

## ⚠️ Never point the API suite at your dev database

`apps/api/tests/conftest.py` only **`setdefault`s** `DATABASE_URL`. An environment variable —
or the value in `apps/api/.env`, which pydantic-settings reads — wins. The `db_session` fixture
`TRUNCATE`s **every table** before each test, so a stray `DATABASE_URL` empties the database
you develop against: accounts, catalog, orders and all.

Use a dedicated database. Once:

```bash
docker compose exec db psql -U lulu -d postgres -c 'CREATE DATABASE lulu_test'
cd apps/api
DATABASE_URL='postgresql+asyncpg://lulu:lulu@localhost:5432/lulu_test' uv run alembic upgrade head
```

Then every run:

```bash
DATABASE_URL='postgresql+asyncpg://lulu:lulu@localhost:5432/lulu_test' uv run pytest
```

## `apps/api`

`asyncio_mode = "auto"`, `testpaths = ["tests"]`.

Most of the suite is **deliberately DB-free** — pure schema, service and unit tests. The
DB-backed tests live under `tests/integration/` and **skip themselves** when Postgres isn't
reachable. That means:

> A green local `uv run pytest` may have skipped every integration test.

CI provides the Postgres service that turns them on (`.github/workflows/api.yml`).

The `db_session` fixture disposes the engine's connection pool at the start of every test:
pytest-asyncio gives each test a fresh event loop, and asyncpg connections are bound to the
loop they were opened on — a pooled connection from a previous test's loop raises "another
operation is in progress" the moment it's used.

`tests/integration/factories.py` builds domain objects for those tests.

Single test:

```bash
uv run pytest tests/test_orders_router.py::test_name
```

## `packages/widgets`

Config in `vite.config.ts`, setup in `src/testing/setup.ts` (`@testing-library/jest-dom`).

**Use `renderWidget` from `src/testing/render.tsx`, not bare `render`.** It wraps the tree in
the same `StoryWrapper` Storybook uses; without it any component reaching for `AppLink` or
`AppImage` fails on an empty `ServicesContext`.

The component generator (`npm run generate -w widgets`) scaffolds a test file alongside the
story — the story is the primary dev loop, the test is for behavior worth locking down.

Single file:

```bash
cd packages/widgets && npx vitest run src/atoms/button/Button.test.tsx
```

## What CI actually runs

- `node.js.yml`: `npm ci` → `npm run check` → `npm test`. Types and lint are not the tests:
  the vitest suites in `packages/widgets` cover behavior that typechecks perfectly while being
  wrong.
- `api.yml`: `ruff` → `mypy` → `alembic upgrade head` → `pytest`, with a real Postgres, so the
  integration tests execute there.
