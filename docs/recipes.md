# Recipes

Checklists for changes that cross file or package boundaries. Each one exists because
forgetting one of its steps produces a failure that looks like something else.

## Add an API endpoint

1. `apps/api/app/<module>/schemas.py` — request/response models subclassing `CamelModel`.
2. `apps/api/app/<module>/service.py` — the logic, as a method on the session-taking service
   class. **Do not commit inside it.**
3. `apps/api/app/<module>/router.py` — the route, its auth dependency, and
   `HTTPException(status, "<machine_code>")` for each failure.
4. `apps/website/src/services/apiErrors.ts` — a Russian message for every new code (see
   below).
5. `apps/website/src/services/endpoints/<domain>.ts` — the client function. Never `fetch` in a
   page.
6. `apps/website/src/services/swrKeys.ts` — a tagged tuple key if the data is read with SWR.
7. Tests: a service test in `apps/api/tests/`, plus an integration test if it touches the DB.
8. `uv run ruff check . && uv run mypy app && uv run pytest`, then `npm run check`.

**Watch the query-parameter casing** — it is inconsistent by accident: public `GET /products`
takes `in_stock`/`page_size`, admin `GET /admin/products` takes `inStock`/`pageSize`/
`includeDeleted` via `Query(alias=…)`. Check the router before adding a param on the frontend.

## Add an API error code

The backend emits machine codes only; all human text is on the frontend.

1. Raise it: `raise HTTPException(status.HTTP_409_CONFLICT, "my_new_code")`.
2. Add `my_new_code: '…'` to `MESSAGES` in `apps/website/src/services/apiErrors.ts`.
3. If the same code means different things in different places, add a scope override rather
   than a vaguer message — `no_active_cycle` is "сбор ещё не открыт" in the cart and "сбор
   закрылся, пока вы собирали заявку" at checkout. Add the `ErrorScope` if it's new.
4. Branch on `error.code` in the UI, never on the message.

Without step 2 the user gets a status-based placeholder that explains nothing.

## Add a database model or column

1. Define it in `apps/api/app/<module>/models.py`.
2. **Import it in `apps/api/app/models.py`.** Autogenerate inspects `Base.metadata`; a model
   that isn't imported there is silently missing from the migration.
3. `uv run alembic revision --autogenerate -m "…"`, **read the generated file**, then
   `uv run alembic upgrade head`.
4. Commit the file under `migrations/versions/` — the Docker image only applies migrations.
5. If it is money, it is an integer `*_cents`. If it is a product, remember the soft delete.
6. Keep the migration **expanding only** — add a nullable column, a table, an index. A drop,
   a rename or a `NOT NULL` on an existing column goes in the release _after_ the one that
   stopped using the old shape: production never runs `downgrade`, so anything else makes the
   release impossible to roll back. See [backend.md](backend.md#migrations).

## Add a widget

1. `npm run generate -w widgets`, choose the tier, give the name. It scaffolds the component,
   a story, styles and a test, and regenerates the barrels. Don't hand-create the folder.
2. Look up a reference implementation through the `shadcn` MCP server first, and hand-port its
   structure into vanilla-extract — no Tailwind, no Radix runtime. See
   [conventions.md](conventions.md#building-new-ui).
3. Need a link or an image? Take them from `ServicesContext`. **Never import `next/*`.**
4. Shared styling goes in `src/styling/{lib,mixin}`, not inline.
5. Animating? `motion/react` and the timings in `src/utils/motion.ts`; use `/motion`.
6. `npm run check -w widgets && npm test -w widgets`.
7. If you added a new public subpath, add it to **both** `exports` and `typesVersions` in
   `packages/widgets/package.json`.

## Add a page to the website

1. Create it under `src/pages`. Public pages get `getStaticProps` with `revalidate`; there is
   no `getServerSideProps` in this app and adding one changes the deployment shape.
2. Shared build-time data (categories, active cycle) comes from `src/services/staticData.ts`,
   and reaches components through `props.fallback` + `swrFallback.ts` — fallback keys must go
   through `unstable_serialize`, or the entry silently never matches.
3. Behind login? Use the existing contexts; a 401 from `/api/auth/me` means "guest".
4. Owner-only? Put it under `admin/` and use `useAdminGate`. Remember the chunk is public.
5. Compose the page from `widgets` templates + `SiteLayout` / `AdminShell`.

## Add a Telegram notification

1. Wording in `apps/api/app/telegram/messages.py` (Russian).
2. Sending function in `notify.py`; recipients through `recipients.py` — "the owner" means
   every admin, of either role (`ADMIN_ROLES`).
3. Call it **after the commit** of the transaction that produced the state, never inside the
   service. Services return what needs saying.
4. If it is periodic, it belongs in a sweep in `cycles/scheduler_service.py` + a job in
   `app/scheduler.py`, and follows plan → send → stamp.
5. Test it in `tests/test_notifications_service.py` / `tests/test_messages.py`.

## Add an environment variable

1. API: add the field to `app/config.py::Settings` **with a default** unless the app genuinely
   cannot start without it — fields without defaults must then be added to
   `tests/conftest.py` and `.github/workflows/api.yml`, or every import fails.
2. Website: `NEXT_PUBLIC_*` for anything the browser needs; otherwise add it to `serverValues`
   in `src/сonfig.ts` (Cyrillic `с`), where reading it in the browser throws.
3. Document it in the matching `.env.example`, in `deploy/.env.prod.example` if production
   needs it, and in [environment.md](environment.md).
4. `NEXT_PUBLIC_*` values are baked in at **build** time — production needs an image rebuild,
   not a restart.

## Change a price or delete a product

Not a code recipe, but the behavior that surprises people: changing a catalog price rewrites
every **PENDING** order that contains it and notifies those customers; soft-deleting a product
removes its line from every PENDING order and cancels any order left empty. Confirmed and
later orders keep their snapshots. Copy must therefore say "snapshot as of confirmation", not
"as of checkout". See [domain.md](domain.md#price-snapshots).

## Add an admin action that changes the catalog

1. The endpoint goes in `src/services/endpoints/admin.ts`, the SWR keys it invalidates in
   `src/services/swrKeys.ts` — as usual.
2. If a visitor can see the result, call `refreshPublicPages(...)` from
   `src/services/endpoints/revalidate.ts` right after the success toast: the public pages are
   static, and without it the change waits out `revalidate: 60` plus one request. Name
   `SHOWCASE_PATHS` (`/` and `/catalog`) and `productPath(slug)` for the products involved —
   including the slug the product had **before** the edit, if it changed.
3. A path shape that isn't `/`, `/catalog` or `/catalog/<slug>` also needs adding to the
   allowlist in `pages/api/revalidate.ts`, or the route refuses it.
4. See [frontend.md](frontend.md#keeping-the-public-pages-fresh).

## Before you finish

Re-read [conventions.md](conventions.md#before-finishing-a-change) — and update the document
under `docs/` that your change invalidated.
