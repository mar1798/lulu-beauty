# Environment variables

Three files, three audiences:

| File | Read by | Copy to |
| --- | --- | --- |
| `apps/api/.env.example` | the API (pydantic-settings) and the dev `db`/`api` compose services | `apps/api/.env` |
| `apps/website/.env.example` | the Next server and its build | `apps/website/.env` |
| `deploy/.env.prod.example` | the whole prod stack | `.env.prod` at the repo root (gitignored) |

## `apps/api`

`app/config.py::Settings` is instantiated **at import time**. Fields marked *required* have no
default, so importing `app.*` without them fails immediately — which is why
`tests/conftest.py` and `.github/workflows/api.yml` both seed placeholders.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *required* | `postgresql+asyncpg://…`. `localhost` locally; the compose `api` service overrides it to the `db` hostname. |
| `PORT` | `3001` | |
| `ENVIRONMENT` | `development` | `development` / `test` / `production`. |
| `CORS_ORIGIN` | `http://localhost:3000` | A security boundary. |
| `WEBSITE_BASE_URL` | `http://localhost:3000` | Where the bot's link buttons point. Kept separate from `CORS_ORIGIN` on purpose — the day a CDN appears they stop being the same string. Telegram rejects `localhost` url buttons, so those buttons are omitted locally. |
| `JWT_ACCESS_SECRET` | *required* | `openssl rand -hex 32`. |
| `JWT_ACCESS_TTL_SECONDS` | `900` | |
| `JWT_REFRESH_SECRET` | *required* | |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` | 30 days. |
| `AUTH_SESSION_TTL_SECONDS` | `300` | Life of an in-flight Telegram sign-in. |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `10` / `10` | One worker serves the shop, the bot and the scheduler off this pool. Kept well under Postgres' default 100. |
| `TELEGRAM_BOT_TOKEN` | *required* | From @BotFather. The whole secret behind widget/Mini App signatures. |
| `TELEGRAM_BOT_USERNAME` | *required* | Without the `@`. |
| `TELEGRAM_USE_WEBHOOK` | `false` | Needs all three webhook vars; falls back to polling otherwise. |
| `TELEGRAM_WEBHOOK_URL` | `""` | The API's public base; `/telegram/webhook` is appended. |
| `TELEGRAM_WEBHOOK_SECRET` | `""` | Without it the endpoint accepts updates from anyone who guesses the path, and the bot refuses the mode. |
| `OWNER_PHONE` | *required* | Bootstraps the first ADMIN via `app.scripts.seed`. Normalized to E.164 by the script. |
| `OWNER_NAME` | *required* | |
| `CYCLE_TIMEZONE` | `Asia/Bishkek` | |
| `CURRENCY` | `KGS` | Appears in xlsx export headers. |
| `STORAGE_DRIVER` | `local` | Only `local` exists. |
| `UPLOAD_DIR` | `./uploads` | Mounted as a named volume in Docker. |
| `PUBLIC_FILES_BASE_URL` | `http://localhost:3001/files` | Absolute URLs the API returns for images; the website rewrites them to relative. |
| `SCHEDULER_ENABLED` | `true` | Set `false` to disable all sweeps. |
| `SCHEDULER_INTERVAL_SECONDS` | `300` | Interval for all three jobs. |
| `RATE_LIMIT_ENABLED` | `true` | |
| `RATE_LIMIT_PER_MINUTE` | `300` | Sized for a catalog page plus its images. |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `20` | `/auth/` prefix — the only anonymous surface that writes rows. |
| `RATE_LIMIT_TRUST_FORWARDED_FOR` | `true` | Correct while the API is only reachable through the website's proxy. **Turn it off if the API is exposed directly** — the header is then attacker-chosen, i.e. an unlimited supply of identities. |

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` also live in this file, but they are read
by the compose `db` service to initialize Postgres, not by `Settings`.

## `apps/website`

Read through `src/сonfig.ts` (**Cyrillic `с`**). `publicConfig` values must be `NEXT_PUBLIC_*`
to be inlined into the client bundle; `serverConfig` values throw when read in the browser.

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | The API as the **browser** sees it. Used for `/files/*` images; private requests go through `/api/proxy/*`. |
| `API_BASE_URL` | `http://localhost:3001` | The API as the **Next server** sees it (`getStaticProps`, `/api/*`). Inside compose: `http://api:3001`. |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | `""` | Without the `@`. The bot link must be clean (`https://t.me/<username>`, no `?start=`) or the bot's exact `/start` match sends it to the fallback handler. |
| `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` | `false` | Show the Login Widget on `/login`. Only works on the domain registered with `/setdomain` in BotFather — elsewhere the button renders and then refuses, which is worse than absent. |
| `AUTH_COOKIE_SECURE` | `true` | Set `false` for local http, or `lb_at`/`lb_rt` are dropped. |
| `TRUST_PROXY_HEADERS` | `false` | Believe an incoming `x-forwarded-for` when identifying the visitor for the API's limiter. On **only** if a real load balancer sits in front of Next; otherwise the browser sets it itself. |
| `NEXT_DEV_ORIGINS` | *(unset)* | Comma-separated extra hosts allowed to fetch `/_next/*` in dev, appended to the private-network patterns in `next.config.js`. Needed for tunnels (ngrok and friends) — without it the dev page silently reloads itself about every 90 seconds. Dev only. |
| `ANALYZE` | *(unset)* | `true` enables `@next/bundle-analyzer` (`npm run analyze -w website`). |

Leftovers from an earlier WordPress-backed prototype, still read into the config module but
consumed nowhere: `NEXT_PUBLIC_WP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `FALLBACK_BASE_URL`,
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_UA_ID`. Don't take their
presence as evidence of a live integration.

## Production (`.env.prod`)

`deploy/.env.prod.example` is the template. It carries the API set above plus:

| Variable | Notes |
| --- | --- |
| `SITE_DOMAIN` | The domain Caddy issues a certificate for. Compose fails fast without it. |
| `ACME_EMAIL` | Where Let's Encrypt sends expiry warnings. Also required. |

Values the prod compose file sets itself, so they do **not** belong in `.env.prod`:
`DATABASE_URL` (always the `db` service), `API_BASE_URL: http://api:3001`,
`AUTH_COOKIE_SECURE: true`, `TRUST_PROXY_HEADERS: true`, and the website's build args
`NEXT_PUBLIC_API_BASE_URL: https://${SITE_DOMAIN}`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
`NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET`.

Note that `NEXT_PUBLIC_*` values are baked in **at build time** — changing one requires
rebuilding the website image, not just restarting it. Full procedure:
[deployment.md](deployment.md).

## Tests

`tests/conftest.py` only `setdefault`s `DATABASE_URL`, so an env var — or the value in
`apps/api/.env`, which pydantic-settings reads — wins. See the warning in
[testing.md](testing.md).
