# `apps/api` — the FastAPI backend

Python 3 + FastAPI + PostgreSQL 16, SQLAlchemy 2.0 async (`asyncpg`) + Alembic, dependencies
managed with **`uv`** (`pyproject.toml` + committed `uv.lock`). It is not an npm workspace and
`npm run check` / `npm test` do not cover it.

Comments and docstrings here are **English**; only user-facing strings are Russian
(`telegram/messages.py`, `export/service.py`, `export/products.py`, `catalog/import_service.py`,
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
2. `BodySizeLimitMiddleware` — outer bound `MAX_BODY_BYTES = 20 MB`, before route parsing.
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
| `catalog/`  | Categories, products and their variants (volumes), images, xlsx/csv import, serializers.                                                     |
| `cart/`     | Cart and lines — one per variant. Every mutation needs an open cycle.                                                                        |
| `orders/`   | Checkout, customer edit/cancel/restore, admin status changes, repricing.                                                                     |
| `cycles/`   | Cycle CRUD, `reminders.py` (stage definitions), `scheduler_service.py` (sweeps).                                                             |
| `wishlist/` | Saved products, cycle-independent.                                                                                                           |
| `wanted/`   | Wishes for products the catalog does not stock, written under an empty search. Write-only.                                                   |
| `export/`   | xlsx purchase list (`service.py`) and the catalogue export (`products.py`).                                                                  |
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

| Method                        | Path                                          | Notes                                                                                                                            |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET`                         | `/health`                                     | Real DB check; `503` if unreachable. Rate-limit exempt.                                                                          |
| `POST`                        | `/auth/telegram/session`                      | Opens a sign-in session, returns the bot link + poll secret.                                                                     |
| `POST`                        | `/auth/telegram/claim`                        | Claims a session the bot confirmed.                                                                                              |
| `POST`                        | `/auth/telegram/widget`                       | Trades a Telegram Login Widget signature for tokens.                                                                             |
| `POST`                        | `/auth/telegram/mini-app`                     | Same, for Mini App `initData`.                                                                                                   |
| `POST`                        | `/auth/refresh`, `/auth/logout`               |                                                                                                                                  |
| `GET`                         | `/categories`, `/brands`                      |                                                                                                                                  |
| `GET`                         | `/products`                                   | Paged. Query params **snake_case**: `in_stock`, `page_size`.                                                                     |
| `GET`                         | `/products/{slug}`                            |                                                                                                                                  |
| `GET`                         | `/search/suggest`                             | Header search: categories + brands + 5 products. `q` 1–255.                                                                      |
| `GET`                         | `/cycles/active`                              |                                                                                                                                  |
| `GET`/`PATCH`/`DELETE`        | `/users/me`                                   | `DELETE` erases the account — see "Erasing an account".                                                                          |
| `GET`                         | `/users/me/deletion`                          | Whether the caller may erase, and what blocks it.                                                                                |
| `GET`/`POST`/`PATCH`/`DELETE` | `/cart`, `/cart/items[/{variant_id}]`         | 409 `no_active_cycle` without an open cycle. A line is a **volume**: `POST` takes `variantId`, and `PATCH`/`DELETE` address one. |
| `GET`/`POST`/`DELETE`         | `/wishlist`, `/wishlist/items[/{product_id}]` | Cycle-independent.                                                                                                               |
| `POST`                        | `/wanted-products`                            | A wish for something the catalog lacks. **No account needed**; strict rate-limit budget.                                         |
| `POST`                        | `/orders/checkout`                            |                                                                                                                                  |
| `GET`                         | `/orders`, `/orders/{id}`                     |                                                                                                                                  |
| `PATCH`                       | `/orders/{id}`                                | Note only.                                                                                                                       |
| `POST`/`PATCH`/`DELETE`       | `/orders/{id}/items[/{item_id}]`              | Add / change quantity / remove. `POST` takes `variantId`.                                                                        |
| `POST`                        | `/orders/{id}/cancel`, `/orders/{id}/restore` |                                                                                                                                  |

Owner-only (`ADMIN` or `SUPER_ADMIN`, checked on the API — the frontend gate is UX only).
`PATCH /admin/users/{id}/role` is the one exception: **SUPER_ADMIN only**.

| Method   | Path                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/admin/users`, `/admin/brands`, `/admin/products`, `/admin/products/{id}`, `/admin/orders`, `/admin/cycles`, `/admin/export/orders`, `/admin/export/products`              |
| `PATCH`  | `/admin/users/{id}/role`, `/admin/categories/{id}`, `/admin/products/{id}`, `/admin/cycles/{id}`, `/admin/orders/{id}/status`                                               |
| `POST`   | `/admin/categories`, `/admin/products`, `/admin/products/{id}/restore`, `/admin/products/{id}/images`, `/admin/catalog/import`, `/admin/cycles`, `/admin/cycles/{id}/close` |
| `DELETE` | `/admin/categories/{id}`, `/admin/products/{id}` (soft), `/admin/products/{id}/images/{image_id}`, `/admin/cycles/{id}`, `/admin/orders/{id}`                               |

`POST /telegram/webhook` is mounted always but 404s unless `TELEGRAM_USE_WEBHOOK` + url +
secret are all set. Rate-limit exempt.

Upload ceilings: images 15 MB (`jpeg`/`png`/`webp`), import file 10 MB, outer body 20 MB.

### Erasing an account

`DELETE /users/me` answers `204` and erases the caller's own account — never one named in
the request. It refuses with `403 account_not_deletable` for any account with admin rights
(either role — it is demoted first), `404 user_not_found` for a row already erased, and
`409 account_has_unfinished_orders` while the caller has a `CONFIRMED` or `READY` order.
When it withdrew pending orders, the owner is told after the commit
(`notify_account_deleted`), as every other notification is.

`GET /users/me/deletion` answers the same rule in advance (`isDeletable`, `blockingOrders`)
so the account page can disable the button and name the orders instead of letting the
person confirm an erasure that then fails. Both go through one query,
`UsersService.deletion_blockers` — the check and the answer must not be able to disagree.

`UsersService.delete_account` overwrites the identifying columns and stamps `deleted_at`
rather than deleting the row, because orders cascade off it. The whole rule — what is
overwritten, what is deleted outright, what happens to orders, and who may not be erased —
is in [domain.md](domain.md#erasing-an-account). Anything that reads a profile must treat
`deleted_at IS NOT NULL` as "no such user", and it belongs in the query rather than at the
point the answer is drawn — a filter the next reader has to remember is a filter that will
be forgotten. `UsersService.get`, `list_page`, `OrdersService.load_customers`,
`recipients.get_users` and `notify._load_customer` all do it, which is what keeps the
placeholder name and the filled-in phone out of the admin order list and out of a message
to the owner.

### Product photos are re-encoded on upload

`POST /admin/products/{id}/images` does not store what it receives. `app/catalog/image_compression.py`
scales the longest side down to `MAX_DIMENSION = 2000`, applies the upload's EXIF rotation to the
pixels (and drops the rest of the EXIF with it), and re-encodes it as WebP at quality 82 — a
15 MB PNG out of a camera lands in `uploads` as a few hundred kilobytes. The stored extension
therefore comes from the compressor, never from the content type or the filename. The scaling
runs **before** the rotation on purpose: it lets the decoder skip straight to a reduced image,
so a 24 MP photo is never held at its own size. The box is square, which is what makes the order
safe — if it ever stops being square, the two steps have to swap back.

A picture that is already smaller than its own re-encode (something somebody saved as WebP
already) is kept exactly as it arrived — but only when it is nothing but pixels. A file that
carries EXIF, XMP, an ICC profile or a comment, or that has anything glued on past the marker
that ends the image, is re-encoded instead. That path is the only one that would hand an
upload's own bytes to the disk, and those bytes are where a GPS tag or an appended payload
would ride along.

Three more consequences worth remembering:

- The declared content type is only a first filter. `Image.open` is given an explicit
  `formats=["JPEG", "PNG", "WEBP"]` allowlist, so a TIFF or an ICO under a
  `Content-Type: image/png` is refused rather than quietly converted — the parsers for the
  formats nobody here uploads are the ones that collect the CVEs. A file that fails to decode
  is a `400 image_unreadable`, not a 415.
- The cost of a photo is its pixel count, not its size on the wire: a flat 40 MP PNG travels in
  128 KB and still costs a few hundred megabytes to decode. Hence `MAX_PIXELS = 24_000_000`,
  refused as `413 image_too_many_pixels` — a distinct code from `image_too_large`, which is
  about bytes the owner can actually see.
- The work is CPU- and memory-bound, so it runs in a worker thread (`anyio.to_thread`) behind
  its own `DECODE_LIMITER` of 2. The API is one process shared with the bot and the scheduler,
  a second spent decoding on the event loop is a second everything else waits, and the default
  thread pool would have allowed forty simultaneous decodes on a 4 GB box that also runs
  Postgres.

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
product_gone              product_image_not_found   product_not_found
product_has_variants      product_variants_empty    slug_already_exists
too_many_variants         variant_volume_duplicate
telegram_account_not_linked                         telegram_auth_expired
telegram_auth_invalid     telegram_webhook_forbidden
unsupported_image_type    user_not_found            wishlist_full
wishlist_item_not_found
```

(plus `image_unreadable`, `image_too_large`, `image_too_many_pixels`, `import_file_too_large`,
`request_body_too_large`, `rate_limited`,
`deadline_must_be_future`, raised from routers/middleware in the same shape.)

`product_gone` is the odd one out: it is the only code whose status is **410**, raised by
public `GET /products/{slug}` when the slug belongs to a product the owner withdrew. A slug
the catalogue never had is still a 404. The site needs the two apart — it redirects the first
and 404s the second, so a withdrawn product's URL keeps whatever search signals it collected
([seo.md](seo.md#urls-that-survive-a-buying-round)). The redirect is temporary, because
withdrawal here is not: the xlsx import revives a product it meets again, and the admin can
restore one by hand.

The four variant codes are all 409s the owner's product form can point at a row with: an
empty list of volumes, the same volume twice, past `MAX_PRODUCT_VARIANTS`, and a flat
price/volume/stock sent to a product sold in several. The alternative to the third one is a
500 out of the partial unique index at flush.

**Money** is integer `*_cents`. **Products are soft-deleted**, and so are their variants.
See [domain.md](domain.md).

## Catalogue search

`q` is **one field over three things**: it matches a product's name, its brand, or its
category's name (`ProductService._filtered_query`). That holds for the admin listing too —
`GET /admin/products?q=` shares the same builder, so a query naming a category returns
everything in it, which is what the admin product picker and the product list now do. The category arm is a plain list of ids
resolved first by `_search_category_ids`, not a join and not an EXISTS: a join would collide
with the one `category=` may already have made, and a subquery inside the `OR` makes the
whole disjunction unindexable — the planner then reads every product row, the name arm
included. Wildcards the user typed are escaped, not stripped — "50%" means a name containing
"50%".

### Punctuation is ignored on both sides

The pattern does not run against `name`, `brand` and `categories.name` but against
normalised twins of them — `name_norm`, `brand_norm`, `category.name_norm` — and the query
is normalised the same way by `like_pattern`. Normalising only the query would have changed
nothing: the punctuation sits in the **data** too, so `dral` could never have reached
`Dr.Althea` however clean the query was. With both sides stripped, `dral`, `dr althea`,
`dr.althea` and `DR-ALTHEA` are one query, and `Round Lab` and `Round-Lab` are one product.

The rule is `app/catalog/search.py`: `NOISE` lists the characters dropped — spaces,
hyphens and dashes, dots, commas, apostrophes, quotes, brackets, slashes. Two things are
deliberately **not** in it. `%` and `_` stay, because they are LIKE wildcards that
`like_pattern` escapes, and dropping them from the data would make a search for "50%" match
a plain "50". And `ё` stays `ё` — folding it onto `е`, like transliterating "Роунд Лаб"
onto "Round Lab", is a different decision that this rule does not make.

A query that is _only_ noise — `-`, `...`, a lone space — normalises to an empty string,
and an empty query filters nothing, so the listing comes back whole. That falls out of the
rule rather than being decided separately, and it is the better of the two outcomes: the
alternative is answering a stray keystroke with an empty catalogue.

The columns are **generated** (`translate(...)` stored, no `lower()` — matching is `ILIKE`
already, and a stored expression must be immutable). That is what keeps them honest: the
xlsx import and the admin forms both write names, and a column either could leave stale
would be a search that quietly stops finding things.

The standing risk is that the rule is written twice — in Python for the query, in SQL for
the columns (and a third time, frozen, in the migration that created them, because a stored
generated column keeps the expression it was made with). They drift silently; a search that
returns nothing is the only symptom. `test_normalisation_matches_the_database` is the guard:
it compares every stored `*_norm` against `normalize_search` of its source.

Two partial trigram GIN indexes carry it, `ix_products_live_name_norm_trgm` and
`ix_products_live_brand_norm_trgm`, and with the id list the three arms combine into one
`BitmapOr` (the third uses `ix_products_category_id`). An infix `ILIKE '%…%'` rules out any
btree, so without them every search read the whole table. Both are partial on
`deleted_at IS NULL`, the condition every public listing carries. `pg_trgm` is a _trusted_
extension, so the migration creates it without superuser.

They replaced the pair on the raw columns rather than joining it: nothing does an infix
match on `name`/`brand` any more, so keeping those would have meant four GIN indexes
rebuilt on every product write — the whole cost of an xlsx import — for no reader. The
plain btrees beside them stay; they serve the name ordering and the exact-match brand
filter, neither of which is a search. `categories.name_norm` gets no index at all: the
table is tens of rows, and `_search_category_ids` reads all of them by design.

Note also that a query shorter than three characters cannot use a trigram index at all — a
trigram needs three characters to exist — so one- and two-letter searches are sequential
scans by construction. That is affordable at this catalogue's size and is the price of
answering the first keystroke.

`GET /search/suggest?q=` answers the header dropdown and is deliberately **not** a flag on
`GET /products`: it returns three groups (up to 5 categories, 5 brands, 5 products), a
product there is trimmed to one image, and the whole thing is unpaged. Products with the
query in their **name** are ordered ahead of those matched only by brand or category — five
rows are the entire dropdown, and a literal hit must not be crowded out of them. A category
is offered only when it still has a live product behind it, and brands collapse by case the
same way `/brands` does — with the difference that the brand query is capped in SQL as well
(`BRAND_CASING_HEADROOM` times the group size, since the collapsing happens after the
fetch): this one runs on every debounced keystroke, and a one-letter query must not drag
back the whole brand list to throw all but five of it away. `q` is one character minimum
(only an empty query is refused) and 255 maximum. A product row also carries
`variantCount`: with several volumes its `priceCents` is the cheapest of them, and the row
says "от N" exactly as the catalogue card does — `volumeMl` cannot stand in for the count,
since it is NULL both for a product with no volume and for one sold in several.

## Rate limiting

`app/common/rate_limit.py` — an in-process token bucket with two budgets:
`RATE_LIMIT_PER_MINUTE` for everything and the stricter `RATE_LIMIT_AUTH_PER_MINUTE` for the
anonymous surfaces that write rows: the `/auth/` prefix (`STRICT_PREFIX`) and
`POST /wanted-products` (`STRICT_PATHS`). `/health` and `/telegram/webhook` are exempt.

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
this rule can only be undone through `deploy/restore.sh`. So does a `NOT NULL` column the
database cannot fill by itself, and a uniqueness rule added to an existing table: the
previous release inserts rows the new schema refuses. A `server_default` or a `Computed`
settles the first — the database supplies the value for the rows the old code inserts, and
a generated column it could not name even if it knew about it. The rule is enforced on every release by the
`Migration guard` job, which parses `upgrade()` in each migration the release touches
(`.github/scripts/check-migrations.py` — runnable by hand before the release PR, and run as a
warning by the `API` job on every push to `development`). It runs **before** the tag, so a
merge it refuses is simply not a release: nothing is named or built, and the finding comes
back on the next one instead of sliding behind a spent tag. The only way past it is a
`[contracting]` marker in the merge commit, which has to be written when the merge is
made rather than after the guard has spoken. See "Releases" in
[deployment.md](deployment.md).

## Docker

`apps/api/Dockerfile` is a multi-stage `uv` build (builder → runtime, non-root user) whose
build context is **`apps/api` itself** (`docker-compose.yml` sets `build.context: apps/api`),
so unlike the frontend it depends on nothing else in the monorepo. On start it runs
`alembic upgrade head` and serves on 3001. Product images live in the named `uploads` volume
— don't `docker compose down -v` unless you intend to orphan the `product_images` rows.
