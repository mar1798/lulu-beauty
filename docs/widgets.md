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

| Tier            | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/atoms`     | `Button`, `Input`, `Price`, `Badge`, `Chip`, `Select`, `Combobox`, `Tooltip`, `Skeleton`, `Appear`, `Reveal`, `Parallax`, `AppLink`, `AppImage`, `RichText`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/molecules` | `ProductCard`, `VariantSelector`, `QuantityStepper`, `SearchField`, `CustomerSelect`, `Pagination`, `OrderCard`, `OrderStatusBadge`, `DeadlineCountdown`, `Toast`, `EmptyState`, `FileDropzone`, `RichTextEditor`, `ActionMenu`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/organisms` | `Header`, `HeaderSearch`, `Footer`, `CartPanel`, `CheckoutForm`, `ProductGrid`, `ProductDetails`, `OrderDetails`, `Modal`, `ConfirmDialog`, `ToastViewport`, `MobileMenu`, `TelegramLoginPanel`, `AdminOrdersTable`, `AdminMessageDialog`, `AdminOrderDialog`, `AdminOrderEditDialog`, `AdminOrderDiscountDialog`, `AdminProductsTable`, `AdminProductForm`, `AdminProductGallery`, `AdminCycleCalendar`, `AdminUsersTable`, `AdminImportPanel`, `AdminCategoriesPanel`, `ProductPicker`, `PromoCarousel`, `AdminBannersBoard`, `AdminNewsBannerForm`, `PromotionDetails`, `AdminPromotionsTable`, `AdminPromotionForm`, `AdminPromoCodesTable`, `AdminPromoCodeForm` |
| `src/templates` | `BaseLayout`, `AdminLayout`, `HomeTemplate`, `CatalogTemplate`, `ProductTemplate`, `CartTemplate`, `AccountTemplate`, `AuthTemplate`, `LegalTemplate`, `ErrorTemplate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Supporting directories:

- `src/contexts` — `ServicesContext` (dependency injection), `ToastContext`, `ConfirmContext`,
  `MotionProvider`. Toasts are voiced through two permanent hidden live regions in
  `ToastViewport` (polite and assertive) rather than a role on each toast — a region inserted
  already filled is skipped by screen readers; `useToast().announce()` speaks without a toast.
  A `danger` toast lives 10s, and its description is never clamped. The title says what
  happened ("Товар убран из корзины"); a product name goes in `subject`, its own line clamped
  at two — inside the title the ellipsis ate the event instead of the name.
- `src/hooks` — `useCountdown`, `useDebouncedValue`, `useDisclosure`, `useFocusTrap`,
  `useLockBodyScroll`, `useParallaxOffset`.
- `src/utils` — non-styling shared utilities: `motion.ts`, `datetime.ts`, `plural.ts`,
  `validation.ts`, `slug.ts`, `volume.ts`, `responsive.ts`, `sizes.ts`, `tags.ts`,
  `richText.ts`.
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

## Promotions

Rules: [domain.md](domain.md#promotions); site side: [frontend.md](frontend.md#promotions).
The tier is the usual one — all of these were scaffolded with `npm run generate` and have
stories (the table and the form also a `Mobile` one) and tests. **They compute nothing**: every
sum, discount and condition comes from the API, and the widgets only draw and word it
(`utils/promotion.ts` holds the wording, the row drafts and the request builders).

Storefront:

- `PromoCarousel` (organism) — takes `slides: IBannerSlide[]` (the site maps `GET /banners` into
  them; the widget knows nothing about promotions or news), **a slide is 100% of the width on
  every screen**. A slide is a **picture** (`<picture>`: the desktop banner from `md` up when
  there is one, otherwise the mobile one, cropped with `cover`) or, with no mobile picture, a
  **text card** (title, text clipped to three lines on a phone and two from `md`, a button label — «Подробнее» by default —
  only when the slide has a link). A slide with no `href` is a plain `div`, not a link; an
  `isExternal` one opens in a new tab with `rel="noopener noreferrer"`. The browser does the
  scrolling (`scroll-snap`, so a swipe is native and works before hydration); `motion` only moves
  the dots (`scaleX`). **There is no pause button** — the carousel always plays; autoplay only
  waits while it is hovered, focused, touched or off-screen, and does not exist under
  `prefers-reduced-motion`. The dots are named «Слайд N из M: <title>»; the section is «Акции и
  новости». The frame has a soft shadow and a translucent inset hairline (`::after`), so a light
  banner does not melt into the page; the dots are 6px on a thin, light pill, with 20×24 hit
  areas. Ratios are fixed so the layout does not jump: 3:2 on a phone, 3:1 from `md`. It goes
  into `CatalogTemplate`'s optional **`banner`** slot. With no slides it renders `null`.
- `AdminBannersBoard` (organism) — the owner's list of slides: thumbnail (or a «Текст» plate),
  kind and state badges (`utils/banner.ts`: `BANNER_STATE_LABELS`, `bannerStateLabel` — a
  finished news item reads «Истекла»), period, the «Показывать в карусели» switch and
  «Выше»/«Ниже» icon buttons (a move swaps with the neighbouring **visible** row and hands the
  whole key order to `onReorder`). Finished rows are hidden by default behind a switch.
  Everything is a callback; requests, toasts and rollback live on the page.
- `AdminNewsBannerForm` (organism) — a news item: fields, period (`PromotionPeriodFields` with
  `hideStart` for «Показывать сразу»), two `PromotionBannerField`s and a live preview — the same
  `PromoCarousel` with one draft slide, `inert`. Validation repeats the backend
  (`isValidBannerLink`, `NEWS_*_MAX` in `utils/banner.ts`).
- `PromotionDetails` (organism) — a promotion's page: banner, term, the owner's text
  (`RichText`), conditions and rewards in words.
- `GiftLine` (molecule) — a gift in the cart, checkout and order: picture, title and a «Подарок»
  mark instead of a price; no quantity control, it is not a line. A custom gift without a
  picture gets a placeholder.
- `PromotionLines` (molecule) — the cart's promotions as two pieces: discount rows
  («Акция «…» - 500 сом»; a gift-only promotion gets none) and the «Ещё 300 сом и 2 товара до акции» hints.
- `PromoCodeField` (molecule) — the checkout field: input, the server's verdict, an accepted
  code as a row with «Убрать», and a picker among the customer's codes.
- `PromoCodeCard` (molecule) — a code on «Промокоды», drawn as a coupon: a stub with the code
  and tap-to-copy, a perforation with notches (CSS masks, shadow via `drop-shadow`), then what
  it gives, conditions, term, status badge (the status comes from the API; `EXPIRED` is
  computed there). A personal owner code (`isOwnerCode`) shows its own title without the «Акция»
  prefix and its `descriptionHtml` through `RichText`. No «Использовать» — the code is typed in at checkout. One per row.
- `CartPanel`, `CheckoutPanel`, `CheckoutForm` and `OrderDetails` got promotions, gifts and
  hints props (`ICart.promotions` is required); `buildPromotionHref` makes the links.

Admin:

- `AdminPromotionsTable` — a real `<table>` that turns into cards below `xl`
  (`styling/mixin/table.ts`). **The row actions live in an `ActionMenu`** («⋯»): a row of
  five icons pushed the table into a horizontal scroll. The trigger's name adds the promotion
  («Действия «Весна»»), since a screen reader hears every row's button alike; the items are
  plain «Изменить», «Выключить», … There is no participants-count column — the count is one
  click away in «Участники». An archived promotion has no «Включить» and no «Удалить».
- `ActionMenu` (molecule) — a «⋯» `IconButton` and an ARIA APG menu: focus moves to the first
  item, arrows/Home/End move it, Escape and Tab close and return focus to the trigger. Items
  are `{ label, icon?, tone?, link? | onSelect?, disabled? }`; a `link` item stays an `<a>`
  (`role="menuitem"`). Rendered through `Portal` with `position: fixed`, like `Select`'s
  list, so the table wrapper's `overflow` does not clip it.
- `FormSection` (molecule) — the collapsible panel both admin forms are built from (a heading
  button with `aria-expanded`, a body whose height animates, `overflow` visible once open so
  focus rings and dropdowns are not clipped). Extracted unchanged from `AdminPromotionForm`.
- `PromotionPeriodFields` (molecule) — start date and time, the «Бессрочная» switch and the end
  date and time. Controlled; the ISO conversion (`storeIso`) and the «end after start» check
  stay with each form, which passes the error texts in. `openEndedLabel` and `endHint` override
  the promotion wording.
- `AdminPromoCodesTable` — modelled on `AdminPromotionsTable` (same `ActionMenu`, cards below
  `xl`). Columns: the code (monospace, with a copy `IconButton` whose click
  goes to the page's `onCopy`: the widget knows nothing about the clipboard), name, «Кому» («Все»,
  or name and phone, «Аккаунт удалён» for an erased account), period («бессрочно» for an open
  end), rewards, the derived status (labels in the masculine, `ADMIN_PROMO_CODE_STATUS_LABELS`; plus «Использован» for a personal code with a use). No uses-count column — «Использования»
  in the menu shows them. Delete reads «В архив» once a code was applied.
- `AdminPromoCodeForm` — an owner's promo code in one PUT/POST. Four `FormSection`s: «Основное»
  (code, name, description, `PromotionPeriodFields`, enabled), «Кому» (a personal switch and
  `CustomerSelect`, whose search the page drives through `customerSelect`), «Условия» and «Награды»
  (the same builders as the promotion, with `allowPromoCode={false}`). A new code (and a
  duplicate) opens with a `SULU-XXXXX` already in the field, generated client-side from the
  server's unambiguous alphabet; the «Перегенерировать» icon inside the field draws another, for a
  saved code too (the hint then warns that the old one stops working). Whatever is in the field is
  upper-cased, stripped of whitespace (only that: dashes, Cyrillic and punctuation are part of the
  code), checked for 4-16 characters and sent in that form — `SULU-AB3CD` is stored with its
  dash; a taken one comes back as
  `promo_code_taken`. A personal code without a customer does not submit and opens «Кому».
- `AdminPromotionForm` — the whole promotion in one PUT/POST: fields, two `PromotionBannerField`s,
  `PromotionConditionBuilder`, `PromotionRewardBuilder` and `AdminPromoCodeDialog` (a
  `PROMO_CODE` reward: validity, conditions, what it gives — a code cannot hold another code).
  Numbers live as strings in the builders and become numbers in `buildConditions`/`buildRewards`.
  The mobile banner is labelled «Нужен для карусели» but does not block saving.
  The four sections (Основное, Баннеры, Условия, Награды) collapse; only «Основное» starts
  open, the others show a summary in the header. Collapsed bodies stay mounted, and a submit
  with an error inside a collapsed section opens it before focusing the first invalid field.
- `PromotionTargetField` — products, categories and brands; reads as «any of», so the label says so.
  There is **no category picker**: categories and brands are each a `Select` plus a label
  list (a brand comes from the catalogue's list, picking adds it). The product search is open
  from the start — no «Добавить товар» / «Готово».
- `PromotionProductSearch` — a thin wrapper over `ProductPicker`; the search itself is a
  callback (`searchProducts`) from the page, so the widget has no data fetching. Already
  picked rows are marked in the results (`addedMode="selected"`: highlighted, a disabled
  «Выбран» instead of the button); a target passes `pickedProductIds`, so every variant of a
  picked product is marked.
- `AdminPromotionParticipantsDialog` — who joined, through which order, what they got;
  released participations stay, marked. A table (cards below `md`) with `Pagination` under it.
- `PromotionBannerField` (molecule) — a file slot that states the recommended size and previews
  the frame in the right ratio. No drag-and-drop: the «Выбрать файл» / «Заменить» button sits
  inside the frame itself, and the type and size are checked there before `onSelect`.

**`BANNER_SPECS`** (`utils/promotion.ts`) is the one place the banner sizes are written: mobile
**1080×720 (3:2)**, desktop **1920×640 (3:1)**. The carousel and the details page keep the same
ratios, so a banner the form previews is the one the visitor sees. Accepted files: JPEG, PNG,
WebP, up to 15 MB (`BANNER_ALLOWED_TYPES`, `BANNER_MAX_BYTES`, mirroring the API).

Smaller additions: icons `IconCopy`, `IconUsers`, `IconGift`, `IconTicket` (the «Промокоды» menu entry), `IconClipboard` (copy a code), `IconPause`, `IconPlay` (the last two no longer used by the carousel);
`Input` takes `type="date"`; shared timings for the carousel in `utils/motion.ts`; types
`IPromotion`, `IPublicPromotion`, `IAdminPromoCode` (and its form values and props), `IPromoCode` (`expiresAt` is nullable: an open-ended owner code), `IPublicPromotion`, `IPromoCodeCheck`, `IOrderPromotion`, `IOrderGift`, `ICartGift`,
`IPromotionCondition`/`IPromotionReward` and friends in `types.ts`; `IAdminChecklist` has
`customGifts`.

## Public subpaths

The package is consumed through subpath exports: `widgets/atoms`, `widgets/molecules`,
`widgets/organisms`, `widgets/templates`, `widgets/contexts`, `widgets/hooks`,
`widgets/utils`, `widgets/types`, `widgets/svg`, `widgets/feed`, `widgets/styling/lib`,
`widgets/styling/mixin`, `widgets/styling/theme`, `widgets/styling/properties`,
`widgets/styling/levitate`, `widgets/styling/global.css`, `widgets/styling/preflight.css`.

**A new public subpath must be added to both `exports` and `typesVersions`** in
`packages/widgets/package.json` — one without the other type-errors or fails to resolve.

## Styling

All shared styling lives in `src/styling`, never inline in a component:

- `lib/` — style-_writing_ utilities: `color.ts`, `media.ts`, `font.ts`, `shadow.ts`,
  `rem.ts`, `border.ts`, `transition.ts`, `linearGradient.ts`, `nested.ts`, …
- `mixin/` — composable style objects: `flex.ts`, `grid.ts`, `focusRing.ts`, `field.ts`,
  `panel.ts`, `table.ts`, `tag.ts`, `truncate.ts`, `container.ts`, `visuallyHidden.ts`,
  `richText.ts` (the one mixin that registers `globalStyle`s under a scope class instead of
  returning a style object — description HTML has no classes of its own to hang styles on).
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

## Rich text

The product description is written in `RichTextEditor` (Tiptap — `@tiptap/react` +
`@tiptap/starter-kit`, trimmed to the vocabulary in
[domain.md](domain.md#a-description-has-two-forms)) and shown by `RichText`. Both carry the
same `richTextContent` typography, so the admin sees the page the customer will.

- **`RichText` never uses `dangerouslySetInnerHTML`.** It parses the HTML with
  `html-react-parser` and rebuilds every allowed tag itself, with no attributes from the
  source except a link's `href` (and only `http(s)`/`mailto`/`tel`). The API already cleaned
  the HTML; this is the second lock, not the only one.
- **Tiptap registers its callbacks once**, at creation — `onChange` reaches it through a ref.
  The extension list is a module constant, because `useEditor` compares extensions by
  reference and would otherwise reconfigure the editor on every keystroke.
- **The length limit is a field error, not a hard stop.** Tiptap's `CharacterCount` with a
  `limit` silently trims a longer text on load, and a description written before the editor
  can be longer. The counter uses `doc.textContent`, the form uses `richTextLength`, and the
  API counts the same way.
- **Tiptap is only on the admin pages.** The package's `sideEffects` list lets the website's
  bundler drop `RichTextEditor` from every page that does not render it; keep it that way —
  a side-effecting import next to it in a barrel would drag ProseMirror onto the storefront.

## Animation

`motion` (formerly Framer Motion) **is installed** here and used by some twenty components —
`Reveal` and `Parallax` through to `ProductDetails`. The list is deliberately not written out:
one kept by hand drifts, and `grep -rl "from 'motion/react'" src` answers the question exactly.
Always import from `motion/react`, never the deprecated `framer-motion` package. Shared timings
and easings live in `src/utils/motion.ts` — reuse them instead of inlining new values, and use
the `/motion` skill rather than guessing. Details in
[conventions.md](conventions.md#building-new-ui).

**Components render `m.*`, never `motion.*`.** The engine is loaded by `LazyMotion`: on the site
through `MotionProvider` (`contexts/MotionProvider.tsx`), which fetches `src/motion/features.ts`
(`domMax`) as its own chunk after hydration, and in Storybook and tests through `StoryWrapper`,
which passes `domMax` directly. Both are `strict`, so a stray `motion.div` throws instead of
quietly putting ~30 KB gzip back into every page's `_app`. `src/motion/` sits outside the barrel
directories on purpose — a barrel re-export would import `domMax` statically. Until the chunk
arrives an `m.*` node simply stays at its initial state.

**Anything that can appear in server-rendered markup animates in CSS, not motion.** motion
serializes `initial` into the SSR output, so a block that ships inside static HTML arrives at
`opacity: 0` and stays invisible until hydration — measured at 1.2 s on a mid-range phone
before `Alert` was moved to CSS, and it cost `/catalog` its LCP. `Appear`, `Alert` and
`HomeHero`'s entrance are CSS for exactly this reason. motion is for what mounts in response
to an action (`Modal`, `ToastViewport`, `MobileMenu`, dropdowns) and for what is driven by
scroll (`Reveal`, `Parallax`, `DecorField`). `Reveal` itself renders `initial={false}`, so it
ships **visible** and hides itself in the browser only when it is below the fold — a failed
chunk leaves the section readable, not blank. The measurement runs in a
`requestAnimationFrame` scheduled from `useLayoutEffect`: Next restores the scroll position
(and resets it on navigation) in its root's layout effect, which fires after the children's,
so measuring directly saw the page at the top and replayed the entrance on «назад».

**Continuous levitation is CSS, and motion is only asked whether it is on screen.** Both the
decorative jars (`DecorField`) and the hero's showcase cards (`Float`) breathe through an
infinite CSS animation whose period and negative delay come inline from a `phase`, so
neighbours never sway in step — the shared `floatTiming` in `src/utils/motion.ts` derives
both. The jars' keyframes (±8px with a ±1.2° tilt) live in `src/styling/levitate.css.ts` and
are exported as `widgets/styling/levitate`, so seasonal decor on the site floats with the very
same curve instead of a lookalike copy. motion contributes only `useInView`, which pauses the animation off screen: an infinite
compositor animation otherwise ticks for as long as the tab is open. `ShowcaseMore` pauses its
sweeping border the same way, and has the most to gain from it — that layer is 250 % of the
tile and filled with a conic gradient. The pause is always a class, never an inline
`animation-play-state` — inline would outrank the `animation: none` that
`prefers-reduced-motion` sets.

**Animating a size is an exception, and it is spelled out where it is made.** Motion is
transform and opacity; `FaqAccordion` (height) and `ProductDetails`'s row of actions (width,
when "в корзину" shrinks into the cart circle) animate a layout property because `scale`
would stretch the text and the round button inside them. Both are one element, both move in
answer to a press, and neither runs in a scrolling frame. The width case needs four things
that are easy to get wrong and are commented in place. The expanded width is **measured**
rather than left to `auto` or `100%`, neither of which equals what the flex row actually
hands the button — and the measurement first undoes everything that lies about the expanded
row (the animation's own inline width, the class that switched `flex-grow` off, the quantity
slot that has not finished collapsing), or the button re-expands to the width of the circle
it came from. A measurement also goes stale: a `ResizeObserver` watches the row — not the
button's own box, whose width the animation itself keeps changing — and only drops the value,
leaving the re-measurement to the layout effect that already does it before paint. Both
pixel sizes come from the DOM for the same reason the width does: the circle's diameter is
the row's measured height, since that height is written in `rem` and a reader's larger font
would otherwise turn the circle into an oval next to a heart that did scale. `flex-grow`
stays off for as long as the animation owns the width, or the row overrules it in a single
frame. And the label is clipped by the button itself rather than by the box around it,
because `Tooltip`'s bubble is drawn in that box; the clipping lasts exactly as long as the
movement, so a button at rest keeps its shadow and focus ring.

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
