# Development setup and commands

## First-time setup

```bash
nvm use                                        # Node 22.23.1, pinned in .nvmrc
cp apps/website/.env.example apps/website/.env
cp apps/api/.env.example apps/api/.env         # required before running the api at all
npm ci
```

`apps/api/.env` is required even for Docker: the `api` service's `env_file` points at it.
`DATABASE_URL` there targets `localhost` for local dev, while the containerized `api` service
overrides it to the `db` hostname. Variable reference: [environment.md](environment.md).

For the Python side, from `apps/api`:

```bash
uv sync
```

## Starting things

All from the repo root:

| Command | Starts | Ports |
| --- | --- | --- |
| `npm run dev:web` | frontend only (`npm run dev -w website`) | 3000 |
| `npm run dev:api` | backend in the foreground with logs (`docker compose up api`; `db` comes up via `depends_on`) | 3001, 5432 |
| `npm run dev:storybook` | Storybook for `packages/widgets` | 6006 |
| `npm run dev:all` | backend detached + frontend in the foreground | 3000, 3001 |
| `npm run dev:api:stop` | `docker compose stop` — the off-switch for whatever `dev:api`/`dev:all` left running | — |
| `npm run dev` | turbo `dev` across JS workspaces, i.e. the frontend alone | 3000 |

Two things worth knowing:

- **`npm run dev` is deliberately not an alias for `dev:all`.** CI and muscle memory rely on
  it staying frontend-only. Start the api separately.
- **`dev:all` starts the api with `-d` on purpose**: no `concurrently`/`npm-run-all` is
  installed and two foreground processes can't share one npm script. Consequence: `Ctrl+C`
  kills only the frontend and the containers keep running — stop them with
  `npm run dev:api:stop`.
- None of these pass `--build`, so a rebuild isn't paid for on every start. After changing
  `apps/api/Dockerfile` or its dependencies, run `docker compose up --build api` manually.

Running the api outside Docker, from `apps/api` (needs a Postgres reachable per
`DATABASE_URL`):

```bash
uv run uvicorn app.main:app --reload --port 3001
curl http://localhost:3001/health     # verifies live DB connectivity, 503 if unreachable
```

## Checks

| Command | Covers |
| --- | --- |
| `npm run check` | `tsc --noEmit` + eslint across `website` and `widgets` (via turbo) |
| `npm run lint` | eslint only |
| `npm test` | each JS workspace's `test` script — `vitest run` in `widgets` |
| `npm run format` | Prettier across the repo |
| `npm run barrels` | regenerate the auto-generated `index.ts` barrels |

**None of these cover `apps/api`.** From `apps/api`:

```bash
uv run ruff check .
uv run mypy app
uv run pytest          # read docs/testing.md before pointing this at a database
```

Single-workspace variants: `npm run build -w website`, `npm start -w website`,
`npm run types -w widgets`, `npm run check -w widgets`.

## Databases and data

```bash
docker compose up --build          # db + api, migrations run on start
docker compose down                # tear down (keeps the uploads volume)
docker compose exec db psql -U lulu -d lulu
```

Product images live in the named `uploads` volume. **Don't `docker compose down -v`** unless
you intend to orphan the `product_images` rows still in the database.

Seeding:

```bash
cd apps/api
uv run python -m app.scripts.seed          # the first ADMIN owner, from OWNER_* env vars
uv run python -m app.scripts.seed_catalog  # sample catalog data
```

## Migrations

```bash
cd apps/api
uv run alembic revision --autogenerate -m "add x"   # then read and commit the generated file
uv run alembic upgrade head
```

The Docker image only runs `alembic upgrade head`; it never generates. A new model must be
imported in `app/models.py` first or autogenerate silently misses its table.

## Branches

`development` is the default branch and where work lands. `master` is what production runs:
release merges only, direct pushes blocked, both CI workflows required to pass. Releases are
tagged `vYYYY.MM.DD` on the merge commit and deployed by tag.

## CI

- `.github/workflows/node.js.yml` — `npm ci` → `npm run check` → `npm test`.
- `.github/workflows/api.yml` — `ruff` → `mypy` → `alembic upgrade head` → `pytest` against a
  real Postgres service.

Both run on `development`, `master` and `staging`.

## Deployment

See [deployment.md](deployment.md) (Russian): Caddy + Docker Compose on a single VPS, with
backup, restore and release scripts under `deploy/`. Production is deployed by tag with
`deploy/release.sh`; the migration rule that keeps rollback safe is in
[backend.md](backend.md#migrations).
