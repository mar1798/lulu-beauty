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

| Group        | Pages                                                                                                                               | Rendering                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Public       | `index`, `catalog/index`, `catalog/[slug]`                                                                                          | SSG + ISR                          |
| Behind login | `cart`, `checkout`, `orders/index`, `orders/[id]`, `account`, `wishlist`                                                            | Static shell, client-rendered data |
| Auth         | `login` — **this is the registration too**                                                                                          | Static                             |
| Owner-only   | `admin/index`, `admin/products/{index,add,[id]}`, `admin/categories`, `admin/import`, `admin/cycles`, `admin/orders`, `admin/users` | Static, gated on the client        |
| Errors       | `404`, `500`                                                                                                                        | Static                             |
| Crawlers     | `sitemap.xml`                                                                                                                       | `getServerSideProps`, per request  |

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
path. Paths are checked against a closed list — `/`, `/catalog`, `/catalog/<slug>` — because
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
point at it), categories, cycles, and the xlsx import. The import names only `/` and
`/catalog`: it can touch hundreds of products at once, and their pages are left to the
60-second backstop.

## Auth and token handling

**JWTs never reach the browser.**

- `src/server/cookies.ts` — the httpOnly cookies `lb_at` (access) and `lb_rt` (refresh),
  `SameSite=Lax`, `Secure` unless `AUTH_COOKIE_SECURE=false`; plus `lb_ls`, the in-flight
  login's polling secret. That secret is deliberately **not** the payload in the
  `t.me/…?start=` link: the link is visible in the Telegram chat, so polling on it would let
  anyone who sees the chat claim the confirmed sign-in.
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
  browser form and passes.
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
  `orders`, `admin`, `cycles`, `export`). **All API calls go through these** — never a raw
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
  **A prefilled key must also switch mount revalidation off.** `fallback` and `fallbackData`
  are revalidated on mount by default, so data carefully baked into `getStaticProps` was
  re-fetched anyway, in the same second as hydration and `/api/auth/me`. It can't be fresher
  than the page: `revalidate: 60` bounds both. `hasFallback(fallback, key)` (same module,
  reading `useSWRConfig().fallback`) answers "is this one prefilled on this page" —
  `useActiveCycle` passes it to `revalidateOnMount`, and `pages/catalog/index.tsx` does the
  same for the first, unfiltered product page. Changing a filter or page changes the key and
  fetches as usual; only the mount is skipped.
- `src/services/apiErrors.ts` — `ApiError { status, code, fields }` plus the machine-code →
  Russian-message table. The backend emits codes only, so **every new `HTTPException` detail
  needs an entry here**. Messages are chosen by **code + `ErrorScope`**, not by code alone:
  `no_active_cycle` means "сбор ещё не открыт" when adding to the cart and "сбор закрылся,
  пока вы собирали заявку" at checkout. UI branches on `error.code`, never on message text.
  422 bodies are unpacked into `fields` for per-input errors.

## State and layout

- `src/contexts/` — `AuthContext`, `CartContext`, `WishlistContext`, all backed by SWR.
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
  site-specific navigation.
- `src/components/` — the website-side adapters injected into `widgets` via `ServicesContext`
  (`Link`, `Image`) plus components that need API knowledge (`AddToCartButton`,
  `WishlistButton`, `TelegramLoginWidget`, `TelegramMiniAppSession`, …). Anything purely
  visual belongs in `widgets` instead.
- `src/hooks/` — `useAdminGate`, `useActiveCycle`, `useEditableOrder`, `useProductSearch`,
  `useTelegramLogin`, `useTelegramMiniApp`, `useQrCode`, `useQueryParams`,
  `usePrefetchRoutes`, `useRedirectIfAuthenticated`.
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
