# Lulu beauty repository

Lulu Beauty is an online catalog/ordering platform — customers browse a product catalog, add items to a cart, and submit a request before an owner-defined deadline (there is no online payment; the owner fulfills requests offline and exports them to Excel). This is a Turborepo monorepo containing the frontend, the UI component library it's built from, and the backend API.

## Apps and packages

- `apps/website`: Next.js 16 app (Pages Router) that renders the site — public catalog, cart/checkout, customer account, and the owner-only `/admin/*` section. Built from `widgets`.
- `apps/api`: FastAPI + SQLAlchemy/Alembic + PostgreSQL backend (managed with `uv`), runs via Docker. **Not** an npm workspace — it has no `package.json` and is excluded from Turborepo.
- `packages/widgets`: UI component library (React + vanilla-extract), developed in Storybook.

The JS side uses **npm** on Node 22.23.1 (pinned in `engines` and `.nvmrc`); `apps/api` uses `uv`.

## Getting started

Copy the env files first — each app documents its own variables in `.env.example`:

```bash
cp apps/website/.env.example apps/website/.env
cp apps/api/.env.example apps/api/.env
npm ci
```

Then start what you need (all commands run from the repo root):

| Command | Starts | Ports |
| --- | --- | --- |
| `npm run dev:web` | frontend only | 3000 |
| `npm run dev:api` | backend + database in Docker, logs in the foreground | 3001, 5432 |
| `npm run dev:all` | backend detached + frontend in the foreground | 3000, 3001 |
| `npm run dev:storybook` | Storybook for `widgets` | 6006 |
| `npm run dev:api:stop` | stops the containers `dev:api`/`dev:all` started | — |

`dev:all` runs the api with `-d`, so `Ctrl+C` only stops the frontend — use `npm run dev:api:stop` for the containers. None of these rebuild the api image; after changing `apps/api/Dockerfile` run `docker compose up --build api`.

## Checks

Before pushing:

- `npm run check` — types + lint for `website`/`widgets`.
- `npm test` — tests for the JS workspaces (vitest in `widgets`).
- for `apps/api` changes, also run `uv run pytest && uv run ruff check . && uv run mypy app` from `apps/api` — it's a separate Python project, not covered by `npm run check`.

CI runs the same two halves: `.github/workflows/node.js.yml` and `.github/workflows/api.yml`.

## Package `widgets`

A library of React components grouped by the [atomic design principle](https://bradfrost.com/blog/post/atomic-web-design/) — `atoms`, `molecules`, `organisms`, `templates`. Shared styles, themes and style utilities live here too.

Everything is fairly standard except the styling, which uses [vanilla-extract](https://vanilla-extract.style/) — essentially "CSS modules with TypeScript". All `*.css.ts` files are compiled to real CSS at build time; there is no runtime. Shared styles and the utilities for writing them are in `/src/styling`.

The package is framework-independent on purpose: it never imports `next/link` or `next/image`. The website injects those adapters through `ServicesContext`, and Storybook injects its own stubs.

### Folder descriptions

- `/src/contexts` — React contexts
- `/src/hooks` — custom React hooks
- `/src/svg` — icons
- `/src/types.ts` — shared type definitions (those likely to be reused by external packages; preferably JSON-serializable only)
- `/src/utils` — common utilities that don't belong in a more specific directory
- `/src/testing` — utilities for tests and Storybook
- `/tools` — scripts for console utilities (currently the component boilerplate generator, see below)

Many of these folders contain automatically generated `index.ts` barrel files — regenerated after scaffolding a component, or manually with `npm run barrels`. Don't hand-edit them; the generation settings live in [`.barrelsby.json`](https://www.npmjs.com/package/barrelsby).

### Generating component boilerplates

To create a template for an `atom/molecule/organism`, run:

```bash
npm run generate -w widgets
```

Then choose the desired component type and specify its name. This creates a folder with the component file, a Storybook story, and boilerplate for styles and tests. After that, start Storybook and begin developing:

```bash
npm run storybook -w widgets
```

To run the tests, or a single test file:

```bash
npm test -w widgets
cd packages/widgets && npx vitest run src/atoms/button/Button.test.tsx
```

## Website app

Next.js 16 on the Pages Router, consuming `widgets` as TypeScript source (`transpilePackages`). Every page is static (SSG/ISR) — there is no `getServerSideProps` anywhere in the app.

```bash
npm run dev:web              # http://localhost:3000
npm run build -w website
npm run analyze -w website   # bundle report in .next/analyze/client.html
```

Notable pieces:

- **Auth is Telegram-only** — no password and no code to type: the site opens a sign-in session, the bot confirms it, and the tab picks the confirmed session up. JWTs never reach the browser; they live in httpOnly cookies set by the `pages/api/auth/*` routes.
- `pages/api/proxy/[...path].ts` is the only route through which the browser reaches the API, and it deliberately 404s `/auth/*` so token pairs can't leak through it.
- `src/services/endpoints/*` — one module per domain; all API calls go through these, never raw `fetch` in a page. Client-side data fetching uses [SWR](https://swr.vercel.app/).
- `src/services/apiErrors.ts` — the API returns machine-readable error codes, and this table maps them to the Russian messages the UI shows. A new error code on the backend needs an entry here.
- Security headers (including two CSPs, one enforced and one report-only) live in `next.config.js`.

## Api app

FastAPI backend with PostgreSQL (via SQLAlchemy 2.0 async + Alembic migrations), dependencies managed with [uv](https://docs.astral.sh/uv/). Runs in Docker together with its database.

Setup:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up --build
```

This starts a `db` (Postgres) container and an `api` container; migrations run automatically on startup (`alembic upgrade head`). Once it's up:

```bash
curl http://localhost:3001/health
```

should return `{"status":"ok", ...}` — this check verifies a real database connection, not just that the process is running.

To connect to the database directly (e.g. with Beekeeper Studio, TablePlus, psql), use the `POSTGRES_*` values from `apps/api/.env` against `localhost:5432`.

To work on the api outside Docker:

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 3001
uv run pytest        # tests
uv run ruff check .  # lint
uv run mypy app      # type check
```

Migrations and the owner account:

```bash
uv run alembic revision --autogenerate -m "<message>"   # commit the generated file
uv run alembic upgrade head
uv run python -m app.scripts.seed                       # upserts the ADMIN owner from OWNER_* env vars
```

Domain modules under `app/` cover auth, users, catalog (with xlsx/csv import), cart, orders, order cycles/deadlines, the wishlist, the Telegram bot, xlsx export and file storage.

> ⚠️ The DB-backed tests under `tests/integration/` truncate every table between tests, and `DATABASE_URL` from your environment or `.env` wins over the test default — so never point the suite at your dev database. Create a separate one (`lulu_test`), run `alembic upgrade head` against it, and prefix `uv run pytest` with that `DATABASE_URL`. Without a reachable Postgres those tests skip themselves, so a green local run may not have executed them; CI does.

## General

It is important to separate the API interaction logic from the visual component library. Also, specific things unrelated to the website's appearance (such as analytics) should be separated. This is why the code is divided into `website` and `widgets`.

All user-facing copy is in Russian — UI strings, bot messages, xlsx export headers, import errors. Comments and docstrings are Russian in `website`/`widgets` and English in `apps/api`.
