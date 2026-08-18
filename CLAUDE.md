# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git: hard rules

**Claude must never commit or push in this repository.** No `git commit`, no `git push`, no `git merge`/`rebase`/`revert`/`reset --hard`, no `gh pr create`/`gh pr merge`, and no committing via any MCP/IDE tool. This holds even if the user says "commit this" — say that committing is out of scope here and leave the changes in the working tree instead; the user commits and pushes themselves.

Read-only git is fine and encouraged: `git status`, `git diff`, `git log`, `git show`, `git blame`.

## Repository overview

Turborepo monorepo for the Lulu Beauty online catalog/ordering platform (no payments — customers submit requests, the owner fulfills them offline).

- `apps/website` — Next.js 16 app that renders the site (public catalog/product/cart/checkout/wishlist, Telegram-only auth (no password, no code — the bot confirms a waiting tab), customer account/orders, and the owner-only `/admin/*` section), consuming `widgets`.
- `apps/api` — Python + FastAPI + PostgreSQL backend (auth, catalog + xlsx/csv import, cart, orders, order cycles/deadlines, a Telegram bot, xlsx export), using `uv` for dependency management and SQLAlchemy (async) + Alembic for the DB layer. **Not** an npm workspace — it has no `package.json` and is excluded from Turborepo/`npm run *` commands; manage it with `uv`/Docker as described below.
- `packages/widgets` — React component library (atoms through templates, e.g. `Button`/`ProductCard`/`AdminOrdersTable`/`AdminLayout`) styled with vanilla-extract, developed/tested in isolation via Storybook.

The JS side uses **npm** (`packageManager: npm@10.9.0`, committed `package-lock.json`, CI runs `npm ci`) on Node 22.23.1 (pinned in `engines` and `.nvmrc`). Never use pnpm/yarn here. This covers `apps/website` and `packages/widgets` only — `apps/api` is a separate Python project managed with `uv`.

**Language convention** (not obvious from any single file, and easy to break):

- All user-facing copy is **Russian** — UI strings, Telegram bot messages, xlsx export headers, import error text.
- Comments and docstrings in `apps/website` and `packages/widgets` are **Russian** (essentially every file). Match that when editing those packages.
- Comments and docstrings in `apps/api` are **English**; only user-facing strings there are Russian (`telegram/messages.py`, `export/service.py`, `catalog/import_service.py`, `orders/service.py`).

## Commands

Run from the repo root unless noted. Workspace-scoped commands use `-w <workspace>` (e.g. `-w widgets`).

- `npm run check` — runs `tsc --noEmit` + eslint (via turbo, across all workspaces that define it: `website`, `widgets`). Does **not** cover `apps/api` — run that separately (see Backend-specific below). Run before finishing any change that touches the relevant app.
- `npm run lint` — eslint only, `website`/`widgets`.
- `npm test` — runs each JS workspace's `test` script (via turbo): `vitest run` for `widgets`. Does not cover `apps/api` — use `uv run pytest` there.
- `npm run barrels` — regenerates the auto-generated `index.ts` barrel files (see below).
- `npm run dev` — turbo dev across JS workspaces (only `website` defines `dev`), i.e. the frontend alone. Deliberately **not** an alias for `dev:all` below — CI and muscle memory rely on it staying frontend-only. Start the api separately (see `dev:api`/`dev:all`, or `uv run uvicorn app.main:app --reload` from `apps/api`).
- `npm run build -w <workspace>` / `npm start -w <workspace>` — build/start a single workspace.

Dev-server shortcuts (root `package.json`, so each piece can be started without remembering which workspace or tool owns it):

| Command | Starts | Ports |
| --- | --- | --- |
| `npm run dev:web` | frontend only (`npm run dev -w website`) | 3000 |
| `npm run dev:api` | backend in the foreground with logs (`docker compose up api`; `db` comes up too via `depends_on`) | 3001, 5432 |
| `npm run dev:storybook` | Storybook for `packages/widgets` | 6006 |
| `npm run dev:all` | backend detached + frontend in the foreground | 3000, 3001 |
| `npm run dev:api:stop` | `docker compose stop` — the off-switch for whatever `dev:api`/`dev:all` left running | — |

- `dev:all` starts the api with `-d` **on purpose**: no `concurrently`/`npm-run-all` is installed, and two foreground processes can't share one npm script. Consequence: `Ctrl+C` kills only the frontend and the containers keep running — stop them with `npm run dev:api:stop`.
- None of these pass `--build`, so a rebuild isn't paid for on every start. After changing `apps/api/Dockerfile` or its dependencies, run `docker compose up --build api` manually.

`website`'s `dev`/`build` scripts pass `--webpack` explicitly — Next 16 defaults to Turbopack, but the vanilla-extract plugin here is the webpack one. Don't drop that flag.

Widgets-specific (run with `-w widgets` or `cd packages/widgets`):
- `npm run generate -w widgets` — scaffolds a new atom/molecule/organism (prompts for type + name), then regenerates barrels. Always use this instead of hand-creating component folders.
- `npm run storybook -w widgets` — starts Storybook on port 6006; this is the primary dev/test loop for widgets. `npm run dev:storybook` from the root is the same thing.
- `npm run types -w widgets` — `tsc --noEmit` only.

To run a single vitest test file: `npx vitest run <path-to-test>` from `packages/widgets`.

Backend-specific (run with `cd apps/api`; uses `uv`, not npm):
- `docker compose up --build` (from repo root) — brings up `db` (Postgres 16, with healthcheck) and `api` (builds `apps/api/Dockerfile`, runs `alembic upgrade head` on start, then serves on port 3001). `npm run dev:api` wraps this without `--build` for everyday use. `docker compose down` to tear down. Product image uploads live in the named `uploads` volume — don't `down -v` unless you intend to orphan the `product_images` rows still in the DB.
- `cp apps/api/.env.example apps/api/.env` — required before running the api directly (outside Docker) or via compose (the `api` service's `env_file` points at it); `DATABASE_URL` there targets `localhost` for local dev, while the containerized `api` service overrides it to target the `db` hostname.
- `uv sync` — installs dependencies into `apps/api/.venv` per `uv.lock`.
- `uv run uvicorn app.main:app --reload --port 3001` — local dev server (outside Docker; requires Postgres reachable per `DATABASE_URL`).
- `uv run pytest` / `uv run ruff check .` / `uv run mypy app` — tests / lint / type-check (`mypy` is `strict = true`). Run all three before finishing any `apps/api` change.
- `uv run pytest tests/test_orders_router.py::test_name` — single test.
- `uv run alembic revision --autogenerate -m "<message>"` / `uv run alembic upgrade head` — generate and apply migrations; commit generated files under `migrations/versions/` (the Docker image only runs `alembic upgrade head`, it doesn't generate new revisions).
- `uv run python -m app.scripts.seed` — upserts the single ADMIN owner account from the `OWNER_*` env vars.
- `curl http://localhost:3001/health` — health check that verifies live DB connectivity (not just process liveness); returns `503` if the database is unreachable.

CI runs both `.github/workflows/node.js.yml` (`npm ci` + `npm run check`) and `.github/workflows/api.yml` (ruff → mypy → `alembic upgrade head` → pytest, against a real Postgres service), on `development`/`master`/`staging`.

## Architecture

### `packages/widgets`

Organized by [atomic design](https://bradfrost.com/blog/post/atomic-web-design/): `src/atoms`, `src/molecules`, `src/organisms`, `src/templates` — all four tiers are populated (e.g. `Button`/`Price` atoms, `ProductCard`/`QuantityStepper` molecules, `Header`/`CartPanel`/`AdminOrdersTable` organisms, `BaseLayout`/`AdminLayout` templates). Each component folder is generated via `npm run generate -w widgets`, which scaffolds the component file, a Storybook story, style boilerplate, and a test file from templates in `tools/templates`.

- `src/contexts` — React contexts: `ServicesContext` (dependency injection, see below), `ToastContext`, `ConfirmContext`.
- `src/hooks` — custom hooks.
- `src/utils` — shared utilities not specific to styling (`motion.ts`, `datetime.ts`, `plural.ts`, `validation.ts`, …).
- `src/types.ts` — shared, JSON-serializable types intended for consumption by external packages (e.g. `website`).
- `src/svg` — icons.
- `src/testing` — test/Storybook helpers.
- `src/styling` — all shared styling: `lib/` (style-writing utilities like `color.ts`, `media.ts`, `font.ts`, `shadow.ts`), `mixin/` (composable style mixins, e.g. `flex.ts`, `focusRing.ts`, `grid.ts`), `themes/` (`tokens.ts` → `contract.css.ts` → `light.css.ts`), plus `global.css.ts`, `preflight.css.ts`, `properties.css.ts`.

**Theme tokens**: `themes/tokens.ts` is the single source of truth — `contract.css.ts` is `createThemeContract(lightTokens)` and `light.css.ts` is `createTheme(vars, lightTokens)`, so contract and theme can't drift. Colors are stored as `'R, G, B'` channel strings because the `color()` getter in `styling/lib/color.ts` composes `rgb()`/`rgba()` from them. `tokens.ts` imports from `../lib/rem`/`../lib/shadow` **directly, never via the `lib` barrel** — the barrel pulls in `lib/color.ts`, which imports `contract.css.ts`, creating an initialization cycle.

**Barrels**: Most `index.ts` files under the directories listed in `.barrelsby.json` (atoms, molecules, organisms, contexts, templates, hooks, utils, styling/lib, styling/mixin) are auto-generated by `barrelsby` — do not hand-edit them; run `npm run barrels` after adding/removing files instead.

**Styling**: uses [vanilla-extract](https://vanilla-extract.style/) — effectively typed CSS Modules with zero runtime. All `*.css.ts` files are compiled to real CSS at build time. New shared style utilities/mixins belong in `src/styling`, not inline in components.

The package is consumed via subpath exports (see `package.json` `exports`/`typesVersions`): `widgets/atoms`, `widgets/molecules`, `widgets/hooks`, `widgets/styling/lib`, `widgets/styling/global.css`, etc. When adding a new public subpath, it must be added to both `exports` and `typesVersions` in `packages/widgets/package.json`.

**Framework independence via `ServicesContext`**: widgets never import `next/link` or `next/image`. `apps/website/src/pages/_app.tsx` injects adapters (`@/components/Link`, `@/components/Image`) through `ServicesContext.Provider`, and Storybook injects its own stubs. A widget that needs a link or an image takes it from that context — adding a `next/*` import to `packages/widgets` breaks Storybook.

### `apps/api`

FastAPI backend, PostgreSQL via SQLAlchemy 2.0 (async, `asyncpg` driver) + Alembic migrations. Managed with `uv` (`pyproject.toml` + committed `uv.lock`), fully independent of the npm/Turborepo workspace.

> The repo used to carry `PLAN.md` / `FRONTEND_PLAN.md` / `TELEGRAM_PLAN.md` design docs with running `## Done` logs; they have been deleted. A few code comments and `README.md` still point at `PLAN.md` — the code is the source of truth now, so read the module rather than looking for the doc.

Domain modules under `app/` (each roughly `router.py`/`service.py`/`schemas.py`/`models.py` as needed): `auth/` (refresh/logout plus `telegram/session` + `telegram/claim` — sign-in is a session the bot authorizes — and `telegram/widget` + `telegram/mini-app`, which skip the wait by verifying Telegram's own HMAC signature (`telegram_identity.py`); there is no password, no OTP and no registration endpoint, and accounts are created by `telegram/handlers.py` when someone shares their contact, so the signature paths can only sign in an account that already exists), `users/` (`GET`/`PATCH /users/me` plus `GET /admin/users` and `PATCH /admin/users/{id}/role` — the shop can have several ADMINs; you can't change your own role), `catalog/` (categories/products/images, xlsx/csv import), `cart/` (**requires an open cycle** — every mutation 409s with `no_active_cycle` when there is none), `orders/` (checkout, admin status changes, customer edit/cancel/restore and add-item), `cycles/` (deadline calendar + `scheduler_service.py` sweeps), `telegram/` (bot: contact linking, notifications, menu buttons/commands, inline buttons, per-user throttling, and `POST /telegram/webhook` — mounted always, 404 unless `TELEGRAM_USE_WEBHOOK` + url + secret are all set), `wishlist/` (saved products, cycle-independent — the only place to park items while no cycle is open), `export/` (xlsx order export), `storage/` (local file storage for product images), `common/` (shared `CamelModel`/`PageResponse`, phone normalization, model mixins).

- `app/main.py` — `create_app()` builds the `FastAPI` instance, mounts routers and `/files` static, and its `lifespan` starts/stops both the Telegram bot (long polling, or a webhook registration when configured — see `telegram/bot.py::start`) and the APScheduler jobs.
- `app/scheduler.py` — the APScheduler wiring (reminder sweep, deadline sweep, login-session cleanup, all on `scheduler_interval_seconds`). The cycle logic itself lives in `app/cycles/scheduler_service.py`. Disable with `SCHEDULER_ENABLED=false`.
- `app/config.py` — `Settings` (`pydantic-settings`), instantiated at **import time**. Several fields have no default (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `OWNER_PHONE`/`OWNER_NAME`/`OWNER_PASSWORD`), so anything that imports `app.*` without them set fails immediately — that's why `tests/conftest.py` and `.github/workflows/api.yml` both seed placeholders.
- `app/models.py` — an import hub that registers every SQLAlchemy model on `Base.metadata`. **Add each new model here**, or Alembic autogenerate will silently miss its table.
- `app/db.py` — async SQLAlchemy `engine`/`async_session`, declarative `Base`, and a `get_session` FastAPI dependency.
- `app/common/rate_limit.py` — `RateLimitMiddleware`, an in-process token bucket added **first** in `create_app()` so it runs *inside* CORS (a 429 without CORS headers reads as a network failure in the browser). Two budgets: `RATE_LIMIT_PER_MINUTE` for everything and the stricter `RATE_LIMIT_AUTH_PER_MINUTE` for the `/auth/` prefix — the only anonymous surface that writes rows. `/health` and `/telegram/webhook` are exempt. Authenticated callers are keyed by the `sub` in their own access token; anonymous ones by address, taken from `X-Forwarded-For` only when `RATE_LIMIT_TRUST_FORWARDED_FOR` is on. Per-worker state, so more than one uvicorn worker means each caller gets each worker's budget.
- `app/health/router.py` — `GET /health` runs a real `SELECT 1` against the database and returns `503` if it's unreachable (not just an app-liveness check).
- `alembic.ini` / `migrations/` — Alembic config and migration scripts; `migrations/env.py` reads `DATABASE_URL` from `app.config.settings` rather than a hardcoded URL, and uses `Base.metadata` as `target_metadata` for autogeneration. Commit generated files under `migrations/versions/` — `alembic upgrade head` in the Docker image only applies what's already there, it doesn't generate new revisions.

Backend patterns worth matching:
- **Services are classes constructed with an `AsyncSession`** (`OtpService(session)`, `CycleSchedulerService(session)`) that mutate but do **not** commit — the caller (router dependency or scheduler job) owns the transaction boundary. Side effects that must not survive a rollback (e.g. `notify_cycle_closed`) are fired *after* the commit.
- **Wire format**: request/response schemas subclass `common.schemas.CamelModel`, so JSON bodies are camelCase while Python stays snake_case. Query parameters are **not** covered by that — they're declared per-endpoint, and the casing is inconsistent on purpose-by-accident: public `GET /products` takes `in_stock`/`page_size`, admin `GET /admin/products` takes `inStock`/`pageSize`/`includeDeleted` via `Query(alias=...)`. Check the router before adding a param on the frontend.
- **Errors** are `raise HTTPException(status, detail="<machine_code>")` — snake_case codes, never human text. The Russian message for each code lives in the frontend (see below).
- Money is integer `*_cents` throughout. `Product` is soft-deleted (`deleted_at`) so order snapshots stay valid; `OrderItem` denormalizes name/price at checkout — but the price snapshot only becomes immutable once the owner confirms the order: `OrderService.reprice_product` deliberately pulls a catalog price change through every still-`PENDING` order (recomputing `total_cents` and notifying the customer via the bot), so user-facing copy must say "snapshot as of confirmation", not "as of checkout".

**Tests**: `pytest` + `pytest-asyncio` (`asyncio_mode = "auto"`). Most of the suite is deliberately **DB-free** (pure schema/service/unit tests). The DB-backed tests under `tests/integration/` need a real Postgres at `DATABASE_URL` and **skip themselves** when it isn't reachable — so a green local `uv run pytest` may have skipped them; CI provides the Postgres service that turns them on. The `db_session` fixture disposes the engine pool and `TRUNCATE`s every table per test (asyncpg connections are bound to the event loop they were opened on, and pytest-asyncio gives each test a fresh loop).

> ⚠️ **Never point the suite at the dev database.** `tests/conftest.py` only `setdefault`s `DATABASE_URL`, so an env var (or the value in `apps/api/.env`, which pydantic-settings reads) wins — and then that per-test `TRUNCATE` empties the database you develop against, accounts and catalog included. Run the DB-backed tests against a dedicated database instead: `docker compose exec db psql -U lulu -d postgres -c 'CREATE DATABASE lulu_test'` once, then `DATABASE_URL='postgresql+asyncpg://lulu:lulu@localhost:5432/lulu_test' uv run alembic upgrade head` and prefix `uv run pytest` with that same `DATABASE_URL`.

**Docker**: `apps/api/Dockerfile` is a multi-stage `uv`-based build (builder → runtime, non-root user), invoked with **`apps/api` itself** as the build context (`docker-compose.yml` sets `build.context: apps/api`) — unlike the frontend apps, it has no dependency on anything else in the monorepo.

### `apps/website`

Next.js 16 app (`src/pages` — Pages Router), talking to `apps/api` — **not** WordPress. A few `.env.example` vars (`NEXT_PUBLIC_WP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `FALLBACK_BASE_URL`, reCAPTCHA, GTM/UA ids) are leftovers from an earlier WordPress-backed prototype; they're still read into the config module but not consumed anywhere in the codebase — don't take their presence as evidence of a live WordPress integration.

> ⚠️ **`src/сonfig.ts` is spelled with a Cyrillic `с` (U+0441)**, and so is its import specifier `@/сonfig`. Typing an ASCII `c` gives an unresolved module. Copy the path from an existing import rather than typing it.

- **Pages**: public, SSG+ISR — `index.tsx` (home), `catalog/index.tsx` + `catalog/[slug].tsx`; client-rendered, behind login — `cart.tsx`, `checkout.tsx`, `orders/*`, `account.tsx`, `wishlist.tsx`; auth — `login.tsx` **only** (it is the registration too); owner-only, static and gated on the client — `admin/*` (`products/index|add|[id]`, `categories`, `import`, `cycles`, `orders`, `users` — roles/access); `404.tsx`/`500.tsx`. There is no `getServerSideProps` anywhere in the app: every page is static, which is why `next build` reports `/admin/*` as `○ (Static)`.
- **Auth / token handling**: JWTs never reach the browser.
  - `src/server/cookies.ts` — the `lb_at`/`lb_rt` httpOnly cookies (`SameSite=Lax`, `Secure` unless `AUTH_COOKIE_SECURE=false`), plus `lb_ls` — the in-flight login's polling secret. That secret is deliberately *not* the payload in the `t.me/…?start=` link: the link is visible in the Telegram chat, so polling on it would let anyone who sees the chat claim the confirmed sign-in.
  - `src/server/apiFetch.ts` — `fetchWithAuth` attaches `Authorization: Bearer` and refreshes **proactively** by decoding the access token's `exp` (30s skew) before sending, falling back to a one-shot refresh-and-retry on `401`. Streamed request bodies are `retryable: false` (a stream can only be read once) — the proactive refresh is what covers uploads.
  - `pages/api/auth/*` — thin proxies to `apps/api`'s `/auth/*` that set/clear those cookies (`telegram/session` opens a sign-in, `telegram/poll` claims it, `telegram/widget` and `telegram/mini-app` trade a Telegram signature for the same cookies, plus `me`/`refresh`/`logout`). The catch-all proxy explicitly **404s `/auth/*`**, so token pairs can't leak to the browser through it.
  - `pages/api/proxy/[...path].ts` — the only route through which the browser reaches the API. Transparent, `bodyParser: false` (image uploads and catalog import stream through without buffering), forwards a fixed allowlist of request/response headers.
  - `src/server/clientAddress.ts` — `clientHeaders(req)` **sets** the `X-Forwarded-For` the API's limiter keys anonymous callers on. Without it every visitor arrives as the proxy's single address and one impatient guest would throttle the whole shop. An *incoming* `x-forwarded-for` is only believed when `TRUST_PROXY_HEADERS=true` (a real load balancer in front of Next); otherwise the connection address is used, since the browser can set that header itself. Every server-side call to the API goes through `apiFetch`/`telegramSignIn`/the `auth/*` routes, which all pass these headers.
  - `src/hooks/useAdminGate.ts` — the `/admin/*` gate, on the **client**; guests redirect to `/login?next=…` (path validated by `src/utils/redirect.ts` — only single-slash relative paths survive), customers to `/catalog`. It used to be a `requireAdmin(context)` in `getServerSideProps`, and that cost a full round-trip on every click into the section; the pages are static now and open instantly. This does not expose data — every admin endpoint on the API checks the ADMIN role independently — but it does mean the admin **chunks** are publicly fetchable, so treat the section's UI structure as public and never put a secret in it. `AdminShell` renders neither navigation nor content until the session is known, so a customer never sees the frame of a section they can't enter.
- **Data layer** (client): [SWR](https://swr.vercel.app/), configured globally in `_app.tsx` with `revalidateOnFocus: false`.
  - `src/services/api.ts` — a thin `fetch` client with two targets. `api` resolves to `/api/proxy` in the browser and to `serverConfig('apiBaseUrl')` (direct, **anonymous**) on the server, so `getStaticProps` can only fetch public data. `nextApi` hits `/api/*` and throws if called server-side.
  - `src/services/endpoints/*` — one module per domain (`catalog`, `auth`, `cart`, `wishlist`, `orders`, `admin`, `cycles`, `export`); all API calls go through these, never raw `fetch` in a page.
  - `src/services/swrKeys.ts` — **every** SWR key is defined here as a tuple tagged with a string first element. Add new keys here rather than inlining strings; tags exist so all filter/page variants can be invalidated at once (`mutate(key => Array.isArray(key) && key[0] === 'admin-products')`).
  - `src/services/apiErrors.ts` — `ApiError { status, code, fields }` plus the machine-code → Russian-message table. The backend emits codes only, so **every new `HTTPException` detail on the API needs a matching entry here**; UI branches on `error.code`, never on the message text. 422 bodies are unpacked into `fields` for per-input errors.
- `src/contexts/AuthContext.tsx` / `CartContext.tsx` — app-level state, both backed by SWR (`/api/auth/me` returning 401 means "guest", not an error).
- `src/layouts/` — `SiteLayout` / `AdminShell` wrap the `widgets` templates with site-specific navigation.
- **Security headers** live in `next.config.js` `headers()`. Two CSPs on purpose: a short **enforced** one (`base-uri`/`form-action`/`object-src`/`frame-ancestors`) and a full **`Content-Security-Policy-Report-Only`** that is not enforced yet — the pages are static, so there is no per-request nonce, and `script-src` still needs `'unsafe-inline'` for Next's own inline script. Read the reports before promoting it. `X-Frame-Options` is deliberately absent: it cannot express "allow Telegram only", which `frame-ancestors` does — the site runs as a Mini App inside `web.telegram.org`. Adding any third-party script, iframe, or API host means editing that policy, or it will silently break in the browser.
- `transpilePackages: ['widgets']` — the widgets package is consumed as TS/JSX source, not prebuilt.
- vanilla-extract and bundle-analyzer plugins are wired in via `next-compose-plugins`. The analyzer only activates on `ANALYZE=true` (`npm run analyze -w website`), so ordinary `build`/`dev` don't pay for it; it writes `client.html`/`nodejs.html`/`edge.html` into `.next/analyze/` (gitignored) — `client.html` is the one worth opening. It reports **uncompressed** bytes by default; switch it to the gzip column before comparing against any budget.
- SVGs are handled via `@svgr/webpack` + `url-loader`.
- `rewrites()` proxies `/files/:path*` to `${API_BASE_URL}/files/:path*` so product images served by `apps/api`'s local storage are same-origin — needed because Next 16's image optimizer refuses hosts that resolve to a private IP. `src/components/Image.tsx` rewrites the API's absolute URLs to those relative ones.
- Env vars are documented in `apps/website/.env.example`: `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL` (browser- vs. server-side base URL for `apps/api`; inside `docker compose` the latter is `http://api:3001`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `AUTH_COOKIE_SECURE` (set `false` for local http so `lb_at`/`lb_rt` aren't dropped).

## Conventions

- Keep API/data-fetching logic and cross-cutting concerns (e.g. analytics) out of `widgets` — that package is strictly the visual component library. Website-specific/API logic lives in `apps/website`.
- ESLint requires explicit return types on functions (`@typescript-eslint/explicit-function-return-type`), with expressions and const-assertion arrow functions exempted.
- Interfaces are prefixed `I` (`IProduct`, `IApiClient`) across both JS packages.
- **Building new UI**: don't hand-roll markup/CSS from scratch. Use the shadcn MCP server (registered in `.mcp.json`) to look up a real, production-quality reference implementation first — `shadcn` for general components, the built-in `@magicui` namespace (e.g. `@magicui/globe`) for motion/animated ones. Treat the fetched source as a **structural/behavioral reference only**: this repo has no Tailwind CSS and no shadcn/Radix runtime installed (`packages/widgets` is vanilla-extract-only, see below) — hand-port the markup structure and behavior into a proper `widgets` atom/molecule/organism (scaffolded via `npm run generate -w widgets`), rewriting all styling in vanilla-extract. Never install shadcn/Magic UI components directly via `shadcn add`/`npx @magicuidesign/cli` into this repo, and never introduce Tailwind as a second styling system alongside vanilla-extract.
- **Animation**: for fade/slide/stagger/etc. patterns, use the `motion` skill (`.claude/skills/motion/`, invoke as `/motion`) and the `motion` MCP server (registered in `.mcp.json`, free/no-account, docs+example search at `https://mcp.motion.dev`) rather than guessing timing/easing values. `best-practices/` under the skill works fully offline even if the MCP server is unreachable. The library itself (formerly Framer Motion, now `motion`) **is installed** in `packages/widgets` (`npm install motion -w widgets` if it's ever missing) and already used by several components (`Appear`, `Alert`, `MobileMenu`, `ToastViewport`, `Modal`/`ConfirmDialog`) — always import from `motion/react`, never the deprecated `framer-motion` package; shared timings/easings live in `src/utils/motion.ts`, reuse them instead of inlining new values. The `motion-plus` server (Motion+ paid tier: MotionScore audits, gated example source) is intentionally **not** registered — same reasoning as skipping AI Designer MCP, no account to wire up.
