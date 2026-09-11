# Conventions

## Git

Committing and pushing are allowed **when asked**, and `/commit` is the way: it reads the
diff, splits it into one commit per reason, and pushes the current branch. Nothing is
committed unprompted, and history that already exists is not rewritten (`--amend`,
`--force`, a rebase over pushed commits) unless that is what was asked for.

Read-only git needs no asking: `git status`, `git diff`, `git log`, `git show`,
`git blame`.

## Language

This is the rule most easily broken, because no single file states it:

| Where | Language |
| --- | --- |
| All user-facing copy — UI strings, Telegram bot messages, xlsx export headers, import error text | **Russian** |
| Comments and docstrings in `apps/website` and `packages/widgets` | **Russian** |
| Comments and docstrings in `apps/api` | **English** |
| User-facing strings inside `apps/api` (`telegram/messages.py`, `export/service.py`, `catalog/import_service.py`, `orders/service.py`) | **Russian** |
| Documentation under `docs/`, `CLAUDE.md`, `README.md` | **English** |
| `docs/deployment.md` | **Russian** (written for the person doing the deploy) |

Match the surrounding file. Essentially every file in `website`/`widgets` is commented in
Russian; a lone English comment there reads as an outsider's patch.

### Terminal punctuation

**A user-facing string that is a single phrase carries no trailing period** — labels, hints,
button captions, validation messages, error texts from `apiErrors.ts`, one-line bot replies.
Text of two or more sentences keeps its punctuation in full, final period included; the rule
is about the period that would dangle after a lone phrase, not about stripping periods from
prose.

Two seams to watch, because both produce a sentence out of parts that individually look like
phrases:

- a string built by concatenation (`'…, — ' + 'иначе …'`) is one text, judged as a whole;
- a text that interpolates another (`` `${messageForError(…)} …` ``) cannot assume how the
  interpolated half ends — normalise the seam where you join them, as
  `pages/admin/products/add.tsx` does.

Bot messages are judged per **message**, not per literal: `messages.py` assembles most of them
from a list of lines, and a line inside such a message is not a lone phrase.

## TypeScript

- Interfaces are prefixed **`I`**: `IProduct`, `IApiClient`, `IOrderCycle`.
- **Explicit return types** are required (`@typescript-eslint/explicit-function-return-type`),
  with expressions and const-assertion arrow functions exempted.
- Prettier: no semicolons, single quotes, 2 spaces, print width 100, `arrowParens: avoid`,
  `trailingComma: es5`. `npm run format` applies it.
- No raw `fetch` in a page — go through `src/services/endpoints/*`.
- Every SWR key is declared in `src/services/swrKeys.ts`, never inlined.
- UI branches on `error.code`, never on message text.

## Python

- `ruff` (line length 100, target py312) and `mypy` with **`strict = true`**. Both must pass.
- Services are classes taking an `AsyncSession`; they mutate and do **not** commit.
- Schemas subclass `CamelModel`. Errors are `HTTPException(status, "<machine_code>")`.
- Every new SQLAlchemy model is registered in `app/models.py`.

Full detail: [backend.md](backend.md#patterns-to-match).

## Package boundaries

- Keep API/data-fetching logic and cross-cutting concerns (analytics) **out of `widgets`** —
  that package is strictly the visual component library. Website-specific and API logic lives
  in `apps/website`.
- `widgets` never imports `next/*`; adapters arrive through `ServicesContext`.
- Shared style utilities and mixins belong in `packages/widgets/src/styling`, not inline in a
  component.

## Package manager

**npm only** (`packageManager: npm@10.9.0`, committed `package-lock.json`, CI runs `npm ci`),
Node 22.23.1 pinned in `engines` and `.nvmrc`. Never pnpm or yarn. This covers `apps/website`
and `packages/widgets`; `apps/api` is a separate Python project managed with `uv`.

## Building new UI

**Don't hand-roll markup and CSS from scratch.** Look up a real, production-quality reference
implementation first via the MCP servers registered in `.mcp.json`:

- `shadcn` for general components;
- the built-in `@magicui` namespace (e.g. `@magicui/globe`) for motion/animated ones.

Treat the fetched source as a **structural and behavioral reference only**. This repo has no
Tailwind and no shadcn/Radix runtime installed — `packages/widgets` is vanilla-extract-only.
Hand-port the markup structure and behavior into a proper `widgets` atom/molecule/organism
scaffolded with `npm run generate -w widgets`, rewriting all styling in vanilla-extract.

**Never** run `shadcn add` or `npx @magicuidesign/cli` into this repo, and **never** introduce
Tailwind as a second styling system alongside vanilla-extract.

## Animation

For fade/slide/stagger and similar patterns, use the `motion` skill (`.claude/skills/motion/`,
invoke as `/motion`) and the `motion` MCP server (`https://mcp.motion.dev`, free, no account)
rather than guessing timing and easing values. `best-practices/` under the skill works fully
offline if the server is unreachable.

The library is installed in `packages/widgets` (`npm install motion -w widgets` if ever
missing) and already used by `Appear`, `Alert`, `MobileMenu`, `ToastViewport`, `Modal` and
`ConfirmDialog`. **Always import from `motion/react`**, never the deprecated `framer-motion`
package. Shared timings/easings live in `src/utils/motion.ts` — reuse them instead of inlining
new values.

The `motion-plus` server (Motion+ paid tier: MotionScore audits, gated example source) is
intentionally **not** registered — same reasoning as skipping AI Designer MCP: no account to
wire up.

## Before finishing a change

| Touched | Run |
| --- | --- |
| `apps/website` or `packages/widgets` | `npm run check` (types + lint), `npm test` |
| `packages/widgets` component added/removed | `npm run barrels` |
| `apps/api` | `uv run ruff check .`, `uv run mypy app`, `uv run pytest` (from `apps/api`) |
| A new API error code | Add it to `apps/website/src/services/apiErrors.ts` |
| Anything documented here | Update the affected file under `docs/` |

Cross-package checklists: [recipes.md](recipes.md).
