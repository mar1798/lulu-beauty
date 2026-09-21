# `packages/widgets` — the component library

React + [vanilla-extract](https://vanilla-extract.style/), developed and tested in isolation
via Storybook. Consumed by `apps/website` as **TypeScript source**, not a prebuilt bundle.

Comments and docstrings here are **Russian**, like the UI copy. See
[conventions.md](conventions.md#language).

## Commands

```bash
npm run dev:storybook               # = npm run storybook -w widgets, port 6006
npm run generate -w widgets         # scaffold an atom/molecule/organism, then rebuild barrels
npm run barrels                     # regenerate barrel index.ts files
npm test -w widgets                 # vitest run
npm run check -w widgets            # tsc --noEmit + eslint
cd packages/widgets && npx vitest run src/atoms/button/Button.test.tsx   # one file
```

Storybook is the primary dev loop here — build a widget against stories, not against the site.

## Layout

[Atomic design](https://bradfrost.com/blog/post/atomic-web-design/); all four tiers are
populated.

| Tier            | Examples                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/atoms`     | `Button`, `Input`, `Price`, `Badge`, `Chip`, `Select`, `Combobox`, `Tooltip`, `Skeleton`, `Appear`, `Reveal`, `Parallax`, `AppLink`, `AppImage`                                                                                                                                                                                                                     |
| `src/molecules` | `ProductCard`, `VariantSelector`, `QuantityStepper`, `SearchField`, `Pagination`, `OrderCard`, `OrderStatusBadge`, `DeadlineCountdown`, `Toast`, `EmptyState`, `FileDropzone`                                                                                                                                                                                       |
| `src/organisms` | `Header`, `HeaderSearch`, `Footer`, `CartPanel`, `CheckoutForm`, `ProductGrid`, `ProductDetails`, `OrderDetails`, `Modal`, `ConfirmDialog`, `ToastViewport`, `MobileMenu`, `TelegramLoginPanel`, `AdminOrdersTable`, `AdminProductsTable`, `AdminProductForm`, `AdminCycleCalendar`, `AdminUsersTable`, `AdminImportPanel`, `AdminCategoriesPanel`, `ProductPicker` |
| `src/templates` | `BaseLayout`, `AdminLayout`, `HomeTemplate`, `CatalogTemplate`, `ProductTemplate`, `CartTemplate`, `AccountTemplate`, `AuthTemplate`, `LegalTemplate`, `ErrorTemplate`                                                                                                                                                                                              |

Supporting directories:

- `src/contexts` — `ServicesContext` (dependency injection), `ToastContext`, `ConfirmContext`.
- `src/hooks` — `useCountdown`, `useDebouncedValue`, `useDisclosure`, `useFocusTrap`,
  `useLockBodyScroll`, `useParallaxOffset`.
- `src/utils` — non-styling shared utilities: `motion.ts`, `datetime.ts`, `plural.ts`,
  `validation.ts`, `slug.ts`, `volume.ts`, `responsive.ts`, `sizes.ts`, `tags.ts`.
- `src/types.ts` — shared, JSON-serializable types meant for consumers (`IProduct`, `IOrder`,
  `IOrderCycle`, …). This is what `apps/website` imports from `widgets/types`.
- `src/svg` — icons. `src/testing` — test/Storybook helpers. `src/stories` — story wrapper,
  faker data, the `feed` export.
- `PRODUCT.md` — the product brief used by the `impeccable` design skill.

## Framework independence

Widgets **never** import `next/link` or `next/image`. `apps/website/src/pages/_app.tsx`
injects adapters (`@/components/Link`, `@/components/Image`) through
`ServicesContext.Provider`, and Storybook injects its own stubs via `src/stories/wrapper`. A
widget that needs a link or an image takes it from that context.

**Adding a `next/*` import to `packages/widgets` breaks Storybook.**

Likewise, keep API/data-fetching logic and cross-cutting concerns (analytics) out of this
package. It is strictly the visual layer; website-specific logic lives in `apps/website`.

## Scaffolding a component

```bash
npm run generate -w widgets
```

Prompts for the tier and the name, then generates the component file, a Storybook story,
style boilerplate and a test file from `tools/templates`, and regenerates the barrels.
**Always use this instead of hand-creating a component folder** — it is what keeps the folder
shape, the story and the barrel entry consistent.

## Barrels

`index.ts` files under the directories listed in `packages/widgets/.barrelsby.json` — `atoms`,
`molecules`, `organisms`, `contexts`, `templates`, `hooks`, `utils`, `styling/lib`,
`styling/mixin` — are generated by [`barrelsby`](https://www.npmjs.com/package/barrelsby).

**Do not hand-edit them.** Run `npm run barrels` after adding or removing a file.

## Public subpaths

The package is consumed through subpath exports: `widgets/atoms`, `widgets/molecules`,
`widgets/organisms`, `widgets/templates`, `widgets/contexts`, `widgets/hooks`,
`widgets/utils`, `widgets/types`, `widgets/svg`, `widgets/feed`, `widgets/styling/lib`,
`widgets/styling/mixin`, `widgets/styling/theme`, `widgets/styling/properties`,
`widgets/styling/global.css`, `widgets/styling/preflight.css`.

**A new public subpath must be added to both `exports` and `typesVersions`** in
`packages/widgets/package.json` — one without the other type-errors or fails to resolve.

## Styling

All shared styling lives in `src/styling`, never inline in a component:

- `lib/` — style-_writing_ utilities: `color.ts`, `media.ts`, `font.ts`, `shadow.ts`,
  `rem.ts`, `border.ts`, `transition.ts`, `linearGradient.ts`, `nested.ts`, …
- `mixin/` — composable style objects: `flex.ts`, `grid.ts`, `focusRing.ts`, `field.ts`,
  `panel.ts`, `table.ts`, `tag.ts`, `truncate.ts`, `container.ts`, `visuallyHidden.ts`.
- `themes/` — `tokens.ts` → `contract.css.ts` → `light.css.ts`.
- `global.css.ts`, `preflight.css.ts`, `properties.css.ts` (registered CSS properties).

### Theme tokens

`themes/tokens.ts` is the single source of truth: `contract.css.ts` is
`createThemeContract(lightTokens)` and `light.css.ts` is `createTheme(vars, lightTokens)`, so
the contract and the theme cannot drift.

Two rules that look odd and are not negotiable:

1. **Colors are stored as `'R, G, B'` channel strings**, because the `color()` getter in
   `styling/lib/color.ts` composes `rgb()` / `rgba()` from them.

2. **`tokens.ts` imports from `../lib/rem` and `../lib/shadow` directly, never via the `lib`
   barrel.** The barrel pulls in `lib/color.ts`, which imports `contract.css.ts` — closing the
   cycle tokens → lib → color → contract → tokens, and `color` would initialize before `vars`
   is ready.

**Fonts come from the host app**, not from the library: both `font.inter` and `font.display`
resolve to `var(--font-inter, …)`, which `apps/website/src/pages/_app.tsx` defines through
`next/font`. `display` is the heading role and deliberately names the same family as body text
right now — the accent face it used to point at (Eloquia Display) shipped **no Cyrillic at
all**, so every Russian heading, which is every heading here, quietly fell back to a different
system font on each machine. The role kept its own token so that swapping in a face with
Cyrillic is one line in `tokens.ts` rather than two dozen style files.

## Animation

`motion` (formerly Framer Motion) **is installed** here and used by `Reveal`, `Parallax`,
`DecorField`, `Float`, `HomeHero`, `MobileMenu`, `ToastViewport`, `Modal` and
`ConfirmDialog`. Always import from `motion/react`, never the deprecated `framer-motion`
package. Shared timings and
easings live in `src/utils/motion.ts` — reuse them instead of inlining new values, and use the
`/motion` skill rather than guessing. Details in
[conventions.md](conventions.md#building-new-ui).

**Anything that can appear in server-rendered markup animates in CSS, not motion.** motion
serializes `initial` into the SSR output, so a block that ships inside static HTML arrives at
`opacity: 0` and stays invisible until hydration — measured at 1.2 s on a mid-range phone
before `Alert` was moved to CSS, and it cost `/catalog` its LCP. `Appear`, `Alert` and
`HomeHero`'s entrance are CSS for exactly this reason. motion is for what mounts in response
to an action (`Modal`, `ToastViewport`, `MobileMenu`, dropdowns) and for what is driven by
scroll (`Reveal`, `Parallax`, `DecorField`).

**Continuous levitation is CSS, and motion is only asked whether it is on screen.** Both the
decorative jars (`DecorField`) and the hero's showcase cards (`Float`) breathe through an
infinite CSS animation whose period and negative delay come inline from a `phase`, so
neighbours never sway in step — the shared `floatTiming` in `src/utils/motion.ts` derives
both. motion contributes only `useInView`, which pauses the animation off screen: an infinite
compositor animation otherwise ticks for as long as the tab is open. `ShowcaseMore` pauses its
sweeping border the same way, and has the most to gain from it — that layer is 250 % of the
tile and filled with a conic gradient. The pause is always a class, never an inline
`animation-play-state` — inline would outrank the `animation: none` that
`prefers-reduced-motion` sets.

**A reduced-motion branch must state its final visual state.** `useReducedMotion()` is always
`false` on the server, so the markup carries motion's initial frame; React does not reconcile
that attribute during hydration, so a branch that simply renders "the same node without
animation" leaves the server's `opacity: 0` / `transform` in place forever. `Reveal` solves it
by keeping the motion node with `initial={false} animate="visible"` (which also un-hides
children that inherit its variants, such as `StepScene`); `Parallax`, `DecorField` and
`HomeHero` render plain nodes and clear the leftovers with `useStillNode`. `Float` needs
neither: it never puts a transform in the markup, so the media query alone switches it off.

## Tests

`vitest` + Testing Library, config in `packages/widgets/vite.config.ts`, setup in
`src/testing/setup.ts`. Use `renderWidget` from `src/testing/render.tsx` rather than bare
`render`: it wraps the tree in the same `StoryWrapper` Storybook uses, so anything reaching
for `AppLink` / `AppImage` doesn't fail on an empty `ServicesContext`. More in
[testing.md](testing.md).
