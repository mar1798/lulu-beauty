# Documentation map

Reference documentation for the Sululu monorepo. `CLAUDE.md` at the repo root is the
short operating manual (hard rules, commands, traps) and links here for detail; `README.md`
is the human-facing introduction. Everything below is the long form.

These documents are written in **English**, like `CLAUDE.md` and the root `README.md`, and
unlike the user-facing copy — see [conventions.md](conventions.md#language) for the rule.

| Document | Read it when |
| --- | --- |
| [architecture.md](architecture.md) | You need the shape of the system: what runs where, how a request travels, why the pieces are split this way. |
| [domain.md](domain.md) | You touch business rules — order cycles, cart, orders, statuses, roles, money, limits. |
| [backend.md](backend.md) | You work in `apps/api`: module layout, endpoint list, service/schema patterns, migrations, error codes. |
| [frontend.md](frontend.md) | You work in `apps/website`: pages, auth cookies, the proxy, SWR data layer, security headers. |
| [widgets.md](widgets.md) | You work in `packages/widgets`: atomic design tiers, vanilla-extract, theme tokens, barrels, Storybook. |
| [telegram.md](telegram.md) | You touch sign-in, the bot, or any notification. |
| [conventions.md](conventions.md) | Before writing any code: language rule, naming, lint rules, how new UI is allowed to be built. |
| [development.md](development.md) | Setting the repo up, or you forgot which command starts what. |
| [environment.md](environment.md) | You add, rename or debug an environment variable. |
| [testing.md](testing.md) | You write or run tests — and **always** before pointing pytest at a database. |
| [recipes.md](recipes.md) | You add a feature that crosses packages ("new endpoint", "new error code", "new widget"). Step-by-step checklists. |
| [gotchas.md](gotchas.md) | Something behaves impossibly. The list of traps this repo is known to contain. |
| [deployment.md](deployment.md) | Deploying to a server (Russian; written for the person doing the deploy). |

## Keeping these current

A document that lies is worse than one that is missing, because it is trusted. When a change
invalidates something here, update the document in the same change — the checklists in
[recipes.md](recipes.md) name the document each kind of change touches.

The code is the source of truth. These files exist to explain the parts that the code cannot
state on its own: why a boundary is where it is, which two files must change together, and
which plausible-looking approach has already failed here.
