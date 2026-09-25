# SEO

What the site tells crawlers, and where each piece of it is written. The work follows
`SEO_PLAN.md` at the repo root (Russian, addressed to the owner); `SEO_AUDIT.md` records the
state everything started from. This document describes what is **shipped**, not what is
planned.

## robots.txt

`apps/website/public/robots.txt`, static. Public: the home page, the catalogue, product
pages and `/privacy`. Everything behind sign-in is disallowed (`/cart`, `/checkout`,
`/account`, `/orders`, `/wishlist`, `/login`), and so are `/admin` and `/api/`.

`/privacy` is deliberately **not** disallowed. The bot links it in its first message and
people look for it by name; a policy hidden from search is a policy that cannot do the one
job it has.

The `Sitemap:` line spells out `https://sululu.store/sitemap.xml`. A static file cannot
interpolate `NEXT_PUBLIC_SITE_URL`, and robots.txt is only ever read on the production host,
so the absolute production URL is the honest value — not a bug to be fixed with a dynamic
route.

## sitemap.xml

`apps/website/src/pages/sitemap.xml.ts` — the only `getServerSideProps` in the app. It writes
XML into `res` and closes the response; the default export is a component that renders `null`
and is never reached.

It lists the home page, `/catalog`, `/privacy`, and one URL per product, walking `GET /products` in pages
of 100 (the endpoint's ceiling) until `total` is reached, with a 50-page stop so a bad `total`
cannot spin forever. Cached for an hour at the edge (`s-maxage=3600`), the same staleness the
catalogue's ISR already accepts.

Two decisions worth keeping:

- **`<lastmod>` on products only, from the database.** It is the product's `updatedAt`, which
  the public product response now carries; a build date or "today" would be a fabrication, and
  Google stops trusting `lastmod` across the whole file once it catches one. The home page and
  the catalogue have no honest modification date of their own — both are assembled out of the
  whole catalogue — so they carry no tag. `/privacy` carries none either: its revision date is
  written into the page itself, and a static file has no machine-readable one. `<changefreq>` and `<priority>` are never written:
  Google has ignored them since 2023.
- **API failure answers `503`, not a short sitemap.** A map missing half the catalogue reads
  as "those URLs are gone". A `503` with `Retry-After` is re-fetched; a truncated list is
  believed.

Categories and brands are not in the map because they are not pages yet — they live in query
parameters (`/catalog?category=…`). They join it when they become real routes.

A product missing from the current buying round stays in the map: its page is alive and
answers 200, and striking the URL out would tell the crawler it is gone. Only withdrawn
products leave, because they have left the catalogue itself.

## Metadata

`apps/website/src/components/PageMeta.tsx` renders the tags: `SiteMeta` in `_app` carries the
constant part, `PageMeta` overrides per page by `key`. The `og:image` rule is in
[frontend.md](frontend.md#link-previews-and-icons).

The **copy** lives apart from both, in `apps/website/src/utils/seo.ts`, because every page
type shares the same formulas and the same length budget. Category and brand pages will reuse
them when those routes exist.

`<link rel="canonical">` comes free with `PageMeta`: it is built from the same `path` prop as
`og:url`, so the two can never disagree, and every public page is self-canonical. `path` is a
**path**, never a query string — the catalogue's `?category=`, `?brand=`, `?q=` and `?page=`
select a view on the client out of one and the same static HTML, so `/catalog` is the honest
canonical for all of them. Absolute URLs come from `NEXT_PUBLIC_SITE_URL`, which is what Next
would otherwise call `metadataBase`.

Titles are assembled from a ladder of variants, longest first, and the first one fitting 60
characters wins; what drops off, in order, is the shop name, then the volume, then the price.
The product's own name is never cut, and the city never drops — a Korean product name can eat
the whole budget on its own, and about a quarter of titles come out longer than 60 as a
result. That is deliberate: a search engine truncates the tail of a long title but still reads
all of it, whereas a name chopped mid-word is wrong in the result list itself.

Descriptions are `{brand} {name} по низкой цене — {price}.`, then the first sentence of the
product's `description` if the owner wrote one, then the delivery line — value first, because
the tail is what gets cut. The delivery line is appended only when it fits whole: half of it
reads worse than none of it.

Nothing in these formulas is invented. A product with no description simply gets a shorter
one, built from brand, name and price. Filling `description` for the catalogue is the owner's
task and the single biggest lever left (`SEO_PLAN.md`, phase 4).

`description` is plain text even though the owner writes it with formatting: the API derives
it from the editor's HTML on save, one line per paragraph, heading or list item
([domain.md](domain.md#a-description-has-two-forms)). So neither the meta tag nor the
JSON-LD ever sees markup. The first-sentence rule splits on sentence punctuation, not on
lines, so a description that _opens_ with a subheading or a list folds its first line into
the sentence after it.

Two claims in the copy are facts about the catalogue, not slogans, and stop being true if the
catalogue changes: that everything in it is Korean, and that the four sections are face care,
hair care, sets and gadgets.

## Structured data (JSON-LD)

Nodes are built in `apps/website/src/utils/jsonLd.ts` and rendered by
`apps/website/src/components/JsonLd.tsx`, one `<script type="application/ld+json">` per node,
in the body rather than through `next/head` — a crawler reads the block anywhere in the
document, and `next/head` would only add its key-based deduplication to the picture. CSP does
not apply: `ld+json` is a data block, the browser never executes it.

What each page carries:

| Page                | Nodes                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| every page (`_app`) | `OnlineStore`: `logo`/`image`, and `sameAs` to the Instagram and the bot  |
| `/`                 | `FAQPage`, built from the same `FAQ_ITEMS` array that renders the section |
| `/catalog`          | `ItemList` of the products currently on screen                            |
| `/catalog/[slug]`   | `Product` + `Offer` (or `AggregateOffer`), `BreadcrumbList`               |

The rule the whole file is written around: **markup states only what the same page shows a
visitor.** So there is no `aggregateRating` or `review` (the shop has no real reviews), no
delivery terms inside `Offer` (the site does not state any yet — that is phase 5), and no
`BreadcrumbList` on the catalogue, which draws no breadcrumb trail. The product page builds
one array and feeds it to both the visible `Breadcrumbs` and the markup, because two copies
drift apart at the first edit; the FAQ nodes take the page's own array for the same reason,
reproducing the `{link}` substitution `FaqAccordion` performs so the answer text matches what
is rendered word for word.

Details that are decisions, not accidents:

- **Out of stock is `PreOrder`, not `OutOfStock`.** For this shop a product is not sold out,
  it is outside the current buying round, and the page says so and invites the visitor to the
  next one.
- **The price is in som, not cents.** The database and API keep integer `*_cents`; `Offer`
  wants the unit amount, and `priceUnits` converts, dropping `.00`.
- **A product sold in several volumes gets `AggregateOffer`**, with `lowPrice`/`highPrice`
  and `offerCount`, instead of one `Offer`. There are as many prices as volumes, and quoting
  the cheapest as _the_ price would state something the page itself does not: the visible
  price is "от N ₽" and changes with the volume selector. The `<title>` and the meta
  description say "от" for the same reason, and carry the volumes ("30 / 50 мл") in place of
  the single one such a product no longer has.
- **The store node has an `@id`** (`<siteUrl>/#store`), and each `Offer` refers to it instead
  of repeating the organisation — one seller entity across the whole site.
- **The `Product` description** is the owner's text when it exists, otherwise the same string
  `<meta name="description">` gets: brand, name, price. Nothing is invented either way.
- **`logo` is not the favicon.** The `OnlineStore` node points at `/logo.png` (180×180, over
  Google's 112px floor), which feeds the organisation's card — not the small icon beside a
  result. That one Google fetches from `favicon.ico` when it crawls the home page, and no
  markup can hand it over; a stale index simply keeps the grey globe until the next crawl.
- **The primary photo is sorted first** in `image[]`, so the crawler's preferred image is the
  one the catalogue and `og:image` already show.

Verify with Google's Rich Results Test after any change here; the nodes are readable straight
out of `curl <url> | grep ld+json`.

## URLs that survive a buying round

The catalogue is rewritten before every buying round (сбор), and a product URL that
disappears takes every signal it collected with it. Three states, three answers:

| State                                                  | API                     | The page                                                                             |
| ------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| in the catalogue, not in this round (`inStock: false`) | 200                     | 200, "нет в сборе" plus the wishlist; `PreOrder` in the markup; stays in the sitemap |
| withdrawn by the owner (soft-deleted)                  | 410 `product_gone`      | 307 to `/catalog`; out of the sitemap                                                |
| never existed                                          | 404 `product_not_found` | 404                                                                                  |

The redirect is **temporary, not the 301 `SEO_PLAN.md` asks for**, and that is deliberate.
Withdrawal is reversible by design here: the xlsx import revives a product it meets again
(`apps/api/app/catalog/import_service.py`), and the admin has a restore button. A permanent
redirect is cached by browsers for as long as they feel like, so a product returning in the
next round would open as the catalogue for everyone who saw it withdrawn. The destination is
`/catalog` rather than the product's brand or category because those pages do not exist yet;
when they do (phase 3), the category page becomes the target.

The 410 carries no body, so the site cannot pick a cleverer destination today — and should
not: the price and stock of a withdrawn product are nobody's business.

What `SEO_PLAN.md` asks for here and the shop cannot honestly do yet:

- **The date of the next round.** The API only knows the _active_ cycle; there is no upcoming
  one to name, and inventing a date is worse than omitting it.
- **A "notify me when it is back" button.** There is no per-product subscription in the
  backend. What does exist is the announcement every linked customer gets when a round opens
  (`notify_cycle_opened`), and the wishlist sitting next to the button — which is what the
  page now says, in those words.

## Not done yet

Tracked in `SEO_PLAN.md`: category and brand routes (and the `BreadcrumbList`/`ItemList` that
come with them), per-product content, the trust pages (`/about`, `/delivery`, `/contacts`),
and the two items above that need data the shop does not keep. Google Search Console is the
owner's task and blocks observing any of it.
