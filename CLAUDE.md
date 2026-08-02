# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Turborepo monorepo for the Lulu Beauty online catalog/ordering platform (no payments — customers submit requests, the owner fulfills them offline).

- `apps/website` — Next.js 15 app that renders the site, consuming `widgets`.
- `apps/api` — Python + FastAPI + PostgreSQL backend, using `uv` for dependency management and SQLAlchemy (async) + Alembic for the DB layer. See `PLAN.md` at the repo root for the full architecture/design and a running `## Done` log of what's implemented so far. **Not** an npm workspace — it has no `package.json` and is excluded from Turborepo/`npm run *` commands; manage it with `uv`/Docker as described below.
- `packages/widgets` — standalone React component library styled with vanilla-extract, developed/tested in isolation via Storybook.

Despite `package.json` declaring `"packageManager": "pnpm@11.9.0"`, the repo actually uses **npm** in practice: there is a committed `package-lock.json`, CI (`.github/workflows/node.js.yml`) runs `npm ci`, and the README's documented commands all use `npm`. Use `npm`, not `pnpm`, when installing or running scripts. This applies to `apps/website` and `packages/widgets` only — `apps/api` is a separate Python project managed with `uv` (see below), not part of the npm workspace.

## Commands

Run from the repo root unless noted. Workspace-scoped commands use `-w <workspace>` (e.g. `-w widgets`).

- `npm run check` — runs `tsc --noEmit` + eslint (via turbo, across all workspaces that define it: `website`, `widgets`). Does **not** cover `apps/api` — run that separately (see Backend-specific below). Run both before finishing any change that touches the relevant app.
- `npm run lint` — eslint only, `website`/`widgets`.
- `npm test` — runs each JS workspace's `test` script (via turbo): `vitest run` for `widgets`. Does not cover `apps/api` — use `uv run pytest` there.
- `npm run barrels` — regenerates the auto-generated `index.ts` barrel files (see below).
- `npm run dev` — turbo dev across JS workspaces (for the website: `next dev`). Start the api separately (`docker compose up --build`, or `uv run uvicorn app.main:app --reload` from `apps/api`).
- `npm run build -w <workspace>` / `npm start -w <workspace>` — build/start a single workspace.

Widgets-specific (run with `-w widgets` or `cd packages/widgets`):
- `npm run generate -w widgets` — scaffolds a new atom/molecule/organism (prompts for type + name), then regenerates barrels. Always use this instead of hand-creating component folders.
- `npm run storybook -w widgets` — starts Storybook on port 6006; this is the primary dev/test loop for widgets.
- `npm run types -w widgets` — `tsc --noEmit` only.

To run a single vitest test file: `npx vitest run <path-to-test>` from `packages/widgets`.

Backend-specific (run with `cd apps/api`; uses `uv`, not npm):
- `docker compose up --build` (from repo root) — brings up `db` (Postgres 16, with healthcheck) and `api` (builds `apps/api/Dockerfile`, runs `alembic upgrade head` on start, then serves on port 3001). `docker compose down` to tear down.
- `cp apps/api/.env.example apps/api/.env` — required before running the api directly (outside Docker) or via compose (the `api` service's `env_file` points at it); `DATABASE_URL` there targets `localhost` for local dev, while the containerized `api` service overrides it to target the `db` hostname.
- `uv sync` — installs dependencies into `apps/api/.venv` per `uv.lock`.
- `uv run uvicorn app.main:app --reload --port 3001` — local dev server (outside Docker; requires Postgres reachable per `DATABASE_URL`).
- `uv run pytest` / `uv run ruff check .` / `uv run mypy app` — tests / lint / type-check. Run all three before finishing any `apps/api` change.
- `uv run alembic revision --autogenerate -m "<message>"` / `uv run alembic upgrade head` — generate and apply migrations; commit generated files under `migrations/versions/` (the Docker image only runs `alembic upgrade head`, it doesn't generate new revisions).
- `curl http://localhost:3001/health` — health check that verifies live DB connectivity (not just process liveness); returns `503` if the database is unreachable.

## Architecture

### `packages/widgets`

Organized by [atomic design](https://bradfrost.com/blog/post/atomic-web-design/): `src/atoms`, `src/molecules`, `src/organisms`, `src/templates` (molecules/organisms/templates don't exist yet — the repo is early-stage). Each component folder is generated via `npm run generate -w widgets`, which scaffolds the component file, a Storybook story, style boilerplate, and a test file from templates in `tools/templates`.

- `src/contexts` — React contexts (e.g. `ServicesContext`).
- `src/hooks` — custom hooks.
- `src/utils` — shared utilities not specific to styling.
- `src/types.ts` — shared, JSON-serializable types intended for consumption by external packages (e.g. `website`).
- `src/svg` — icons.
- `src/testing` — test/Storybook helpers.
- `src/styling` — all shared styling: `lib/` (style-writing utilities like `color.ts`, `media.ts`, `font.ts`, `shadow.ts`), `mixin/` (composable style mixins, e.g. `flex.ts`), `themes/` (theme contract + concrete themes, e.g. `light.css.ts`), plus `global.css.ts`, `preflight.css.ts`, `properties.css.ts`.

**Barrels**: Most `index.ts` files under the directories listed in `.barrelsby.json` (atoms, molecules, organisms, contexts, templates, hooks, utils, styling/lib, styling/mixin) are auto-generated by `barrelsby` — do not hand-edit them; run `npm run barrels` after adding/removing files instead.

**Styling**: uses [vanilla-extract](https://vanilla-extract.style/) — effectively typed CSS Modules with zero runtime. All `*.css.ts` files are compiled to real CSS at build time. New shared style utilities/mixins belong in `src/styling`, not inline in components.

The package is consumed via subpath exports (see `package.json` `exports`/`typesVersions`): `widgets/atoms`, `widgets/molecules`, `widgets/hooks`, `widgets/styling/lib`, `widgets/styling/global.css`, etc. When adding a new public subpath, it must be added to both `exports` and `typesVersions` in `packages/widgets/package.json`.

### `apps/api`

FastAPI backend, PostgreSQL via SQLAlchemy 2.0 (async, `asyncpg` driver) + Alembic migrations. Managed with `uv` (`pyproject.toml` + committed `uv.lock`), fully independent of the npm/Turborepo workspace. Full domain design (auth, cart, orders, order cycles/deadlines, Telegram OTP, catalog import/export) is in `PLAN.md` at the repo root, along with a `## Done` log tracking what's actually been implemented — check that before assuming a module exists.

- `app/main.py` — `create_app()` builds the `FastAPI` instance and mounts routers.
- `app/config.py` — `Settings` (`pydantic-settings`), reads `DATABASE_URL`/`PORT` from the environment/`.env`.
- `app/db.py` — async SQLAlchemy `engine`/`async_sessionmaker`, declarative `Base` (models will subclass this), and a `get_session` FastAPI dependency.
- `app/health/router.py` — `GET /health` runs a real `SELECT 1` against the database and returns `503` if it's unreachable (not just an app-liveness check).
- `alembic.ini` / `migrations/` — Alembic config and migration scripts; `migrations/env.py` reads `DATABASE_URL` from `app.config.settings` rather than a hardcoded URL, and uses `Base.metadata` as `target_metadata` for autogeneration. Commit generated files under `migrations/versions/` — `alembic upgrade head` in the Docker image only applies what's already there, it doesn't generate new revisions.
- `tests/` — `pytest` + `pytest-asyncio` (`asyncio_mode = "auto"`), using `httpx.AsyncClient` against the FastAPI app.

**Docker**: `apps/api/Dockerfile` is a multi-stage `uv`-based build (builder → runtime, non-root user), invoked with **`apps/api` itself** as the build context (`docker-compose.yml` sets `build.context: apps/api`) — unlike the frontend apps, it has no dependency on anything else in the monorepo.

### `apps/website`

Next.js 15 app (`src/pages` — Pages Router). Key points from `next.config.js`:
- `transpilePackages: ['widgets']` — the widgets package is consumed as TS/JSX source, not prebuilt.
- vanilla-extract and bundle-analyzer (`ANALYZE=true npm run build` / `npm run analyze`) plugins are wired in via `next-compose-plugins`.
- SVGs are handled via `@svgr/webpack` + `url-loader`.
- Custom `rewrites()`/`redirects()`/`headers()` handle legacy Yoast sitemap proxying (`/sitemap_index.xml`, `/:sitemap*.xml` → `FALLBACK_BASE_URL`), a `robots.txt` rewrite, and security headers via `next-secure-headers`.
- Env vars are documented in `apps/website/.env.example` (WordPress backend base URL, app URL, reCAPTCHA v3 key, GTM/UA ids, `FALLBACK_BASE_URL` for server-side sitemap proxying — this app fronts a headless WordPress backend).

## Conventions

- Keep API/data-fetching logic and cross-cutting concerns (e.g. analytics) out of `widgets` — that package is strictly the visual component library. Website-specific/API logic lives in `apps/website`.
- ESLint requires explicit return types on functions (`@typescript-eslint/explicit-function-return-type`), with expressions and const-assertion arrow functions exempted.
- **Building new UI**: don't hand-roll markup/CSS from scratch. Use the shadcn MCP server (registered in `.mcp.json`) to look up a real, production-quality reference implementation first — `shadcn` for general components, the built-in `@magicui` namespace (e.g. `@magicui/globe`) for motion/animated ones. Treat the fetched source as a **structural/behavioral reference only**: this repo has no Tailwind CSS and no shadcn/Radix runtime installed (`packages/widgets` is vanilla-extract-only, see below) — hand-port the markup structure and behavior into a proper `widgets` atom/molecule/organism (scaffolded via `npm run generate -w widgets`), rewriting all styling in vanilla-extract. Never install shadcn/Magic UI components directly via `shadcn add`/`npx @magicuidesign/cli` into this repo, and never introduce Tailwind as a second styling system alongside vanilla-extract.
- **Animation**: for fade/slide/stagger/etc. patterns, use the `motion` skill (`.claude/skills/motion/`, invoke as `/motion`) and the `motion` MCP server (registered in `.mcp.json`, free/no-account, docs+example search at `https://mcp.motion.dev`) rather than guessing timing/easing values. `best-practices/` under the skill works fully offline even if the MCP server is unreachable. The library itself (formerly Framer Motion, now `motion`) is **not yet installed** in `packages/widgets` — install it there (`npm install motion -w widgets`) before writing the first animated component, and always import from `motion/react`, never the deprecated `framer-motion` package. The `motion-plus` server (Motion+ paid tier: MotionScore audits, gated example source) is intentionally **not** registered — same reasoning as skipping AI Designer MCP, no account to wire up.
