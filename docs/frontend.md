# `apps/website` — the Next.js site

Next.js 16 on the **Pages Router** (`src/pages`), consuming `packages/widgets` as TypeScript
source (`transpilePackages: ['widgets']`). It talks to `apps/api` — **not** WordPress.

Comments and docstrings here are **Russian**, like the UI copy. See
[conventions.md](conventions.md#language).

> ⚠️ **`src/сonfig.ts` is spelled with a Cyrillic `с` (U+0441)**, and so is the import
> specifier `@/сonfig`. An ASCII `c` gives an unresolved module. Copy the path from an
> existing import rather than typing it.

## Commands

```bash
npm run dev:web              # http://localhost:3000
npm run build -w website
npm run check -w website     # tsc --noEmit + eslint
npm run analyze -w website   # bundle report → .next/analyze/client.html
```

`dev` and `build` pass `--webpack` explicitly: Next 16 defaults to Turbopack, but the
vanilla-extract plugin wired in here is the webpack one. **Don't drop that flag.**

## Pages

| Group         | Pages                                                                                                                                                                                                                                                                         | Rendering                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Public        | `index`, `catalog/index`, `catalog/[slug]`, `promotions/[slug]`, `privacy`                                                                                                                                                                                                    | SSG + ISR (`privacy` is plain SSG) |
| Behind login  | `checkout`, `orders/index`, `orders/[id]`, `promocodes`, `account`                                                                                                                                                                                                            | Static shell, client-rendered data |
| Guest or user | `cart`, `wishlist` — a guest's lives in the browser (`utils/guestStorage`)                                                                                                                                                                                                    | Static shell, client-rendered data |
| Auth          | `login` — **this is the registration too**                                                                                                                                                                                                                                    | Static                             |
| Owner-only    | `admin/index`, `admin/products/{index,add,[id]}`, `admin/categories`, `admin/import`, `admin/cycles`, `admin/orders`, `admin/checklist`, `admin/users`, `admin/promotions/{index,add,[id]}`, `admin/banners/{index,news/add,news/[id]}`, `admin/promo-codes/{index,add,[id]}` | Static, gated on the client        |
| Errors        | `404`, `500`                                                                                                                                                                                                                                                                  | Static                             |
| Crawlers      | `sitemap.xml`                                                                                                                                                                                                                                                                 | `getServerSideProps`, per request  |

Every page a person can open is static, which is why `next build` reports `/admin/*` as
`○ (Static)`. The one `getServerSideProps` in the app is `sitemap.xml`, which nobody visits:
it writes XML straight into `res` and renders nothing. See [seo.md](seo.md).

Build-time data shared by all static pages (categories, active cycle) goes through
`src/services/staticData.ts`, which caches for 60s — the same TTL as the pages' `revalidate`,
so ISR can't serve anything staler than it would have without the cache. `getStaticPaths`
prerenders up to two thousand product slugs, and without that cache each one re-fetched. Its
state lives on a `Symbol.for` under `globalThis`, not in the module: the server build shares
no module instances between entries, so a page and an API route each get their own copy, and
a reset from one would leave the other's cache untouched.

`catalog/[slug]` uses **`fallback: 'blocking'`**, so a cold URL is rendered on the server and
arrives finished — a product or a real 404, never a skeleton. In production that is the only
path a product page ever takes: the image is built with no access to the API (on purpose, see
`apps/website/Dockerfile`), `getStaticPaths` falls into its `catch` and returns no paths at
all, so every page is generated on first request. `fallback: true` was what stood here, and
on that same cold path production **hung**: a slug that does not exist returned neither a 404
nor a skeleton, and the connection sat open for minutes. A crawler was the one visitor it
worked for — Next renders blocking for bots regardless, and Googlebot got its 404 in 0.3s.

## Keeping the public pages fresh

`revalidate: 60` alone makes an edit in the admin take up to a minute **and one extra
request** to show up: the first request after the entry expires still serves the stale page
and only kicks off the regeneration. The owner who saved a price and opened the catalog saw
the old one and concluded it had not saved.

So the admin invalidates explicitly. `pages/api/revalidate.ts` takes `{"paths": [...]}`,
checks the caller's role through `/users/me` (the route sits on the public domain, and a
logged-in customer is not enough), resets `staticData`, and calls `res.revalidate` on each
path. Paths are checked against a closed list — `/`, `/catalog`, `/catalog/<slug>`, `/promotions/<slug>` — because
revalidating costs a fetch and a render, and the slug shape matches the backend's
`SLUG_PATTERN`. The paths are rebuilt in parallel, and a failure on one doesn't stop the rest;
only a real one lands in `failed`, since a page that isn't in the cache yet is simply
generated, and a deleted product's 404 counts as a successful rebuild.

Rebuilds of the same path are coalesced while one is in flight — the owner editing ten
products in a row would otherwise cost twenty full renders of the showcase. The coalescing is
"a render is running right now", never "we rebuilt this N seconds ago": skipping by time would
drop the very edit the call exists to deliver. A request arriving mid-render instead marks it
stale, and the render repeats once afterwards for everyone who marked it.

The caller is `src/services/endpoints/revalidate.ts`. `refreshPublicPages(...paths)` never
throws and returns nothing on purpose — the save has already succeeded, and `revalidate: 60`
is still there as the backstop, so a failed rebuild belongs in the console, not in a toast.
Every admin mutation that changes what a visitor sees calls it: product create/update/delete/
restore and its photo (plus the **previous** slug when the slug changed — old links still
point at it), categories, cycles, promotions (save, switch, delete — `/`, `/catalog` for the
carousel and `promotionPath(slug)`, the old slug too), the banners section (switch, order, news
save/delete/picture — `/` and `/catalog`) and the xlsx import. The import names only `/` and
`/catalog`: it can touch hundreds of products at once, and their pages are left to the
60-second backstop.

## Catalog banners

Rules: [domain.md](domain.md#catalog-banners). The data layer: `services/endpoints/banners.ts`
(the public `listBannerFeed` and every admin call), `swrKeys.ts` (`adminBannersKey`,
`isAdminBannersKey`, `adminNewsBannerKey`), `apiErrors.ts` (codes `banner_*`,
`too_many_news_banners`; scopes `admin.banners.load`, `admin.banner.{toggle,reorder}`,
`admin.news.{load,create,update,toggle,delete,image}`) and `utils/banners.ts` (feed → widget
slides, optimistic helpers). `utils/banners.ts` keeps its own `isExternal` rather than importing
`widgets/utils`, because the site's vitest cannot build vanilla-extract.

## Auth and token handling

**JWTs never reach the browser.**

- `src/server/cookies.ts` — the httpOnly cookies `lb_at` (access) and `lb_rt` (refresh),
  `SameSite=Lax`, `Secure` unless `AUTH_COOKIE_SECURE=false`; plus `lb_ls`, the in-flight
  login's polling secret. That secret is deliberately **not** the payload in the
  `t.me/…?start=` link: the link is visible in the Telegram chat, so polling on it would let
  anyone who sees the chat claim the confirmed sign-in.
- **Inside Telegram Web the site is a third-party iframe**, where browsers neither store nor
  send `SameSite=Lax` cookies. There the page marks every request with `X-LB-Embedded: 1`
  (`utils/embedding.ts`, added in `services/api.ts`'s single `send`), and `cookies.ts` sets —
  and clears, since a cookie is only removed with the attributes it was set with —
  `SameSite=None; Secure; Partitioned` instead. `Partitioned` (CHIPS) keeps that jar tied to
  `web.telegram.org`, so no other site gets it. Over plain http (dev) it stays `Lax`: `None`
  without `Secure` is dropped. Safari blocks third-party cookies outright, so Telegram Web in
  Safari still cannot keep a session.
- `pages/api/auth/*` — thin proxies to the API's `/auth/*` that set and clear those cookies:
  `telegram/session` (open a sign-in), `telegram/poll` (claim it), `telegram/widget` and
  `telegram/mini-app` (trade a Telegram HMAC signature for the same cookies), plus `me`,
  `refresh`, `logout`.
- `src/server/sameOrigin.ts` — every POST under `/api/auth/*` must come from our own page.
  A cross-site form POST is a "simple" request that no preflight stops: without this check
  `logout` would let an attacker's page sign visitors out, and `telegram/widget` would **set**
  the attacker's cookies (a Telegram signature is valid for a day). `SameSite=Lax` does not
  help — it restricts sending cookies, not setting them. The check accepts either
  `Sec-Fetch-Site: same-origin` or a matching `Origin`; a request with neither is not a
  browser form and passes. The same check guards every non-GET request through `/api/proxy/*` and
  `/api/revalidate`: in the iframe the cookies are `SameSite=None`, and origin is what stands
  between them and a cross-site POST.
- `src/server/apiFetch.ts` — `fetchWithAuth` attaches `Authorization: Bearer` and refreshes
  **proactively** by decoding the access token's `exp` (30s skew) before sending, falling back
  to one refresh-and-retry on a 401. Streamed bodies are `retryable: false` (a stream reads
  once), so the proactive refresh is what covers uploads.
  Every call to the API goes through `callApi`, whose one job is to turn undici's
  `TypeError: fetch failed` into `UpstreamUnavailableError` — the same type a 5xx or a 429
  raises. Both mean "the backend didn't answer, the session is fine", and both come out of the
  routes as `503 upstream_unavailable`; a 401 would sign the visitor out over someone else's
  outage. Uncaught, that `TypeError` used to leave the route as Next's own
  `500 Internal Server Error`, which is what the external `/health` check reported while the
  `api` container was being replaced mid-release — an alarm that named no cause.
- `pages/api/proxy/[...path].ts` — the only route through which the browser reaches the API.
  Transparent, `bodyParser: false` (image uploads and catalog import stream through
  unbuffered), forwards a fixed allowlist: request `content-type`, `content-length`, `accept`,
  `accept-language`; response `content-type`, `content-disposition`, `cache-control`. It
  **404s `/auth/*`** so token pairs can't leak through it.
- `pages/api/revalidate.ts` — on-demand ISR for the public pages, admin-only; see
  [Keeping the public pages fresh](#keeping-the-public-pages-fresh).
- `pages/api/csp-report.ts` — where the browser posts CSP violations (`report-uri` for
  everyone, `report-to` + the `Reporting-Endpoints` header where the site URL is known to be
  https, i.e. production). It normalizes both report formats — legacy
  `{"csp-report": {...}}` and the Reporting API's array — and writes one line per **distinct**
  violation to stdout, prefixed `csp-violation`. Public and unauthenticated by necessity (the
  browser sends no cookies), hence the guards: a 64 KB body cap, reports from browser
  extensions dropped, and each `directive + blocked URI + source` logged once per process so a
  loop can't fill the disk. The dedupe set resets on every deploy, which is what you want
  after editing the policy.
- `src/server/clientAddress.ts` — `clientHeaders(req)` **sets** the `X-Forwarded-For` the API's
  limiter keys anonymous callers on. Without it every visitor arrives as the proxy's single
  address and one impatient guest throttles the whole shop. An _incoming_ `x-forwarded-for` is
  believed only when `TRUST_PROXY_HEADERS=true` (a real load balancer in front of Next);
  otherwise the connection address is used, since the browser can set the header itself.
  Every server-side call — `apiFetch`, `telegramSignIn`, the `auth/*` routes — passes these.
- `src/hooks/useAdminGate.ts` — the `/admin/*` gate, on the **client**. Guests go to
  `/login?next=…` (the path validated by `src/utils/redirect.ts`: only single-slash relative
  paths survive), customers to `/catalog`. It used to be `requireAdmin(context)` in
  `getServerSideProps`, which cost a round-trip on every click into the section; the pages are
  static now and open instantly. No data is exposed — every admin endpoint checks the role
  independently — but the admin **chunks are publicly fetchable**, so treat the section's UI
  structure as public and never put a secret in it. `AdminShell` renders neither navigation
  nor content until the session is known, so a customer never sees the frame of a section
  they can't enter.

Sign-in flows themselves are described in [telegram.md](telegram.md#sign-in).

## Data layer

Client-side fetching is [SWR](https://swr.vercel.app/), configured globally in `_app.tsx` with
`revalidateOnFocus: false`.

- `src/services/api.ts` — a thin `fetch` client with two targets: `api` resolves to
  `/api/proxy` in the browser and to `serverConfig('apiBaseUrl')` (direct, **anonymous**) on
  the server, so `getStaticProps` can only fetch public data. `nextApi` hits `/api/*` and
  throws if called server-side.
- `src/services/session.ts` — the one-signal bridge from the HTTP client to the auth state.
  A 401 **through the proxy** (`target: 'api'`) means the session is gone for good: the proxy
  answers that only after its own refresh-and-retry failed, and it has already cleared the
  cookies. `notifySessionExpired()` fires there, `AuthProvider` subscribes, drops the cached
  profile and `router.replace`s to `/login?next=<current path>` — otherwise the UI keeps
  showing a signed-in visitor whose every next action fails. Guests are excluded (the
  subscription only exists while a user is cached) and so is `/login` itself, and `/api/auth/*`
  (`target: 'next'`) never signals: a 401 from `/api/auth/me` means "guest", not an expiry.
- `src/services/endpoints/*` — one module per domain (`catalog`, `auth`, `cart`, `wishlist`,
  `orders`, `admin`, `cycles`, `export`, `promotions`). **All API calls go through these** — never a raw
  `fetch` in a page.
- `src/services/swrKeys.ts` — **every** SWR key is defined here as a tuple tagged with a string
  first element. Tags exist so all filter/page variants can be invalidated at once:
  `mutate(key => Array.isArray(key) && key[0] === 'admin-products')`. Several `isXKey`
  predicates are exported for exactly that. Keys that hold per-account data (`cart`,
  `wishlist`, `orders`, `order`) include the user id so a different account can't be served
  another's cache.
- `src/services/swrFallback.ts` — build-time values handed to `SWRConfig` as `props.fallback`,
  so any component can read them by key instead of receiving them as a prop through several
  layers. Fallback keys must be run through `unstable_serialize` — `useSWR` accepts tuples but
  `fallback` looks up the serialized form, and a raw tuple simply never matches, silently.
  **A prefilled key switches mount revalidation off only while the page is fresh.**
  `fallback` and `fallbackData` are revalidated on mount by default, so data baked into
  `getStaticProps` was re-fetched in the same second as hydration and `/api/auth/me` — pointless
  for a page rendered a moment ago. But ISR serves a stale copy first and regenerates it in the
  background, so a static page can be days old (see [gotchas.md](gotchas.md)).
  `activeCycleFallback` stamps the render time next to the cycle, and `isFreshFallback(fallback,
key)` answers "prefilled on this page and rendered less than 60 s ago" — `useActiveCycle`
  passes it to `revalidateOnMount`. `pages/catalog/index.tsx` does the same for the first,
  unfiltered, default-sorted product page with `isFreshRender(fallback)`, and the home hero reads the cycle
  through `useActiveCycle` rather than straight from its prop. Changing a filter, the sort or the page
  changes the key and fetches as usual.
- `src/services/apiErrors.ts` — `ApiError { status, code, fields }` plus the machine-code →
  Russian-message table. The backend emits codes only, so **every new `HTTPException` detail
  needs an entry here**. Messages are chosen by **code + `ErrorScope`**, not by code alone:
  `no_active_cycle` means "сбор ещё не открыт" when adding to the cart and "сбор закрылся,
  пока вы собирали заявку" at checkout. UI branches on `error.code`, never on message text.
  422 bodies are unpacked into `fields` for per-input errors.

## Promotions

Rules: [domain.md](domain.md#promotions). The site side:

**Pages**

- `pages/promotions/[slug].tsx` — one promotion, rendered by `PromotionDetails` inside
  `ProductTemplate`. **ISR with `fallback: 'blocking'`** and `revalidate: 60`, the same shape as
  a product page: the production image is built without the API, so `getStaticPaths` returns
  nothing and each page is born on its first visit — finished, or a real 404. A promotion that
  is not running (not started, finished, switched off, archived) is a `404` from the API
  and `notFound` here. A copy already built outlives that until it is rebuilt, which is why
  the admin calls `/api/revalidate` on **every** save, switch and delete (and for the previous
  slug when it changed). The title is «<name> - акция Sululu», the description is the owner's
  text stripped of tags and clamped to 160 characters (`utils/promotionSeo.ts`), the preview
  image is the desktop banner or else the mobile one. See [seo.md](seo.md).
- `pages/promocodes.tsx` — the customer's codes (`GET /me/promo-codes`, key `promoCodesKey(userId)`),
  usable ones first, as `PromoCodeCard`s with copy-to-clipboard. `noindex`, in `robots.txt`.
  It is in the account navigation (`layouts/accountNavigation.ts`, between «Мои заявки» and
  «Профиль») and the footer, but not the header menu.
- `pages/catalog/index.tsx` — the `PromoCarousel` goes into `CatalogTemplate`'s `banner` slot,
  above the title, with the «Приём заказов закрыт» notice (`ClosedCycleNotice`) right under it
  in the same slot. The slides come from `getStaticProps` (`GET /banners` mapped by
  `utils/banners.ts::toBannerSlides`; an API failure means an empty list), so the carousel is
  part of the ISR page and refreshed by `/catalog` revalidation. What is in it and in which
  order is decided by the backend (see [Catalog banners](#catalog-banners)); with no slides
  there is no carousel.
- `pages/index.tsx` — the same `PromoCarousel` and the same feed, in its own compact
  `HomeSection` right after the «Заявка вместо оплаты» section and before the fresh picks;
  refreshed by `/` revalidation. No slides — no section.
- `pages/admin/promotions/{index,add,[id]}.tsx` — owner-only, like the rest of `admin/`, with
  «Акции» in `AdminShell`. The table (`AdminPromotionsTable`) has icon buttons with tooltips only;
  the form (`AdminPromotionForm`) holds two banner fields, the condition and reward builders
  and the promo-code dialog. After `POST` the banners are uploaded in follow-up requests and
  the page moves to the promotion's own card, so a failed banner can be retried at once.
  «Duplicate» is `/admin/promotions/add?from=<id>`: conditions and rewards are copied, dates
  are not, the copy is switched off, unannounced, with a `-copy` slug and no banners.
- `pages/admin/banners/{index,news/add,news/[id]}.tsx` — «Баннеры» in `AdminShell`, right
  after «Промокоды». The index has a live «Сейчас на витрине» preview (`PromoCarousel` over the
  `SHOWN` rows, in list order, `inert`) and `AdminBannersBoard`; an empty carousel shows a
  warning (not after a failed load). The switch and the arrows update the SWR cache **optimistically** and roll back on
  error; a `banner_order_mismatch` re-reads the list. News goes through `AdminNewsBannerForm`;
  after `POST` the pictures upload in follow-up requests and the page moves to the news card,
  like promotions. Every success calls `refreshPublicPages(...SHOWCASE_PATHS)` and invalidates
  `isAdminBannersKey` (and, for a promotion, `adminPromotionKey(id)`); the promotion pages
  invalidate `isAdminBannersKey` back, and the promotion card shows a line from `carouselLine` («Карусель: показывается», or why
  the slide is not there: hidden by the owner, no mobile banner, switched off, not started, finished)
  with a link to the section. Toggling or deleting news also invalidates `adminNewsBannerKey(id)`,
  and the news card re-mounts its form when the fresh `isEnabled` differs from the cached one.
  When the list fails to load, neither the «carousel is empty» warning nor the empty state is
  shown. The board takes `busyKeys` (a set), so several rows can be in flight at once.
- `pages/admin/promo-codes/{index,add,[id]}.tsx` — the owner's promo codes, «Промокоды» in
  `AdminShell` right after «Акции». The list (`AdminPromoCodesTable`) copies a code with
  `navigator.clipboard` («Код скопирован»); there is no showcase to rebuild, so no
  `refreshPublicPages`. The form (`AdminPromoCodeForm`) gets its customer search from
  `useCustomerSearch`. After `POST` the toast names the saved code and the page moves to the
  card. The delete toast says «удалён» or «убран в архив» from the `deleted` flag of the `DELETE`
  answer, not from `participantsCount`. «Duplicate» is `/admin/promo-codes/add?from=<id>`: conditions and rewards are copied; the
  code (regenerated), dates, customer and enabled flag are not. The card has «Использования (N)»
  and, for an archived code, a warning.

**Cart, checkout and orders.** `CartPanel`, `CheckoutPanel`/`CheckoutForm` and `OrderDetails`
show the promotions' discount lines, gift cards (`GiftLine`) and «ещё N сом / M товаров» hints; they take
every figure from the API (`promotions.payableCents` is «К оплате») and add nothing up. The
guest's cart-preview SWR key includes **quantities**, since a threshold is
crossed by pressing «+»; until the answer arrives the block keeps its previous state and the
total is the optimistic `totalCents` (`cartPayableCents` in `widgets/utils`). `ICart.promotions` is required —
`utils/cartPromotions.ts` has the empty `NO_PROMOTIONS`.

**The code field is at checkout and on a placed order** (`orders/[id]`, while `isEditable`), not in
the cart (checking needs a sign-in; the guest's `/cart` shows promotions, gifts and hints). It is
`PromoCodeField`, driven by `usePromoCode` at checkout and `useOrderPromoCode` on the order: a text
«Применить» button beside the input, the customer's `ACTIVE` codes as a quick-pick, and the
«Все мои промокоды» link only when that quick-pick has something in it.

**Hooks worth knowing**

- `usePromoCode(signature, waitForCart)` — input, `POST /cart/promo-code/check`, and a re-check
  whenever the cart's composition (`signature`) changes, so the customer never sees a discount
  the order will not give. The accepted answer is kept whole (`applied`); a code that stops
  fitting is dropped and the reason stays in `error`. It reserves nothing — only `checkout`
  does. The «Ваши промокоды» picker passes a code to `apply(code)`.
- `useOrderPromoCode(order, handlers)` — the same field on a placed order. No check step: `apply`
  sends `POST /orders/{id}/promo-code` with the order's `revision`, and the accepted code is
  shown from the order itself (`order.promoCode`). A refusal stays under the field and the
  order is re-read. «Убрать» asks first, then goes through the page's `runAction`.
- `usePromoCodeOptions(userId)` — the «Ваши промокоды» quick-pick of both fields
  (`promoCodeSummary` words a code's rewards and conditions).
- `useDiscountLossConfirm` — asks before an edit that would lose the owner's discount or a
  promotion. Discounts are counted by the client mirror (`discountLoss`); promotions come from
  the server: `lostPromotions` calls `previewMyOrderEdit` (`POST /orders/{id}/edit-preview`)
  for each edit described by `edits` (`{itemId|variantId, quantity}`, `0` removes), merges the
  results by promotion and `promotionLoss` words them. A failed preview is silent — it is a
  warning, not a decision — and an order with no promotions asks nothing. Without `edits`,
  only discounts are checked (the pre-promotion behaviour). It says nothing about issued promo codes.
- `usePromotionCatalog` (admin) — categories, brands, product search, gift image upload and
  the names of products already chosen (the promotion stores ids only; names are read with
  one `GET /admin/products/{id}` each, since there is no "products by ids" endpoint).
- `usePromotionParticipants` (admin) — the «Участники» dialog, shared by the list and the
  card; reloaded on every open, paged by 20 and back to page 1 each time.
  `usePromoCodeParticipants` is the same for a promo code, on the same dialog.
- `useCustomerSearch(isActive)` (admin) — the debounced customer search behind `CustomerSelect`
  (`props`, `reset`), shared by the «Новая заявка» dialog (`useAdminOrderDraft`) and the promo
  code form.

**Data layer.** `services/endpoints/promoCodes.ts` holds the owner's promo-code calls (the customer
search is `listAdminUsers`, the gift picture `uploadGiftImage`). `services/endpoints/promotions.ts` holds the admin calls, the public
`listPublicPromotions`/`getPublicPromotion` (also used by `sitemap.xml`) and
`listMyPromoCodes`; `checkPromoCode` is in `endpoints/cart.ts` and `previewMyOrderEdit` in
`endpoints/orders.ts`. SWR keys: `adminPromotionsKey(includeDeleted)` (with
`isAdminPromotionsKey` for both variants), `adminPromotionKey`, `adminPromotionParticipantsKey`,
`adminPromotionProductLabelsKey`, `adminPromoCodesKey(includeDeleted)` (with `isAdminPromoCodesKey`),
`adminPromoCodeKey`, `adminPromoCodeParticipantsKey`, `promoCodesKey(userId)` and `isPromoCodesKey` (a checkout
or an order edit reserves or frees a code and a payment issues new ones, so the page and the
pickers go stale together). `apiErrors.ts` has the five `promo_code_*` codes under checkout and the scopes
`promoCode.check`, `promoCodes.load` and `order.promoCode.apply`/`.remove`, the four `promotion_*` codes under seven
`admin.promotion.*` error-map scopes (`create`, `update`, `toggle`, `delete`, `banner`, `giftImage`, `participants`; the title map adds `admin.promotions.load`), and teaches the 422 parser the nested rule fields. The owner's codes have the `admin.promoCode.*` scopes (`create`, `update`, `toggle`, `delete`, `participants`; the title map adds `admin.promoCodes.load`) and the codes `promo_code_taken`, `promo_code_invalid` and `promo_code_user_not_found`.

## State and layout

- `src/contexts/` — `AuthContext`, `CartContext`, `WishlistContext`, all backed by SWR.
  **`CartContext` addresses everything by `variantId`** — `addItem`, `updateItem`,
  `removeItem`, `isItemBusy` — because a cart line is a volume, not a product, and two
  volumes of one serum are two lines. The wishlist stays product-level.
  **A guest has a cart and a wishlist too**, kept in `localStorage` by
  `src/utils/guestStorage.ts`: ids and quantities only, with names, prices and photos read
  each time from the public `POST /cart/preview` / `POST /wishlist/preview`, so a guest sees
  today's prices exactly like a signed-in customer. Neither «В корзину» nor the heart sends
  a guest to `/login` any more; the only door is «Войти и оформить» on `/cart`
  (`/login?next=/checkout`). The moment a user appears, both providers pour the guest's
  lists into the account (`POST /cart/merge`, `POST /wishlist/merge`) through their own
  mutation queues — checkout's `settled()` therefore waits for the merge. On success they
  remove **only what was sent** (`removeGuestCartLines`, `removeGuestWishlistItems`), never
  the whole storage: while a merge is in flight another tab, or the cart rescue below, can
  add to it, and the effect picks that up with a second merge. A repeat is harmless (the
  cart keeps the larger quantity, the wishlist adds only what is missing); a failure keeps
  the storage and retries on the next load. While a signed-in user still has guest lines
  waiting, the cart reports `isLoading`, so checkout cannot say «Оформлять нечего» over a
  cart that is about to arrive. The cart merge sends the guest cart's `cycleId`; a cart
  from a cycle that has since closed or changed is refused (`no_active_cycle` /
  `cart_cycle_changed`), moved into the guest wishlist (`rescueGuestCart`, mirroring the
  scheduler's rescue of real carts) and said so in the cart's error. That message is kept
  apart from the action error (`mergeError`) because the merge usually ends on `/login`,
  and a route change clears action errors.
  The guest preview's SWR key is the **set** of ids (`guestCartKey`, `guestWishlistKey`,
  tagged `cart`/`wishlist` so `isCartKey`/`isLiveStateKey` cover them), so «−»/«+» are
  computed on the spot and only a new or removed product refetches; an empty guest cart
  makes no request at all, and a newly added volume is put into the cache from the preview
  that checked it. The guest wishlist preview drops withdrawn products from the storage,
  so the header count matches the list. Signed-in actions pressed before
  `/api/auth/me` answered resolve the owner themselves (`reloadSession`) and pass it to
  `runMutation`, whose render-time `userId` is still `null`.
  `/api/auth/me` returning 401 means "guest", not an error. A 401 from any **other** endpoint
  does mean the session expired, and `AuthProvider` signs the visitor out and sends them to
  `/login` — see `src/services/session.ts` above.
  `CartProvider`/`WishlistProvider` sit in `_app.tsx`, i.e. on every page, but **fetch only
  once something subscribes**: `useDemand` counts live consumers, and calling `useCart()` /
  `useWishlist()` is the subscription (the hook subscribes from an effect). So the wishlist is
  not loaded on `/account`, `/orders`, `/login` or in the admin section, where nothing shows
  it. `useCart(false)` opts out of the data while keeping the actions — `AdminShell` passes
  `isCartCountShown={false}` to `SiteLayout` for exactly that: no badge in the admin header,
  and therefore no cart request on admin pages.
- `src/layouts/` — `SiteLayout` and `AdminShell`, wrapping the `widgets` templates with
  site-specific navigation. `SiteLayout` fills the header's `search` slot with
  `CatalogSearch`: the widget draws the field and the dropdown — on a narrow screen a
  magnifier that opens the same drawer the burger does, with field and results inside it —
  and the site owns the request (`GET /search/suggest`, debounced) and the addresses each
  row leads to: `/catalog?category=…`, `/catalog?brand=…`, `/catalog/<slug>`, and
  `/catalog?q=…` for Enter. The field empties itself on `routeChangeComplete`, since a row
  opened with the mouse is an ordinary link and passes through no callback.

  When nothing matched, the dropdown also carries `WantedProductPrompt` through the widget's
  `emptyAction` slot — the form for a wish about a product the shop does not stock (see
  [domain.md](domain.md#wanted-products)). A guest sees a sign-in button there instead of the
  field; it pushes `/login?next=<current path>`, like `WishlistButton`. The same sentence
  offers Instagram as the other way, so for a guest the dropdown drops its own
  «Напишите нам напрямую в Instagram» line rather than show the link twice. The catalog page uses the same form as its grid's
  `emptyState` (there is no separate `EmptyState` above it), and under the grid when one or
  two products were found — then titled "Это не то, что вы искали?", since "nothing found"
  over visible cards would be false. While the form is shown the popover's height cap rises
  from `anchorTo`'s 288px to `EMPTY_ACTION_MAX_HEIGHT` (560px), so the form fits
  without an inner scroll; the form is also `isCompact` there (no title, a two-row
  textarea) for short windows. The slot is also the one place in the list where focus may
  leave the search field — the list normally holds it so a click on a row reaches the link,
  which in a form would mean fields nobody can type into.

- `src/components/` — the website-side adapters injected into `widgets` via `ServicesContext`
  (`Link`, `Image`) plus components that need API knowledge (`AddToCartButton`,
  `WishlistButton`, `CatalogSearch`, `WantedProductPrompt`, `TelegramLoginWidget`,
  `TelegramMiniAppSession`, …).
  Anything purely visual belongs in `widgets` instead.
  `AddToCartButton` takes the whole product plus an optional `variantId`: on the product
  page the page owns the choice of variant, and in the catalogue grid — where there is no
  room to choose — a product sold in several variants turns the button into a link to its
  page rather than silently adding the cheapest one. That link is still gated on the cycle:
  with no open cycle it greys out with the same tooltip as every other "+", or it would be
  the one bright button in a grid of dimmed ones. It always adds one: the quantity is set
  afterwards, not before.
  On the product page the row of actions has two states, switched by `ProductDetails`'s
  `isInCart` (the page derives it from the cart for the _selected volume_). Out of the
  cart it is the labelled button as before; in it, the button shrinks into a circle
  carrying the cart glyph — still a link to `/cart` — and `CartQuantityStepper` slides
  in on the freed space through the widget's `quantity` slot. That stepper edits the cart
  line directly (`updateItem`/`removeItem`), exactly as the one inside `/cart` does, and
  its `−` at one removes the line (`min={0}` on `QuantityStepper`, with `decreaseLabel`
  saying so), which plays the whole row back to the labelled button. The catalogue card is
  deliberately untouched: its footer has no room for a stepper on a narrow screen.
  The morph animates width — a documented exception to transform-only motion, same as
  `FaqAccordion`'s height — and `ProductDetails` owns the four details that make it
  behave: the expanded width is **measured** rather than `auto` or `100%`, since neither
  equals what the layout actually gives the button, and a `ResizeObserver` on the row
  throws that measurement away whenever the row changes size, so the next one is taken
  fresh (before paint, in a layout effect) instead of replaying a width from before the
  rotation; the circle's diameter is the row's **measured height**, not the constant 52,
  because that height is authored in `rem` and a larger system font would otherwise make
  an oval; `flex-grow` is off for as long as the width is animated, or flex would
  overrule it; and while it moves, the button clips its own label — the clipping is on
  the button, never on the box around it, since `Tooltip`'s bubble is drawn in that box.
- `src/hooks/` — `useAdminGate`, `useActiveCycle`, `useEditableOrder`, `useProductSearch`,
  `useTelegramLogin`, `useTelegramMiniApp`, `useTelegramBackButton`, `useQrCode`,
  `useQueryParams`, `usePrefetchRoutes`, `useRedirectIfAuthenticated`, `useLoginHref`,
  `useRefreshOnReturn`, `useClampedPage`, `useMediaQuery`, and the promotion ones in
  [Promotions](#promotions).
- **Every link to `/login` goes through `useLoginHref()`**, which adds `?next=` with the current
  path, so the person returns to checkout or their order instead of the catalogue.
- **Scroll and history.** `<Html data-scroll-behavior="smooth">` tells Next to switch the global
  smooth scrolling off during navigation, and `experimental.scrollRestoration` restores the
  position on «назад». Overlays (`MobileMenu`, `HeaderSearch`'s panel, dismissable `Modal`s,
  the gallery viewer) push a history entry through `useBackDismiss` in `widgets`, so the back
  gesture closes them instead of leaving the page. Closing one another way takes the entry
  off with a `history.back()`; while that is in flight the hook holds the page's own
  `pushState`/`replaceState` (it wraps them, and Next looks them up at call time), so a
  `router.push` right after a confirm dialog isn't undone by it. An entry left behind by a
  link click is skipped in the direction of travel — told apart by Next's `state.key`.
- **State that changes behind a long-open tab** — cart, wishlist, the active cycle — is
  re-read when the tab comes back after 30s in the background (`useRefreshOnReturn`, mounted
  in `_app`), since `revalidateOnFocus` is off app-wide.
- **Every removal in the customer flow is undoable from its toast.** Taking a line out of
  the cart (`/cart`, and «−» from 1 on the product page — `CartQuantityStepper`), an item
  out of a submitted order (`/orders/[id]`) or a product out of the wishlist
  (`WishlistButton`, so both `/wishlist` and the catalogue cards) leaves a
  `notify({ tone: 'warning', action: { label: 'Вернуть', … } })` behind it — `IToast.action`,
  one button, rendered by `Toast` next to the close cross, and a toast carrying one lives 10s
  instead of 5s (`ACTION_DURATION` in `ToastContext`). The countdown stops while the stack is
  hovered or holds the focus (`onPause`/`onResume` on `ToastViewport`) and resumes from where
  it stopped, never with less than a second left: an undo that expires under the hand reaching
  for it is no undo, and a timer that cannot be stopped fails WCAG 2.2.1. The tone is `warning`, not `success`:
  something the person had is gone, and the toast is the only way back. Restoring it reports
  `success`. There is no "undelete" on the API: the button
  re-adds the volume (`POST /cart/items`, `POST /orders/{id}/items`) or the product
  (`POST /wishlist/items`) with the quantity read off the row **before** the removal, so it
  has to be captured in the handler — afterwards the row is already gone from the cache. A
  line whose volume was deleted from the catalogue (`IOrderItem.variantId === null`) gets no
  button: that add would be refused. Restoring reports its own result with a second toast, and pressing the button
  closes the first one immediately. Removals that are a step inside a larger move, not a
  user's decision — `EditableOrderNotice` emptying the cart into an open order — call the
  context directly and stay silent. Removing an item from a submitted order also asks first
  (`confirm`, «Удалить товар из заявки?»): it changes what the owner sees, while the cart and
  the wishlist only change the person's own draft.
- **Anything the session decides must not resize the page.** All pages are static, so the
  first frame does not know guest from signed-in, and `/cart`, `/wishlist` and `/login` used
  to swap a short "войдите" for a full list half a second later — the footer rode along, and
  that was the worst CLS on the site (0.394 on `/wishlist`). `styles/layout.css.ts`'s
  `sessionArea` reserves a screen around such a region, and `/wishlist` renders **nothing**
  until the session is known: its skeleton is eight cards tall, and collapsing that into an
  empty state is a shift no `min-height` can absorb. Put the reserve on a wrapper _around_ a
  card, never inside one — inside, it stretches the card itself and leaves a third of a screen
  of empty space framed under the content (`/login` did exactly that).

## Link previews and icons

`src/components/PageMeta.tsx` holds both halves of a link preview:

- **`SiteMeta`** — the constant part (`og:site_name`, `og:type`, `og:locale`, the site's own
  title/description/image, `twitter:card`). Rendered once in `_app`, so every page has a
  preview, private ones included.
- **`PageMeta`** — the page's own `<title>`, description, canonical link, `og:title`,
  `og:description`, `og:url` and optionally `og:image`. Used by the three public pages;
  `catalog/[slug]` passes the product's primary photo, whose URL the API already stores
  absolute (`PUBLIC_FILES_BASE_URL`).

Structured data is a separate layer next to this one: `_app` renders the `OnlineStore` node
beside `SiteMeta`, and the public pages add their own (`src/components/JsonLd.tsx`,
`src/utils/jsonLd.ts`) — see [seo.md](seo.md#structured-data-json-ld).

`canonical` and `og:url` are both built from the `path` prop, so they cannot drift apart, and
`path` never carries query parameters — see [seo.md](seo.md#metadata) for why that is the
right canonical for the catalogue, and for where the title and description copy comes from
(`src/utils/seo.ts`, not the pages).

The override works **only because every tag carries a `key`**: `next/head` deduplicates by
`name`/`http-equiv`/`charSet` or an explicit key, and `property` — which is what every `og:*`
tag uses — is not in that list. Drop the key and both tags ship, with scrapers picking
whichever they see first. The page's `<Head>` renders after `_app`'s, and the later one wins.

Absolute URLs come from `publicConfig('siteUrl')` (`NEXT_PUBLIC_SITE_URL`), not from
`apiBaseUrl`: the two carry the same string in production but not in development.

Static files in `public/` that go with this: `favicon.ico` (16/32/48 in one container, for the
request browsers make on their own), `favicon.svg`, `apple-touch-icon.png` (no rounding — iOS
adds its own), `logo.png` (180×180, the mark on its own tile, referenced by the `OnlineStore`
node's `logo`), `og-image.png` (1200×630) and `robots.txt`. The `.ico` link in `_document`
declares `sizes="16x16 32x32 48x48"`, all three that the container actually holds: Google puts
a favicon next to a result only when it finds a square that is a multiple of 48, and a link
claiming `32x32` hides the 48 that is in there. All of them carry the same mark —
the `SL` monogram in Inter SemiBold, converted to outlines, since neither an icon file nor a
rasterised preview can reference a webfont. The preview repeats the home page's own scene
(canvas, two decor bottles with their pastel halos) so the link and the landing match.
`robots.txt` also declares the `Sitemap:` line, with the production URL written out: the file
is static, so there is no environment variable to interpolate. The map itself is generated —
`pages/sitemap.xml.ts`, described in [seo.md](seo.md).

## Seasonal decor

The New Year decor lives in `src/seasonal/` and `public/seasonal/newyear/` (SVG, 11 files).
`HeaderGarland` and `CartHat` are rendered by `SiteLayout` through the `Header.decor` and
`Header.cartDecor` slots of `widgets` (see [widgets.md](widgets.md#decor-slots)).

- **Flag.** `season.ts`: `NEW_YEAR_DECOR` (`auto` | `on` | `off`) and the window
  `NEW_YEAR_START` / `NEW_YEAR_END` (`MM-DD`, Bishkek time, may span New Year). The three are
  baked in at build through `env` in `next.config.js` (build args in the image), so the
  emergency `off` means rebuilding. See [environment.md](environment.md).
- **The date is checked in the browser.** Pages are static, so a server-side check would freeze
  at build time. `useNewYear()` is `useSyncExternalStore` returning `false` on the server and
  during hydration, then whether `<html>` carries `data-newyear` (set by the early script). The
  decor and the reserved space therefore come from one source and are fixed at page load: a tab
  left open across midnight does not turn the decor on or off until reloaded. Every component in
  `NewYear.tsx` (`NewYearOnly`, `HeaderGarland`, `CartHat`, `Snowfall`, `PageSnowfall`, `CardHat`, `Decor`) goes through
  it, so the decor appears after hydration, never in the first frame.
- **Early script.** What must be in the first frame (reserved space, grid `row-gap`) hangs on
  `data-newyear` on `<html>`. `earlyScript.ts` builds an inline script from the same
  mode/window values and `_document` embeds it; it needs no CSP change (`script-src` already
  has `'unsafe-inline'`). The script logic and `isNewYearActive` are checked against each other
  by `earlyScript.test.ts` over a date grid.
- **Styles.** `seasonal/newyear.css` is a plain global stylesheet imported in `_app.tsx`
  (Pages Router allows global CSS only there); every rule hangs on `.ny-*` classes. Most render
  only in season; four hooks are always in the markup: `.ny-catalog-grid`, `.ny-auth`
  (`/login`), `.ny-error` (404) and the `.ny-success` wrapper (checkout success screen). Their
  rules work under `html[data-newyear]`, except the layout-neutral base rule
  `.ny-success { display: contents }`, so out of season
  nothing visible changes and no `/seasonal/*` request is made.
- **Catalog (`/catalog`).** Three places, all through widget slots:
  - `PageSnowfall` (`seasonal/NewYear.tsx`) is rendered once by the page: a
    `<div class="ny-page-snow">` with `position: fixed; inset: 0; z-index: -1` holding a pink
    `.ny-snowfall`. In the root stacking context `-1` paints above the page background but under
    every block with its own background (cards, header, fields, carousel), so the snow falls on
    the page itself, never over photos or text, and takes no clicks. That needs `html[data-newyear] body { background-color: transparent }`: `global.css.ts` paints the page color on both `html` and `body`, and `body`'s background, as a descendant's, would cover the `-1` layer; `html` keeps the same color, so nothing else changes. It is out of flow, so it
    needs no reserved box: it mounts after hydration without shifting anything, and out of season
    it is not in the markup at all. The snow sits inside the wrapper rather than being the fixed
    block itself because `.ny-snowfall ~ *` would otherwise reposition the page's siblings.
    There is no decor between the heading and the filters any more (the 160px strip with a tree
    is gone), so that step is the template's own 24px in and out of season.
  - `CardHat` goes through `ProductGrid.renderCardDecor` on every sixth card starting with the
    first (`hasCardHat`, `index % 6 === 0` on the running index) with `indexOffset = ((page?.page ??
pageNumber) - 1) * (page?.pageSize ?? PAGE_SIZE)` (pagination is page-by-page, and the offset
    follows the data on screen). Out-of-stock products get no hat, so it never covers the "Нет в
    наличии" badge. The grid gets `className="ny-catalog-grid"`.
  - `html[data-newyear] .ny-catalog-grid { row-gap: 32px }` — only the row gap changes (the
    column gap stays), at all three ranges (base 12 → 32, `sm`/`md` 24 → 32). Space above the
    grid needs no rule: `CatalogTemplate` already leaves 48px between its blocks.
- **Site-wide: the "Товар в избранном" toast.** `WishlistButton` passes
  `<Decor name="stocking" size={28} />` as `icon` of that toast only (the cart has no visible
  toast). It fires wherever `WishlistButton` is used: `/`, `/catalog`, `/catalog/[slug]` and
  `/wishlist`.
- **Cart (`/cart`).** Two places (the empty state and the heading), plus two notes:
  - Empty cart: `EmptyState icon={<Decor name="gift-box-blush" size={140} className="ny-decor--empty" />}`.
    **No reserved box is needed here, and that is the rule for any empty state:** the cart body is
    client-only (the server HTML holds the skeleton, never "Пока пусто"; checked with `curl`), so
    the empty state and its `Decor` mount in the same commit, with `width`/`height` already set,
    inside `sessionArea` (`min-height: 100vh`). Nothing the decor adds happens after the first
    paint of the block. Out of season `Decor` is `null` and the `EmptyState.icon` wrapper hides
    itself (`:empty`), so the view is as before (heading at y=307 at 360px, same as without the
    change). If an empty state is ever rendered into the server HTML, it needs a reserved
    always-present box (reserved in the first frame by a CSS rule under `html[data-newyear]`, the way `.ny-auth` reserves the login page's top padding); do not reuse the cart approach there.
  - `.ny-decor--empty` (`newyear.css`): on phones the illustration is capped at 96px
    (`max-height`, `width: auto`). Used by the empty states of `/cart` (gift-box-blush 140, 132x140 on desktop, capped to 96 high on phones),
    `/wishlist` (stocking 140, 101x140 on desktop, capped to 96 high on phones) and
    `/orders` (snowflake 96, hidden on phones).
    First-screen arithmetic, 360px, guest/user with an empty cart: heading 307, button bottom 505
    without the season; with the 140px gift it would be 657 (below the fold of 360x640), with the
    cap 613, which fits 640.
  - Non-empty cart only (`cart.items.length > 0`; the empty one has its own gift), two slots:
    - `CartStockings` (three stockings, 40/34/40px) into `CartTemplate.titleDecor`. The slot has
      zero height, so the heading row (36px) and everything below it stay put. The wrapper is
      inside `NewYearOnly`, so out of season the slot is empty and hidden (`:empty`), no gap.
    - `CartTree` (a 96px tree with three gifts at its foot) into `CartTemplate.decor`, an
      absolute layer over the heading block. `.ny-cart-tree` sits at `right: 24px; bottom: -16px`
      and is shown from `lg` (1024px) only: there the space right of the subtitle is free (the
      total panel's column is below it), while narrower the subtitle wraps under the tree.
      Measured at 1512px: tree 123-219, garland bottom 94, total panel top 227.
      `CartTree` takes `placement`: `head` is this layer (from `lg`), `below` is the same tree in
      the flow right after the panel, centred, shown **below `lg` only**, so each screen has
      exactly one. `below` mounts in the same commit as the panel with items (both wait for the
      cart), so it shifts nothing. The gap above it is 24px: the cart passes `hasGap`
      (`.ny-cart-tree--gap`), since `sessionArea` is a plain block; on `/checkout` the tree is a
      direct child of the `CartTemplate` column, whose `gap` gives the 24px.
      `/checkout` renders both placements, only on the form itself (`order === null` and a
      non-empty cart): the success screen has its own snow and gift, and the login /
      nothing-to-order states get no decor.
      The list, the total and the checkout button carry no decor.
  - Sticky total panel (`lg`): `top: calc(headerOffset + space.lg)`, so it always clears the
    header (73px while the header is sticky or floating, 0 in Telegram unpinned mode) plus 24px
    of air. The same holds for the checkout form. In season the garland hangs to y=94 and the
    panel's top edge stays below it. The checkout button is never covered.
- **My orders (`/orders`).** Only the "Заявок пока нет" empty state (the `emptyState` of
  `OrderList`) gets `icon={<Decor name="snowflake" size={96} className="ny-decor--empty ny-decor--hide-mobile" />}`; the
  "log in" state and the error `Alert` get no decor. **No reserved box is needed:** that state
  renders only when `OrderList` is not loading, and it is loading on the server and during
  hydration (`isAuthLoading || isLoading` with no data), so the server HTML holds the skeleton and
  the snowflake mounts in the same commit as the empty state, with `width`/`height` set. Out of
  season `Decor` is `null` and the `EmptyState.icon` wrapper hides itself (`:empty`), so the view is
  as before. First-screen arithmetic at 360x640, measured: the empty state's icon/heading start at 419; the
  button sits at 525-569 out of season; with a 96px snowflake it would be 633-677, so on <=640px
  the snowflake is hidden (`ny-decor--hide-mobile`); with it hidden the button is at 537-581 (the
  empty icon wrapper keeps the 12px column gap). From 641px the snowflake is 96px.
- **Order sent (`/checkout`, `order !== null`).** The success screen wraps the order number and
  the "Заявка принята" `Alert` in `<div className="ny-success">` together with `<Snowfall />` and
  `<Decor name="gift-box" size={160} className="ny-decor--success" />` (snow first, so
  `.ny-snowfall ~ *` lifts the gift, number and alert above it; snow shows around the order number (plain text,
  no background) while the alert has an opaque background, so the paragraph with "Telegram" reads
  on a solid fill; the snow has `pointer-events: none`). Cancelled orders get no decor: no snow and
  no gift, only the wrapper stays). **No reserved box is
  needed:** the screen only exists after a client-side submit or after `?order=` is re-read with
  `getMyOrder` in an effect, both after hydration, so the gift mounts in the same commit as the
  order itself, with `width`/`height` already set. Out of season `.ny-success` is `display: contents`
  (its children behave as direct children of the `CartTemplate` column, so the layout is the same
  as before the change) and only `html[data-newyear]` turns it into a 24px-gap flex column with
  `position: relative`. `.ny-decor--success` caps the gift at 112px on phones (`max-height`,
  `width: auto`) and lifts the cap from 641px, where the prop size 160 applies (151x160 on desktop).
  First-screen arithmetic at 360x640 (editable order, three-line summary): heading
  block 121-235, gift 259-371, number 395-419, alert 443-637; the "Telegram" line sits at
  526-543, 97px above the fold. With the full 160px gift it would be 574-591, which still fits but
  leaves the alert's tail and the picker lower for no gain, hence 112.
- **Home (`/`).** Five places, all through widget slots (no new components):
  - **Hero**: `HomeHero.decor={HERO_DECOR}` = `Snowfall` + `Decor tree` (140) + `Decor gift-box` (96),
    the pictures positioned by `.ny-hero-tree` / `.ny-hero-gift` (`newyear.css`, bottom-right,
    mobile-first: hidden by default, the tree shows from 768px and the gift from 1024px, because
    below that the showcase ribbon lies along the bottom edge and would cover them). The layer has
    `z-index: 0`, so it is its own stacking context under the content. The slot is an `absolute`
    layer under the content, so it takes no space and mounting after hydration shifts nothing.
    The existing `DecorField` (`background`) is untouched; the decor layer comes after it.
  - **LCP.** Measured with a `PerformanceObserver` on hard loads with the date forced into the
    window: the LCP element is the same with and without the decor at 360, 768 and 1440 (text at
    360/768, the first showcase photo or `DecorField` image at 1440). The pictures are lazy and
    smaller than every candidate. **The snow is the trap:** as a full-size `background-image` the
    snowfall tile became the LCP candidate itself (360x740 px, later than the text). It is now
    painted with `mask-image` over a flat `background-color` (the tiles are single-colour:
    `#D9A3BE` and white, alpha inside the SVG), which Chrome does not count for LCP, and the
    SVG animation still runs inside the mask. This applies to every `Snowfall`.
  - **Fresh picks grid**: `className="ny-catalog-grid"` (row-gap 32px in season) and
    `renderCardDecor` with the plain `index` (one page, no offset), in-stock products only. The
    hero showcase gets no hats: its ribbon is `overflow-x: auto` and would clip them.
  - **"Как это работает"**: `StepList.renderIcon` returns `Decor` stocking / snowflake / tree /
    gift-box (56px) by step index (`STEP_DECOR`; the page has exactly four steps). The slot is
    `absolute` in the card's top-right corner, half over its edge, so nothing in the flow changes.
  - **Headings "Ассортимент" and "Вопросы"**: `SectionHeading.titleDecor` = `Decor candy-cane` (48px).
    Both carry `ny-decor--hide-xs`: hidden below 360px (mobile-first, `display: none` by default),
    where the edge of the screen would clip them.
    The slot sits inside the `<h2>` after the last word as a zero-width, zero-height inline box and
    the picture overflows it, so word wrapping and the line height are unchanged (a flex slot like
    `CartTemplate.titleDecor` would narrow the heading and could re-wrap it after hydration).
  - **Telegram block**: `HomeCta.background` = `Snowfall tone="white"` + `snowflake-white` with
    `ny-decor--corner ny-decor--hide-mobile` (the corner flake lies under the second line of the
    note at 360px, so on phones only the snow stays; the bot button is never touched).
  - The `logoNote` banner is untouched.
- **Wishlist, login, footer, 404, privacy.**
  - **`/wishlist` empty state:** `EmptyState icon={<Decor name="stocking" size={140} className="ny-decor--empty" />}`.
    No reserved box: the page renders nothing until the session is checked (`isAuthLoading` gives `null`), so
    the empty state exists only on the client after hydration (server HTML has no "Пока пусто"; checked
    with `curl`) and the stocking mounts in the same commit with `width`/`height` set. Stocking is 101x140 on desktop; capped to 96px high on
    phones by `ny-decor--empty`; at 360x640 (guest, empty list) the button sits at 499-543, inside the
    fold, so no `ny-decor--hide-mobile` is needed.
  - **`/login` and 404:** `AuthTemplate.decor` (`tree` 96) and `ErrorTemplate.decor` (`candy-cane` 120),
    classes `ny-decor--auth` / `ny-decor--error`. Both pages are static and
    the card is in the server HTML, so the picture is an `absolute` layer over the card's top edge (no
    space in the flow). The card has only 48px of padding above it and the garland hangs to y=94, so
    from 641px the page container gets extra top padding (`.ny-auth` +72px, `.ny-error` +88px) under
    `html[data-newyear]`, i.e. reserved in the first frame by the early script, not added with the
    picture: the card does not move when the picture mounts. The picture and the reserve share one condition, `min-width: 641px` and `min-height: 500px`: below 641px, and in a phone's landscape orientation (height < 500), there is neither picture nor reserve, and the
    card stays at y=121 as out of season. Measured top of the picture: /login 105 at every size; 404 97-162 (centred, depends on viewport height: 97 at 1440x700, 125 at 1440x900, 162 at 768x1024) - always below the garland (y=94). The 404 page already had "В каталог".
  - **Footer:** no decor; `SiteLayout` passes nothing to `Footer.decor` (the owner removed
    the three trees that stood there).
  - **`/admin/*`:** `AdminShell` renders `SiteLayout`, so the garland and the cart hat show in `/admin` too - by design (owner's decision).
  - **`/privacy`:** no decor of its own, only the header garland.
- **Removing the theme.** Delete, all of it:
  - `apps/website/src/seasonal/` and `apps/website/public/seasonal/`;
  - every import and render of the `seasonal` components (including the `decor` and `cartDecor`
    props of `Header` in `SiteLayout`), and the `newyear.css` import in `_app.tsx`;
  - in `pages/cart.tsx`: the `Decor` import, `titleDecor` and the `icon` of the empty state;
  - in `pages/orders/index.tsx`: the `Decor` import and the `icon` of the empty state;
  - in `pages/wishlist.tsx`: the `Decor` import and the `icon` of the empty state;
  - in `pages/login.tsx`: the `Decor` import, `decor=` and the ` ny-auth` class; in `pages/404.tsx`:
    the `Decor` import, `decor=` and `className="ny-error"`;
  - in `pages/checkout.tsx`: the `seasonal` import, `isFestive` and the comments above the wrapper,
    and the `ny-success` wrapper with `Snowfall` and `Decor` (keep the number and the alert as
    direct children of the fragment);
  - in `pages/catalog/index.tsx`: `<PageSnowfall />` (with its comment), `className="ny-catalog-grid"`,
    `indexOffset` and `renderCardDecor`;
  - the early script in `_document.tsx` (the `NEWYEAR_EARLY_SCRIPT` import and its `<script>`);
  - `env` in `next.config.js`;
  - in `components/WishlistButton.tsx`: the `Decor` import and the `icon` (with its comment) of the "Товар в избранном" toast;
  - `"passThroughEnv": ["NEW_YEAR_*"]` of the `dev` task in `turbo.json`;
  - outside the repository: the `NEW_YEAR_*` repository variables on GitHub (Settings → Secrets and variables → Actions → Variables) and any `NEW_YEAR_*` line in the server's `.env.prod`;
  - the `// TODO` about the New Year `logoNote` text in `SiteLayout` (the slot itself stays);
  - the `NEW_YEAR_*` `ARG`s, their `ENV` lines and the comment above them in `apps/website/Dockerfile`;
  - the `NEW_YEAR_*` build args in `.github/workflows/release-tag.yml` and `docker-compose.prod.build.yml`;
  - the block in `apps/website/.env.example`;
  - the paragraph in `README.md`;
  - the `NEW_YEAR_*` rows and their mention in the repository-variables paragraph of `docs/environment.md`;
  - the "Emergency off for the New Year decor" paragraph in `docs/deployment.md`;
  - the commented block in `deploy/.env.prod.example`;
  - in `pages/index.tsx`: the `seasonal` import, `STEP_DECOR`, `HERO_DECOR`, `CTA_DECOR`, `decor=`,
    `renderIcon`, `titleDecor` (two), `background={CTA_DECOR}`, and on the fresh grid `className="ny-catalog-grid"`
    and `renderCardDecor`;
  - this section and the `env` bullet under `next.config.js` here.

**Stays:** every `widgets` slot from [widgets.md](widgets.md#decor-slots) (`Header.decor`/`cartDecor`/`logoNote`, `CatalogTemplate.decor`, `ProductCard.decor`, `ProductGrid.renderCardDecor`/`indexOffset`, `IToast.icon`, `CartTemplate.titleDecor`, `SectionHeading.titleDecor`, `StepList.renderIcon`, `HomeHero.decor`, `AuthTemplate.decor`, `ErrorTemplate.decor`, `Footer.decor`, the `:empty` rules), their stories and tests: they know nothing about the season.

The `Header`'s `logoNote` slot is kept for a short seasonal caption next to the logo;
`SiteLayout` leaves a `TODO` where its text goes.

## Configuration

`src/сonfig.ts` (Cyrillic `с`!) exposes `publicConfig(key)` and `serverConfig(key)`. Server
values throw if read in the browser: Next only inlines `NEXT_PUBLIC_*`, so a server value read
client-side would silently become its default. Variables: [environment.md](environment.md).

A few `.env.example` vars (`NEXT_PUBLIC_WP_BASE_URL`, `NEXT_PUBLIC_APP_URL`,
`FALLBACK_BASE_URL`, reCAPTCHA, GTM/UA ids) are leftovers from a WordPress-backed prototype.
They are still read into the config module but consumed nowhere — don't take them as evidence
of a live WordPress integration.

## `next.config.js`

- **`output: 'standalone'`** for the production image.
- **`env`** bakes `NEW_YEAR_DECOR` / `NEW_YEAR_START` / `NEW_YEAR_END` into the bundle (see "Seasonal decor").
- **Security headers** in `headers()`. Two CSPs on purpose: a short **enforced** one
  (`base-uri` / `form-action` / `object-src` / `frame-ancestors`) and a full
  **`Content-Security-Policy-Report-Only`** that is not enforced yet — the pages are static so
  there is no per-request nonce, and `script-src` still needs `'unsafe-inline'` for Next's own
  inline script. Read the reports before promoting it. `X-Frame-Options` is deliberately
  absent: it cannot express "allow Telegram only", which `frame-ancestors` does — the site
  runs as a Mini App inside `web.telegram.org`. **Adding any third-party script, iframe or API
  host means editing that policy**, or it silently breaks in the browser. Both policies report
  violations to `pages/api/csp-report.ts` (described above), so "read the reports" means
  `docker compose logs website | grep csp-violation` on the server, not a browser console.
- **`rewrites()`** proxies `/files/:path*` to `${API_BASE_URL}/files/:path*` so product images
  are same-origin; Next 16's image optimizer refuses hosts resolving to a private IP.
  `src/components/Image.tsx` rewrites the API's absolute URLs to those relative ones.
  The destination is resolved **at build time**: `next build` writes it into
  `.next/routes-manifest.json`, and the standalone server reads that manifest instead of
  re-running `next.config.js`. So `API_BASE_URL` has to be present during the image build —
  `apps/website/Dockerfile` takes it as a build arg, and the image is built in CI
  (`.github/workflows/release-tag.yml`), which passes `http://api:3001` there — the same
  value `docker-compose.prod.yml` sets in `environment:` at runtime. Miss the build arg and every photo
  is proxied to `http://localhost:3001` inside the website container: `/files/*` answers 500,
  and `/_next/image` turns that into 400 ("The requested resource isn't a valid image").
- **`allowedDevOrigins`** lists private-network patterns plus anything in `NEXT_DEV_ORIGINS`.
  Next 16 blocks `/_next/*` (including the HMR websocket) for any origin but `localhost`, and
  the symptom is not an error but the page **reloading itself** about every 90 seconds — the
  HMR client gives up after 25 failed reconnects and calls `location.reload()`. This is what
  you hit opening the dev server from a phone at `192.168.x.x:3000` or inside Telegram. A
  tunnel (ngrok and friends) has a foreign hostname: add it via `NEXT_DEV_ORIGINS`, not here.
- vanilla-extract and `@next/bundle-analyzer` are wired through `next-compose-plugins`. The
  analyzer only activates on `ANALYZE=true`, writes `client.html` / `nodejs.html` /
  `edge.html` into `.next/analyze/` (gitignored), and reports **uncompressed** bytes by
  default — switch to the gzip column before comparing against a budget.
- SVGs go through `@svgr/webpack` + `url-loader`.
