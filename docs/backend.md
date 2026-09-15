# `apps/api` — the FastAPI backend

Python 3 + FastAPI + PostgreSQL 16, SQLAlchemy 2.0 async (`asyncpg`) + Alembic, dependencies
managed with **`uv`** (`pyproject.toml` + committed `uv.lock`). It is not an npm workspace and
`npm run check` / `npm test` do not cover it.

Comments and docstrings here are **English**; only user-facing strings are Russian
(`telegram/messages.py`, `export/service.py`, `catalog/import_service.py`,
`orders/service.py`). See [conventions.md](conventions.md#language).

## Commands

Run from `apps/api`:

```bash
uv sync                                        # install into .venv per uv.lock
uv run uvicorn app.main:app --reload --port 3001
uv run pytest                                  # tests   (see docs/testing.md first)
uv run ruff check .                            # lint
uv run mypy app                                # strict = true
uv run alembic revision --autogenerate -m "…"  # commit the generated file
uv run alembic upgrade head
uv run python -m app.scripts.seed              # upsert the SUPER_ADMIN owner
```

**Run all three of `pytest` / `ruff` / `mypy` before finishing any `apps/api` change.**

## Application wiring

`app/main.py::create_app()` builds the app. Middleware order matters:

1. `RateLimitMiddleware` — added **first** so it runs _inside_ CORS. A 429 without CORS
   headers reads as a network failure in the browser.
2. `BodySizeLimitMiddleware` — outer bound `MAX_BODY_BYTES = 12 MB`, before route parsing.
3. `CORSMiddleware` — `CORS_ORIGIN`.

Then every router, plus `/files` mounted as static (product images from local disk) — via
`ImmutableStaticFiles` (`app/common/static.py`), not plain `StaticFiles`, so a hit carries
`Cache-Control: public, max-age=31536000, immutable`. The names are uuid4 and a file is never
rewritten (replacing a photo stores a new one), so the promise holds. Plain `StaticFiles` sends
only `ETag`, which costs a round trip per photo per page view and caps Next's image optimiser at
`minimumCacheTTL`.

`lifespan` starts and stops the Telegram bot (long polling, or webhook registration when
configured) and the APScheduler jobs.

`app/config.py::Settings` is instantiated **at import time**, and several fields have no
default — `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_BOT_USERNAME`, `OWNER_PHONE`, `OWNER_NAME`. Importing `app.*` without them set fails
immediately, which is why `tests/conftest.py` and `.github/workflows/api.yml` both seed
placeholders. Full list: [environment.md](environment.md).

## Module layout

Each domain module under `app/` is roughly `router.py` / `service.py` / `schemas.py` /
`models.py`:

| Module      | Contents                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`     | Telegram sign-in (session/claim/widget/mini-app), refresh, logout, JWT issuing, `telegram_identity.py` HMAC verification, role dependencies. |
| `users/`    | `/users/me`, admin user list and role changes.                                                                                               |
| `catalog/`  | Categories, products, images, xlsx/csv import, serializers.                                                                                  |
| `cart/`     | Cart and lines. Every mutation needs an open cycle.                                                                                          |
| `orders/`   | Checkout, customer edit/cancel/restore, admin status changes, repricing.                                                                     |
| `cycles/`   | Cycle CRUD, `reminders.py` (stage definitions), `scheduler_service.py` (sweeps).                                                             |
| `wishlist/` | Saved products, cycle-independent.                                                                                                           |
| `export/`   | xlsx purchase list.                                                                                                                          |
| `telegram/` | Bot, handlers, keyboards, Russian messages, notifications, throttling, webhook.                                                              |
| `storage/`  | Local disk file storage for images.                                                                                                          |
| `common/`   | `CamelModel`, `PageResponse`, phone normalization, model mixins, limits, rate limit, body limit.                                             |
| `health/`   | `GET /health` with a real `SELECT 1`; `503` when the DB is unreachable.                                                                      |

Two files that are easy to forget:

- **`app/models.py`** is an import hub registering every SQLAlchemy model on `Base.metadata`.
  **Add each new model here** or Alembic autogenerate silently misses its table.
- **`app/db.py`** holds the async `engine` / `async_session`, the declarative `Base`, and the
  `get_session` dependency.

## Endpoints

Public and customer-facing:

| Method                        | Path                                          | Notes                                                        |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `GET`                         | `/health`                                     | Real DB check; `503` if unreachable. Rate-limit exempt.      |
| `POST`                        | `/auth/telegram/session`                      | Opens a sign-in session, returns the bot link + poll secret. |
| `POST`                        | `/auth/telegram/claim`                        | Claims a session the bot confirmed.                          |
| `POST`                        | `/auth/telegram/widget`                       | Trades a Telegram Login Widget signature for tokens.         |
| `POST`                        | `/auth/telegram/mini-app`                     | Same, for Mini App `initData`.                               |
| `POST`                        | `/auth/refresh`, `/auth/logout`               |                                                              |
| `GET`                         | `/categories`, `/brands`                      |                                                              |
| `GET`                         | `/products`                                   | Paged. Query params **snake_case**: `in_stock`, `page_size`. |
| `GET`                         | `/products/{slug}`                            |                                                              |
| `GET`                         | `/cycles/active`                              |                                                              |
| `GET`/`PATCH`                 | `/users/me`                                   |                                                              |
| `GET`/`POST`/`PATCH`/`DELETE` | `/cart`, `/cart/items[/{product_id}]`         | 409 `no_active_cycle` without an open cycle.                 |
| `GET`/`POST`/`DELETE`         | `/wishlist`, `/wishlist/items[/{product_id}]` | Cycle-independent.                                           |
| `POST`                        | `/orders/checkout`                            |                                                              |
| `GET`                         | `/orders`, `/orders/{id}`                     |                                                              |
| `PATCH`                       | `/orders/{id}`                                | Note only.                                                   |
| `POST`/`PATCH`/`DELETE`       | `/orders/{id}/items[/{item_id}]`              | Add / change quantity / remove.                              |
| `POST`                        | `/orders/{id}/cancel`, `/orders/{id}/restore` |                                                              |

Owner-only (`ADMIN` or `SUPER_ADMIN`, checked on the API — the frontend gate is UX only).
`PATCH /admin/users/{id}/role` is the one exception: **SUPER_ADMIN only**.

| Method   | Path                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/admin/users`, `/admin/brands`, `/admin/products`, `/admin/products/{id}`, `/admin/orders`, `/admin/cycles`, `/admin/export/orders`                                        |
| `PATCH`  | `/admin/users/{id}/role`, `/admin/categories/{id}`, `/admin/products/{id}`, `/admin/cycles/{id}`, `/admin/orders/{id}/status`                                               |
| `POST`   | `/admin/categories`, `/admin/products`, `/admin/products/{id}/restore`, `/admin/products/{id}/images`, `/admin/catalog/import`, `/admin/cycles`, `/admin/cycles/{id}/close` |
| `DELETE` | `/admin/categories/{id}`, `/admin/products/{id}` (soft), `/admin/products/{id}/images/{image_id}`, `/admin/cycles/{id}`, `/admin/orders/{id}`                               |

`POST /telegram/webhook` is mounted always but 404s unless `TELEGRAM_USE_WEBHOOK` + url +
secret are all set. Rate-limit exempt.

Upload ceilings: images 5 MB (`jpeg`/`png`/`webp`), import file 10 MB, outer body 12 MB.

## Patterns to match

**Services are classes constructed with an `AsyncSession`** (`OrdersService(session)`,
`CycleSchedulerService(session)`). They mutate but **do not commit** — the caller (a router
dependency or a scheduler job) owns the transaction boundary. Side effects that must not
survive a rollback (any `notify_*`) fire _after_ the commit.

**Wire format.** Request/response schemas subclass `common.schemas.CamelModel`, so JSON is
camelCase while Python stays snake_case. `PageResponse[T]` is the paging envelope.

> Query parameters are **not** covered by that, and the casing is inconsistent
> purpose-by-accident: public `GET /products` takes `in_stock` / `page_size`, admin
> `GET /admin/products` takes `inStock` / `pageSize` / `includeDeleted` via `Query(alias=…)`.
> **Check the router before adding a param on the frontend.**

**Errors** are `raise HTTPException(status, "<machine_code>")` — snake_case codes, never human
text. The Russian message for each code lives in
`apps/website/src/services/apiErrors.ts`, so **every new code needs an entry there** or the
user sees a status-based placeholder. See [recipes.md](recipes.md#add-an-api-error-code).

Codes currently raised:

```
active_cycle_exists       admin_only                auth_session_expired
auth_session_not_found    cart_is_empty             cart_item_not_found
category_not_found        cycle_already_closed      cycle_has_orders
cycle_not_found           invalid_refresh_token     invalid_token
last_order_item           no_active_cycle           not_authenticated
order_item_not_found      order_not_editable        order_not_found
order_not_restorable      order_status_not_assignable
order_status_transition_invalid                     super_admin_immutable
super_admin_not_assignable                          super_admin_only
product_image_not_found   product_not_found         slug_already_exists
telegram_account_not_linked                         telegram_auth_expired
telegram_auth_invalid     telegram_webhook_forbidden
unsupported_image_type    user_not_found            wishlist_full
wishlist_item_not_found
```

(plus `image_too_large`, `import_file_too_large`, `request_body_too_large`, `rate_limited`,
`deadline_must_be_future`, raised from routers/middleware in the same shape.)

**Money** is integer `*_cents`. **Products are soft-deleted.** See [domain.md](domain.md).

## Rate limiting

`app/common/rate_limit.py` — an in-process token bucket with two budgets:
`RATE_LIMIT_PER_MINUTE` for everything and the stricter `RATE_LIMIT_AUTH_PER_MINUTE` for the
`/auth/` prefix, the only anonymous surface that writes rows. `/health` and
`/telegram/webhook` are exempt.

Authenticated callers are keyed by the `sub` in their access token, anonymous ones by address
— taken from `X-Forwarded-For` only when `RATE_LIMIT_TRUST_FORWARDED_FOR` is on. State is
per worker, so more than one uvicorn worker gives each caller each worker's budget.

## Migrations

`migrations/env.py` reads `DATABASE_URL` from `app.config.settings` and uses `Base.metadata`
as `target_metadata`. Generate with `alembic revision --autogenerate` and **commit the file
under `migrations/versions/`** — the Docker image only runs `alembic upgrade head`, it never
generates.

**One release, one expanding migration.** Production runs `alembic upgrade head` on every
container start and nothing ever runs `downgrade`, so rolling the code back to the previous
tag leaves the new schema in place. A migration that only adds — a nullable column, a table,
an index — stays compatible with the previous release, which makes that rollback safe. Drops,
renames and `NOT NULL` on an existing column don't: they belong in the _next_ release, once
the one that stopped writing the old shape has lived in production. A release that breaks
this rule can only be undone through `deploy/restore.sh`. See "Releases" in
[deployment.md](deployment.md).

## Docker

`apps/api/Dockerfile` is a multi-stage `uv` build (builder → runtime, non-root user) whose
build context is **`apps/api` itself** (`docker-compose.yml` sets `build.context: apps/api`),
so unlike the frontend it depends on nothing else in the monorepo. On start it runs
`alembic upgrade head` and serves on 3001. Product images live in the named `uploads` volume
— don't `docker compose down -v` unless you intend to orphan the `product_images` rows.
