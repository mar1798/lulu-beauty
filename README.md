# Lulu beauty repository

Lulu Beauty is an online catalog/ordering platform — customers browse a product catalog, add items to a cart, and submit a request before an owner-defined deadline (there is no online payment; the owner fulfills requests offline and exports them to Excel). This is a Turborepo monorepo containing the frontend, the UI component library it's built from, and the backend API.

See `PLAN.md` at the repo root for the full backend architecture/design and a running `## Done` log of what's actually been implemented so far.

## Packages

- `widgets`: UI component library.

## Apps 

- `website`: an application that uses nextjs, and the widgets package to render the website. 
- `api`: NestJS + Prisma + PostgreSQL backend, runs via Docker.


## Commands

To check the project

```bash
npm run check
```


### ENV Variables:

Each app documents its own env vars in a `.env.example` file — copy it to `.env` before running:

```bash
cp apps/website/.env.example apps/website/.env
cp apps/api/.env.example apps/api/.env
```

## Package `widgets`

Currently, includes React components (organized by folder following the recommendations of [atomic design](https://bradfrost.com/blog/post/atomic-web-design/)).

Commonly used styles and themes are also located here.

Hooks and contexts are also located here.

Creating a new component looks like this:

```bash
npm run generate -w widgets
```

Widget development and testing takes place through [storybook](https://storybook.js.org/)

```bash
npm run storybook -w widgets
```

## Widgets package:

A library of components grouped according to the [atomic design principle](https://bradfrost.com/blog/post/atomic-web-design/). Everything is quite standard except for styling, which uses the [vanilla-extract-css library](https://vanilla-extract.style/).

### Vanilla-extract-css:

In essence, vanilla-extract-css can be considered as "CSS modules with TypeScript." All css.ts files are compiled into CSS during the project build, so this should be taken into account. The library does not have a runtime. All shared styles, as well as utilities for writing styles, are located in the /src/styling folder.

### Folder descriptions:

`/src/contexts` - React contexts

`/src/hooks` - Custom React hooks

`/src/svg` - Icons

`/src/types` - Definitions of shared types (those that are likely to be reused in external packages, preferably include only JSON-serializable types here)

`/src/util` - Set of common utilities that couldn't be categorized into other specific directories

`/src/testing` - Utilities for testing and Storybook

`/tools` - Set of scripts for console utilities (currently used for generating component boilerplates, more on that later)

Many of these folders contain automatically generated index.ts files (they are generated after generating atoms/molecules/organisms, and they can also be generated manually using npm run barrels). The generation settings are stored in [.barrels.json files](https://www.npmjs.com/package/barrelsby). This also applies to the front-website package.

### Generating component boilerplates:

To create a template for an `atom/molecule/organism`, run:

```bash
npm run generate -w widgets
```

Then choose the desired component type and specify its name.

This will create a folder with the component, including the component file, Storybook, boilerplate files for styles and tests.

After that, you can start the Storybook with `npm run storybook -w widgets` and begin developing the component.

## Website app:

...

## Api app:

NestJS backend with PostgreSQL (via Prisma). Runs in Docker together with its database.

Setup:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up --build
```

This starts a `db` (Postgres) container and an `api` container; migrations run automatically on startup. Once it's up:

```bash
curl http://localhost:3001/health
```

should return `{"status":"ok", ...}` — this check verifies a real database connection, not just that the process is running.

To connect to the database directly (e.g. with Beekeeper Studio, TablePlus, psql), use the `POSTGRES_*` values from `apps/api/.env` against `localhost:5432`.

See `PLAN.md` for the full domain model (users, cart, orders, order deadlines, Telegram OTP auth, catalog import/export) and implementation status.


## General:

It is important to separate the API interaction logic from the visual component library. Also, specific things unrelated to the website's appearance (such as analytics) should be separated. This is why the code is divided into front-website and widgets.

Before pushing changes, run:

`npm run check` - This checks types and lints the entire project.
