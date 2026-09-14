# Architecture

Sululu is an online catalog and ordering platform for a single shop. Customers browse a
catalog, fill a cart and submit a **request** (заявка) before an owner-set deadline. There is
**no online payment**: the owner confirms requests, buys the goods, and hands them over
offline. Everything the customer and the owner hear from the system arrives over Telegram.

## Repository layout

```
lulu-beauty/                  Turborepo monorepo (npm workspaces)
├── apps/website              Next.js 16 (Pages Router) — the site + the owner's admin
├── apps/api                  FastAPI + PostgreSQL — all data, the bot, the scheduler
├── packages/widgets          React component library (vanilla-extract) + Storybook
├── deploy/                   Caddyfile, prod env template, backup/restore scripts
├── docs/                     this documentation
├── docker-compose.yml        dev stack: db + api
└── docker-compose.prod.yml   prod stack: db + api + website + caddy
```

`apps/website` and `packages/widgets` are npm workspaces on **npm 10.9.0 / Node 22.23.1**.
`apps/api` is **not** a workspace — it has no `package.json`, is invisible to Turborepo and
`npm run *`, and is managed with `uv`. Anything that says "all workspaces" therefore means
"the two JS ones".

## Runtime topology

```
                    ┌───────────────────────────────────────────┐
 browser ──HTTPS──▶ │ Caddy (prod only, TLS)                    │
                    └───────────────┬───────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │ website (Next, :3000)         │
                    │  · static pages (SSG + ISR)   │
                    │  · /api/auth/*  cookie routes │
                    │  · /api/proxy/* transparent   │
                    │  · /files/*  rewrite → api    │
                    └───────────────┬───────────────┘
                                    │ server-to-server, Bearer JWT
                    ┌───────────────▼───────────────┐        ┌──────────────┐
                    │ api (FastAPI, :3001)          │◀──────▶│ Telegram Bot │
                    │  · REST domain modules        │        │  API         │
                    │  · APScheduler sweeps         │        └──────────────┘
                    │  · local disk for images      │
                    └───────────────┬───────────────┘
                                    │ asyncpg
                            ┌───────▼────────┐
                            │ Postgres 16    │
                            └────────────────┘
```

The browser never talks to the API directly, with one exception: `/files/*` product images,
and even those are same-origin because Next rewrites them (Next 16's image optimizer refuses
hosts resolving to a private IP).

## How a request travels

**Public catalog page.** Built at build time by `getStaticProps` calling the API *anonymously*
(`src/services/api.ts` resolves to `serverConfig('apiBaseUrl')` on the server), revalidated by
ISR. No session is involved, which is why `getStaticProps` can only ever fetch public data.

**Authenticated action** (add to cart, checkout, anything under `/admin`):

1. The page calls a function from `src/services/endpoints/*`, never `fetch` directly.
2. That hits `/api/proxy/<path>` on the Next server — the only route through which the
   browser reaches the API. It streams the body through untouched (`bodyParser: false`) and
   forwards a fixed header allowlist. It **404s `/auth/*`** so token pairs can't leak here.
3. `src/server/apiFetch.ts` attaches `Authorization: Bearer <access token>` read from the
   `lb_at` httpOnly cookie, refreshing proactively when the token's `exp` is within 30s
   (falling back to one refresh-and-retry on a 401).
4. The API authenticates the token, runs the domain service, and returns camelCase JSON or a
   machine-readable error code.

**JWTs never reach the browser.** They live in `lb_at`/`lb_rt` httpOnly cookies set by the
`pages/api/auth/*` routes. See [frontend.md](frontend.md#auth-and-token-handling).

## Why the pieces are split this way

- **`widgets` is framework-independent.** It never imports `next/link` or `next/image`; the
  website injects those adapters through `ServicesContext`, and Storybook injects stubs. Add
  a `next/*` import to `widgets` and Storybook breaks. It also holds no API or analytics
  logic — it is strictly the visual layer.
- **The API owns every rule.** The admin gate on the frontend is a client-side redirect for
  *UX*; every admin endpoint independently checks the role itself (`require_admin`, and
  `require_super_admin` for handing out roles). Admin JS chunks are
  publicly fetchable — treat the admin UI structure as public and never put a secret in it.
- **The API is stateful on purpose.** It runs a permanent scheduler (`app/scheduler.py`) and
  writes product images to a local disk volume, so serverless / scale-to-zero is out. This is
  also why the prod stack is one server with Docker Compose — see [deployment.md](deployment.md).
- **Rate limiting lives in the API but is keyed with the browser's address**, which the Next
  proxy passes down via `X-Forwarded-For` (`src/server/clientAddress.ts`). Without that, every
  visitor arrives as the proxy's single address and one impatient guest throttles the shop.

## Background work

`app/scheduler.py` runs three APScheduler jobs, all on `SCHEDULER_INTERVAL_SECONDS` (default
300s), each re-reading state from the database rather than holding per-cycle timers so a
restart loses nothing:

| Job | What it does |
| --- | --- |
| `reminder_sweep` | Plans deadline nudges (24h and 3h before), sends them, *then* stamps them. |
| `deadline_sweep` | Closes cycles whose deadline passed, rescues carts into wishlists, notifies afterwards. |
| `auth_session_cleanup` | Deletes expired/spent Telegram login sessions and dead refresh tokens. |

Plan → send → stamp is the order on purpose; see [domain.md](domain.md#the-order-cycle) and
[telegram.md](telegram.md#notifications).

## CI

Two independent workflows, both on pushes to `development` / `staging` and on pull
requests into `master`:

- `.github/workflows/node.js.yml` — `npm ci` → `npm run check` (types + lint for `website`
  and `widgets`) → `npm test` (the vitest suites in `widgets`).
- `.github/workflows/api.yml` — `ruff` → `mypy` → `alembic upgrade head` → `pytest`, against a
  real Postgres service (which is what turns the skipped DB tests on).
