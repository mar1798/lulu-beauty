# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file is the short operating manual: hard rules, the map of the repo, the commands, and
the traps that bite most often. **Detail lives in [`docs/`](docs/README.md)** — read the
relevant document before working in an area rather than inferring from a few files.

## Git

Committing and pushing are allowed **when asked** — `/commit` groups the working tree into
separate commits and pushes the current branch. Nothing is committed on Claude's own
initiative, and existing history is not rewritten (`--amend`, `--force`, a rebase over
pushed commits) unless the user asks for exactly that.

Work happens on **`development`**. **`master` is what production runs** — release merges
only, direct pushes blocked on GitHub. On `master`, don't commit: say so and offer to move
the changes to `development`. Releases are a merge into `master`, which CI tags `vYYYY.MM.DD`
by itself, and then `deploy/release.sh <tag>` on the server — "Releases" in
[docs/deployment.md](docs/deployment.md).
A release carries **only expanding migrations** (see [docs/backend.md](docs/backend.md)):
production never runs `alembic downgrade`, so a dropped column makes the rollback path
a restore from backup.

Read-only git needs no asking: `git status`, `git diff`, `git log`, `git show`,
`git blame`.

## Documentation map

| Document                                     | Read before                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md) | Anything cross-cutting: topology, request flow, why the packages are split.            |
| [docs/domain.md](docs/domain.md)             | Touching business rules — cycles, cart, orders, statuses, roles, money, limits.        |
| [docs/backend.md](docs/backend.md)           | Working in `apps/api`: layout, endpoints, patterns, error codes, migrations.           |
| [docs/frontend.md](docs/frontend.md)         | Working in `apps/website`: pages, auth cookies, the proxy, SWR, security headers.      |
| [docs/widgets.md](docs/widgets.md)           | Working in `packages/widgets`: tiers, vanilla-extract, tokens, barrels, Storybook.     |
| [docs/telegram.md](docs/telegram.md)         | Touching sign-in, the bot, or any notification.                                        |
| [docs/conventions.md](docs/conventions.md)   | Writing any code — language rule, naming, lint, how new UI may be built.               |
| [docs/recipes.md](docs/recipes.md)           | Any change that crosses packages ("new endpoint", "new error code", "new widget").     |
| [docs/gotchas.md](docs/gotchas.md)           | Something behaves impossibly.                                                          |
| [docs/development.md](docs/development.md)   | Setup, dev servers, ports, checks.                                                     |
| [docs/environment.md](docs/environment.md)   | Adding, renaming or debugging an env var.                                              |
| [docs/testing.md](docs/testing.md)           | Writing or running tests — **always** before pointing pytest at a database.            |
| [docs/deployment.md](docs/deployment.md)     | Deploying, operating and releasing: server setup, the prod stack, backups, monitoring. |

## Repository overview

Turborepo monorepo for the Sululu online catalog/ordering platform. No payments —
customers submit requests (заявки) before a deadline, and the owner fulfills them offline.

- `apps/website` — Next.js 16 (Pages Router) site: public catalog/product/cart/checkout/
  wishlist, Telegram-only auth (no password, no code — the bot confirms a waiting tab),
  customer account/orders, and the owner-only `/admin/*` section. Consumes `widgets`.
- `apps/api` — Python + FastAPI + PostgreSQL backend (auth, catalog + xlsx/csv import, cart,
  orders, order cycles/deadlines, a Telegram bot, xlsx export), using `uv` and SQLAlchemy
  (async) + Alembic. **Not** an npm workspace — no `package.json`, excluded from Turborepo and
  `npm run *`; manage it with `uv`/Docker.
- `packages/widgets` — React component library (atoms → templates) styled with
  vanilla-extract, developed and tested in Storybook.

The JS side uses **npm** (`packageManager: npm@10.9.0`, committed `package-lock.json`, CI runs
`npm ci`) on Node 22.23.1 (pinned in `engines` and `.nvmrc`). Never pnpm/yarn.

## Language convention

Not obvious from any single file, and easy to break:

- All user-facing copy is **Russian** — UI strings, Telegram bot messages, xlsx export
  headers, import error text.
- Comments and docstrings in `apps/website` and `packages/widgets` are **Russian** (essentially
  every file). Match that when editing those packages.
- Comments and docstrings in `apps/api` are **English**; only user-facing strings there are
  Russian (`telegram/messages.py`, `export/service.py`, `catalog/import_service.py`,
  `orders/service.py`).
- `docs/`, this file and `README.md` are **English** — all of them, `docs/deployment.md`
  included (it used to be the one Russian document).
- **Commit messages are English.** History before September 2026 is Russian; match the new
  language, not the old commits, and keep the `Area: what changed` shape either way.
- The scripts under `deploy/` are **English** too, comments and printed output alike. Their
  output is what an operator reads at three in the morning, so keep the wording plain and
  say what failed, not that something did.

## Commands

Run from the repo root unless noted. Workspace-scoped commands use `-w <workspace>`.

| Command           | Does                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`   | `tsc --noEmit` + eslint across `website` and `widgets`. **Run before finishing any change touching them.** Does not cover `apps/api`. |
| `npm test`        | each JS workspace's tests (`vitest run` in `widgets`). Not `apps/api`.                                                                |
| `npm run lint`    | eslint only.                                                                                                                          |
| `npm run barrels` | regenerate the auto-generated `index.ts` barrels.                                                                                     |
| `npm run format`  | Prettier across the repo.                                                                                                             |

Dev servers:

| Command                 | Starts                                                                                         | Ports      |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `npm run dev:web`       | frontend only                                                                                  | 3000       |
| `npm run dev:api`       | backend in the foreground (`docker compose up api`; `db` via `depends_on`)                     | 3001, 5432 |
| `npm run dev:storybook` | Storybook for `widgets`                                                                        | 6006       |
| `npm run dev:all`       | backend detached + frontend in the foreground                                                  | 3000, 3001 |
| `npm run dev:api:stop`  | `docker compose stop`                                                                          | —          |
| `npm run dev`           | turbo `dev` across JS workspaces — the frontend alone, deliberately not an alias for `dev:all` | 3000       |

- `dev:all` starts the api with `-d` **on purpose** (no `concurrently` installed, and two
  foreground processes can't share one npm script), so `Ctrl+C` kills only the frontend —
  stop the containers with `npm run dev:api:stop`.
- None of these pass `--build`. After changing `apps/api/Dockerfile` or its dependencies, run
  `docker compose up --build api` manually.

`website`'s `dev`/`build` pass `--webpack` explicitly — Next 16 defaults to Turbopack, but the
vanilla-extract plugin here is the webpack one. **Don't drop that flag.**

Widgets (`-w widgets`): `npm run generate` scaffolds an atom/molecule/organism and rebuilds
barrels — **always use it instead of hand-creating a component folder**; `npm run storybook`
is the primary dev loop; `npm run types` is `tsc --noEmit`. Single test:
`cd packages/widgets && npx vitest run <path>`.

Backend (from `apps/api`, `uv` not npm):

```bash
cp apps/api/.env.example apps/api/.env    # required before running the api at all
uv sync
uv run uvicorn app.main:app --reload --port 3001
uv run pytest / uv run ruff check . / uv run mypy app   # all three before finishing a change
uv run alembic revision --autogenerate -m "…" / uv run alembic upgrade head
uv run python -m app.scripts.seed          # upserts the SUPER_ADMIN owner from OWNER_* vars
curl http://localhost:3001/health          # real DB check; 503 if the database is unreachable
```

`docker compose up --build` from the root brings up `db` + `api` (migrations run on start).
Product image uploads live in the named `uploads` volume — don't `down -v` unless you intend
to orphan the `product_images` rows.

CI runs `.github/workflows/node.js.yml` (`npm ci` → `npm run check` → `npm test`) and
`.github/workflows/api.yml` (ruff → mypy → `alembic upgrade head` → pytest against a real
Postgres), on pushes to `development`/`staging` and on nothing else — a `pull_request`
trigger would re-check the same commit on every push while the release PR is open, and
`master`'s required checks are satisfied by the push's run anyway.

## Rules that hold everywhere

- **`widgets` is the visual layer only.** No API/data-fetching logic, no analytics, and never
  an import from `next/*` — adapters (`Link`, `Image`) arrive through `ServicesContext`, and a
  `next/*` import breaks Storybook. Website-specific logic lives in `apps/website`.
- **Errors are machine codes.** The API raises `HTTPException(status, "<snake_case_code>")`;
  the Russian text lives in `apps/website/src/services/apiErrors.ts`, chosen by code **+
  scope**. Every new code needs an entry there, and UI branches on `error.code`, never on text.
- **Services take an `AsyncSession`, mutate, and do not commit.** The caller owns the
  transaction; notifications fire _after_ the commit.
- **Every new SQLAlchemy model is imported in `app/models.py`**, or Alembic autogenerate
  silently misses its table.
- **All API calls on the frontend go through `src/services/endpoints/*`**, and every SWR key is
  declared in `src/services/swrKeys.ts`.
- **Money is integer `*_cents`.** Products are soft-deleted. A price change rewrites every
  still-PENDING order, so copy says "snapshot as of confirmation", not "as of checkout".
- **Explicit return types** are required in TS (`@typescript-eslint/explicit-function-return-type`,
  expressions exempt); interfaces are prefixed `I`. Python is `mypy --strict` clean.

## Traps worth knowing up front

Full list: [docs/gotchas.md](docs/gotchas.md).

> ⚠️ **`apps/website/src/сonfig.ts` is spelled with a Cyrillic `с` (U+0441)**, and so is its
> import specifier `@/сonfig`. An ASCII `c` gives an unresolved module. Copy the path from an
> existing import rather than typing it.

> ⚠️ **Never point the API test suite at your dev database.** `tests/conftest.py` only
> `setdefault`s `DATABASE_URL`, so an env var — or the value in `apps/api/.env` — wins, and the
> fixture `TRUNCATE`s every table per test. Use a dedicated database:
> `docker compose exec db psql -U lulu -d postgres -c 'CREATE DATABASE lulu_test'`, then
> `DATABASE_URL='postgresql+asyncpg://lulu:lulu@localhost:5432/lulu_test'` for both
> `alembic upgrade head` and `uv run pytest`. The DB-backed tests under `tests/integration/`
> **skip themselves** when Postgres is unreachable, so a green local run may have run none.

- Barrel `index.ts` files are generated — run `npm run barrels`, never hand-edit them.
- `themes/tokens.ts` imports `../lib/rem`/`../lib/shadow` **directly, never via the `lib`
  barrel** (that closes an initialization cycle through `color.ts` → `contract.css.ts`).
- Query-parameter casing is inconsistent by accident: public `GET /products` takes
  `in_stock`/`page_size`, admin `GET /admin/products` takes `inStock`/`pageSize`/
  `includeDeleted`. Check the router before adding a param on the frontend.
- Admin pages are static and gated on the **client** (`useAdminGate`); authorization is on the
  API. The admin chunks are publicly fetchable — never put a secret in that UI.
- Adding any third-party script, iframe or API host means editing the CSP in
  `next.config.js`, or it silently breaks in the browser.

## Building new UI

Don't hand-roll markup/CSS from scratch. Use the **shadcn MCP server** (registered in
`.mcp.json`) to look up a real reference implementation first — `shadcn` for general
components, the built-in `@magicui` namespace for motion/animated ones. Treat the fetched
source as a **structural/behavioral reference only**: this repo has no Tailwind and no
shadcn/Radix runtime (`packages/widgets` is vanilla-extract-only). Hand-port the markup and
behavior into a proper `widgets` atom/molecule/organism (scaffolded via
`npm run generate -w widgets`), rewriting all styling in vanilla-extract. Never run
`shadcn add`/`npx @magicuidesign/cli` into this repo, and never introduce Tailwind as a second
styling system.

**Animation**: use the `motion` skill (invoke as `/motion`, if it is installed under
`.claude/skills/` on this machine — `.claude/` is git-ignored, so the skill is per-machine
and not shipped with the repo) and the `motion` MCP server (`https://mcp.motion.dev`) rather
than guessing timing/easing values; `best-practices/` under the skill works offline. The library **is installed** in
`packages/widgets` and used by `Appear`, `Alert`, `MobileMenu`, `ToastViewport`, `Modal` and
`ConfirmDialog` — always import from `motion/react`, never the deprecated `framer-motion`, and
reuse the shared timings in `src/utils/motion.ts`. The paid `motion-plus` server is
intentionally not registered.

## Keeping the docs honest

When a change invalidates something under `docs/`, update that document in the same change —
[docs/recipes.md](docs/recipes.md) names the document each kind of change touches. A
documentation file that lies is worse than a missing one, because it is trusted.
