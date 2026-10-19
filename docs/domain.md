# Domain model and business rules

The rules the code enforces, and the reasoning behind the ones that look arbitrary. Source of
truth: `apps/api/app/*/models.py` and `*/service.py`.

## Glossary

| Term               | In code            | Meaning                                                                                                                                                                                         |
| ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order cycle / сбор | `OrderCycle`       | A collection window with a deadline. The shop buys once per cycle.                                                                                                                              |
| Request / заявка   | `Order`            | What a customer submits. Called "order" in code, "заявка" in Russian copy — nothing is paid on the site, so it is a request to buy.                                                             |
| Admin              | `Role.ADMIN`       | Someone who runs the shop day to day. There may be several. Called "admin" in the UI too — Russian copy says "владелец" only about the person who owns the shop, never about a level of access. |
| Super admin        | `Role.SUPER_ADMIN` | The shop's own account: the only one that hands out and takes back `ADMIN`, and the only one whose own role nothing can change. Exactly one, created by the seed.                               |
| Customer           | `Role.CUSTOMER`    | Everyone else. Created by the bot when they share a contact.                                                                                                                                    |

## Users and roles

`Role` is `CUSTOMER`, `ADMIN` or `SUPER_ADMIN`. Accounts are keyed by a **phone number
normalized to E.164** (`app/common/phone.py`) and are created in exactly one place:
`telegram/handlers.py`, when someone shares their contact with the bot. There is no
registration endpoint, no password column and no OTP — see [telegram.md](telegram.md#sign-in).

- ADMIN and SUPER_ADMIN see the same admin panel (`require_admin` accepts both, via
  `ADMIN_ROLES` in `app/auth/models.py`). They differ over exactly one thing: who may
  change roles. Both checks read the role from the `users` row, not the token, so a
  demotion takes effect on the next request; it also revokes the demoted account's
  refresh tokens (`UsersService.set_role`).
- `PATCH /admin/users/{id}/role` is **SUPER_ADMIN-only** (`require_super_admin`, otherwise
  `super_admin_only`). It grants and revokes `ADMIN`, and nothing else: `SUPER_ADMIN`
  cannot be handed out (`super_admin_not_assignable`) and the row that holds it cannot be
  changed by anybody, its own owner included (`super_admin_immutable`).
- That immutability is what keeps the shop out of a locked panel: there is always one
  account with a way in, so no sequence of role changes can end with zero admins. It
  replaced the older "you cannot change your own role" rule, which only held while every
  admin could hand the role out.
- The head owner is bootstrapped by `uv run python -m app.scripts.seed` from `OWNER_PHONE` /
  `OWNER_NAME` — the only way the role is ever assigned, and the way back in if the panel
  is ever lost. The script normalizes the phone the same way the bot does — an unnormalized
  `OWNER_PHONE` used to produce a second, CUSTOMER account with no way into the admin panel.
- Anything addressed to "the owner" goes to **every** admin of either role
  (`telegram/recipients.get_owners`).

### Erasing an account

A customer may erase their own account from `/account` (`DELETE /users/me`,
`UsersService.delete_account`). It is the only way to withdraw the consent given in the
bot, so it is deliberately not something the owner has to be asked for.

It is **not** `DELETE FROM users`. Every order points at that row with `ON DELETE
CASCADE`, so removing it would take the shop's record of goods it bought and handed over
with it — including cycles that closed months ago. What goes is the data about the
person; what stays is a nameless row and the order history hanging off it:

- `phone` is overwritten with a per-row placeholder (the column is UNIQUE and NOT NULL, so
  erasing it means filling it), `name` becomes "Удалённый аккаунт", `telegram_chat_id` is
  cleared and `deleted_at` is stamped.
- Cart, wishlist, refresh tokens and any waiting login session are deleted outright, and
  so are the account's wanted-product wishes: those carry their own copy of the name and
  the number, which is the one thing this erasure is about.
- **`CONFIRMED` and `READY` orders refuse the erasure** (`409
account_has_unfinished_orders`, `DELETION_BLOCKING_STATUSES`). The goods behind them
  were already bought and are still the customer's to collect; erasing would cancel a
  purchase that was already made and leave the owner without a name or a number to ask
  about it. The person collects the goods, or asks the owner to move the order — their own
  cancellation stops at `PENDING` (`customer_flags`), whatever the cycle is doing, so
  "cancel it yourself" is advice they cannot act on — and then deletes. The account page
  asks `GET /users/me/deletion` before it draws the button, so this arrives as a disabled
  button naming the orders, not as an error after the confirmation.
- **`PENDING` orders** are withdrawn as `CANCELLED_BY_CUSTOMER` — nothing is bought
  against them yet — and the owner is told in one message naming them
  (`messages.account_deleted_for_owner`). Finished and already-cancelled orders are left
  exactly as they are.
- To every reader the row is gone: `UsersService.get` raises `UserNotFoundError` for it,
  it drops out of `/admin/users`, and it is absent from `OrdersService.load_customers` and
  `recipients.get_users`, so the admin order list shows its orders with `—` and the bot
  addresses nobody. The released phone number can start a brand-new account.
- **No account with admin rights can be erased** — neither role (`account_not_deletable`).
  Erasure is a customer's right over their own data; an admin row is a way into the shop's
  panel, granted by the owner, and handing it back is `set_role` to `CUSTOMER` first —
  after which it erases like anybody else's. SUPER_ADMIN is that rule at its strongest, for
  the same reason its role cannot be changed at all. The site hides the button from both.
  This is also what lets `recipients.get_owners` select on role alone: an erased admin —
  nameless, with no chat to send to, yet still in the owner fan-out — is a state the table
  cannot reach.

The page says so afterwards rather than navigating away: on a `204` it replaces the
profile form with a farewell naming what was erased, and the person leaves for the
catalogue themselves. A silent redirect is indistinguishable from a failure — which is
what it was taken for. A refusal is shown at the delete button, not at the name field,
for the same reason: that is where the person is looking.

The session ends with the account: refresh tokens and waiting login sessions are deleted
rows, and the site posts `/api/auth/logout` straight after the `DELETE`, which clears the
`lb_at`/`lb_rt` cookies whatever the backend answers. What cannot be taken back is an
access token already copied out of a cookie: those are verified without a DB lookup by
design, so one keeps opening the customer endpoints until it expires (up to
`JWT_ACCESS_TTL_SECONDS`, 15 minutes), exactly as it does after `revoke_all_for_user`. The
exceptions are the paths that create something on the account's behalf — checkout and
`POST /cart/items` go through `require_live_user`, which reads `deleted_at` — and the admin
surface, whose role check reads the database too (see the roles above).

## The order cycle

A cycle has a `deadline_at`, an optional `label`, and a status: `UPCOMING` → `ACTIVE` →
`CLOSED`.

**There is at most one open cycle.** Creating a second one, or moving a closed cycle's
deadline back into the future while another is open, fails with `active_cycle_exists`. A
second open cycle would silently become "the" cycle by nearest deadline while customers'
carts stayed attached to the first one.

`get_active_cycle()` requires _both_ `deadline_at > now` **and** `status != CLOSED` — the owner
can close a cycle early, and a cycle whose carts have already been emptied must not keep
accepting new ones just because its date hasn't arrived.

### Opening a cycle is announced once

Creating a cycle broadcasts "Открыт новый сбор" to every linked customer. The broadcast runs
outside the request and stamps `announced_at` when it is through; the `cycle_notice_sweep` job
re-runs it for any still-collecting cycle the stamp is missing from, so an announcement cut
short by a restart reaches the rest of the shop instead of being lost. Same trade as the
reminders: a repeat to the people already reached beats a cycle nobody heard about. Details in
[telegram.md](telegram.md#notifications).

Reopening a finished cycle clears the stamp along with `closed_at` and the reminder stamps
(see [What closing does](#what-closing-does)), so the reopening is announced like an opening —
that is the message the shop needs, and the one it gets: "дедлайн перенесён" would go only to
the few people already inside a cycle nobody else knows is collecting again.

### What closing does

`close_now` (owner presses close) and the `deadline_sweep` job do exactly the same thing, and
deliberately so — half of it would leave carts nobody can rescue:

1. Every cart in the cycle is **rescued into its owner's wishlist**, capped at
   `MAX_WISHLIST_ITEMS`; the overflow is dropped and the notification says so honestly.
2. The cycle's orders are tallied (count + total) for the owner's shopping summary.
3. The cycle is marked `CLOSED` with `closed_at`. `deadline_at` is left alone — it records
   what customers were promised; `closed_at` records what actually happened.
4. The next `UPCOMING` cycle is promoted. This resync runs on **every** sweep, not only when
   something closed, or a cycle created while nothing expired would show `UPCOMING` forever.
5. Only **after the commit** does anything go out: the owner's summary, the cart-rescue
   notices, and a "cycle ended" notice to customers whose orders are in it. A summary of a
   close that then rolled back would send the owner shopping against a live cycle.
   On the owner's early close (`POST /admin/cycles/{id}/close`) only the summary goes out in
   the request; the two customer broadcasts run as a background task
   (`notify_cycle_closed_in_background`), or the button spun for half a minute on a phone.

### Deleting a cycle

`DELETE /admin/cycles/{id}?expectedOrders=N` removes a cycle only once nothing in it is
anyone's open business (`CyclesService.delete`, which locks the cycle and its orders):

- It is **`CLOSED`** — `409 cycle_not_closed` otherwise. An open cycle is still taking
  orders; a mistaken one is edited, not deleted.
- It closed at least **ten days** ago (`DELETABLE_AFTER`, from `closed_at`) —
  `409 cycle_closed_recently`. The days after the deadline are when its orders are
  confirmed, billed, paid for and handed over, and the bound is `UNFULFILLED_AFTER` on
  purpose: until then a customer may still restore their own cancellation, and a shorter
  rule (it used to be a week) deleted orders the site was still offering to bring back.
- None of its orders is **open** (`OPEN_STATUSES`), **paid** (`paid_at`, whatever the
  status) or carrying a **payment receipt** of any verdict — `409 cycle_has_orders`.
  `paid_at` alone is not proof of no money: taking an order back to `PENDING` clears it,
  so a paid order cancelled, restored and cancelled again looks unpaid, and only its
  receipt remembers the transfer. A test cycle goes once its orders are cancelled.

What is left — cancelled and completed orders nobody sent money for — goes with the
cycle, items included (all `ON DELETE CASCADE`), and nobody is notified. Only
if there are exactly `N` of them: the admin page reads `GET /admin/cycles/{id}/deletion`
(`orders`, `blockingOrders`) to build its confirmation and sends the same count back, so a
change in between is `409 cycle_orders_changed` instead of a delete nobody agreed to. Its
carts were already emptied into wishlists when it closed, so no rescue runs here.
`CyclesService.update` takes the same row lock, so reopening a cycle while it is being
deleted ends in `404 cycle_not_found` rather than a failed write.

### Deadline reminders

Two stages (`app/cycles/reminders.py`), most urgent first: **3h** (`final_reminder_sent_at`,
"last chance") and **24h** (`reminder_sent_at`). Only the most urgent due stage is sent; wider
ones it overtook are stamped along with it, so a cycle opened three hours before its deadline
doesn't fire "tomorrow" immediately contradicted by "last chance". Moving a deadline reopens
the stages it left behind.

Planning is read-only, sending happens outside the write transaction, stamping follows the
send: for a deadline nudge a duplicate is a nuisance and a miss is a lost order.

## Catalog

`Category` → `Product` → `ProductImage`, and `Product` → `ProductVariant`. A product carries
`name`, `slug` (unique), `brand`, `description`, a category and a gallery of images; a
**variant** carries `volume_ml`, `shade`, `price_cents` and `in_stock`.

### Categories nest one level deep

A category can sit inside another one (`categories.parent_id`): "Умывашки" is a
subcategory of the section "Уход за лицом". A product still has exactly one category,
usually the subcategory, and reaches the section through it.

- **One level only.** A section cannot itself have a parent, and a category that has
  subcategories cannot become one (`CategoryService._check_parent`,
  `category_nesting_too_deep`). A catalogue of cosmetics needs no more, and a list indented
  twice stops being readable. The check locks both rows (`SELECT … FOR UPDATE`), so two
  tabs moving categories at once cannot each pass it and build a second level together;
  should one exist anyway, `categoryTree` lists the stray category at the top level rather
  than hiding it.
- **A section filter takes in its subcategories.** `category=face` returns the products in
  "Уход за лицом" itself and in every subcategory of it; `category=cleansers` narrows to the
  one. The same holds for the admin listing, and for the search: a query naming a section
  finds the products of its subcategories too. The header suggestions offer only
  categories whose own name matched, but count a section as non-empty when its products sit
  in a subcategory.
- **Deleting a section promotes its subcategories** to the top level (`ON DELETE SET
NULL`), the same way deleting any category leaves its products without one.
- **Every list shows the tree** — section, then its subcategories indented beneath it:
  the catalogue filter (storefront and admin alike, `CategoryFilter`), the category select
  on the product form, and the admin categories panel (`categoryTree` in
  `packages/widgets/src/utils/categories.ts`). The home page tiles show sections only.
- **The import and export stay flat.** The `category` column names one category by slug,
  as before; a category the file invents is created at the top level, and the owner moves
  it into a section on the categories page.
- The product's JSON-LD writes the category as a path, "Уход за лицом > Умывашки"; the
  card and the order tags show the subcategory alone.

### A description has two forms

The owner writes the description in a rich-text editor in the admin panel (Tiptap), with a
deliberately short vocabulary: paragraphs, bold, italic, bulleted and numbered lists, one
subheading level (`h2`) and links. No colours, fonts or images — the site sets how a
description looks, not the product. The same list of tags is enforced in three places: the
editor's extensions, `app/catalog/rich_text.py` on save, and the storefront's `RichText`
on the way out.

- **`description_html`** is what the product page renders. The API cleans it on every save
  (`nh3`, the tag list above, links limited to `http(s)`/`mailto`/`tel` and marked
  `nofollow`), so whatever the editor sent, only that vocabulary is stored.
- **`description`** stays plain text, one line per paragraph, heading or list item, and is
  **derived** from the HTML in the same write. Everything that is not the product page reads
  it: `<meta name="description">`, the JSON-LD, the import.
- **The import writes `description` alone and clears `description_html`** — otherwise the
  page would keep showing the old formatted text over the one the file just put in.
- A product whose description never went through the editor has `description_html = NULL`,
  and the page shows `description` with its line breaks, as it always did. The editor opens
  such a text as paragraphs, and the first save moves the product onto HTML. No data
  migration was needed.
- **The limit is 2 000 visible characters** (`MAX_DESCRIPTION_LENGTH`) — counted without
  markup and without the breaks between blocks, identically by the editor's counter, the
  form's check and the API. The raw HTML has its own ceiling
  (`MAX_DESCRIPTION_HTML_LENGTH`), which bounds the request rather than the owner.

### A product has a gallery, and a photo can show some of the variants

A product has up to `MAX_PRODUCT_IMAGES = 20` photos. An upload goes to the end of the
gallery (`409 too_many_images` past the ceiling); the **first photo is the primary one** — the
catalogue card, the search dropdown, `og:image` and the first JSON-LD image. `is_primary` is
kept equal to "first in order" for older readers. Deleting the primary photo promotes the next.

A photo may be **tagged with volumes and shades** — any number of each
(`product_images.volumes_ml` / `shades`, arrays, empty meaning "any"). A variant fits a photo
when it has one of its volumes and one of its shades: an untagged photo belongs to every
variant, one tagged "01 Nude" and "05 Rose" to those two shades in every volume — a shot of two
tubes side by side, or of a palette. Tags rather than foreign keys to variants because that is
what a photo depicts — a tube photographed once is the shade, not "05 Rose in 30 ml" — and
because tags survive a variant being renamed. Every tag must name a volume or shade the product
is sold in, and together they must meet in at least one variant (`409 image_variant_unknown`);
a partly empty combination (30 and 50 ml with a shade sold in 30 ml only) is accepted. This is
checked for the photos whose tags a request changes — a photo merely moved in the gallery keeps
whatever it had. Tags are stored deduplicated: volumes ascending, a shade once whatever its
case. When a variant edit leaves a tag naming nothing (its shade or volume withdrawn), that
tag is dropped from the photo instead of left stale, and volumes and shades that survive but no
longer meet lose the volumes and keep the shades. A photo that loses **everything it is of** —
every shade it names, or, with no shade, every volume — is **hidden** instead: emptied lists
would read as "any", and a shot of a withdrawn "05 Rose" would turn up on every other shade's
page (and on the card, were it the primary one). Bringing the shade back does not unhide it;
the owner does that in the gallery.

A photo can also be **hidden** (`product_images.hidden`): shown for no variant, kept in the
gallery. It is a flag of its own rather than empty lists, because empty already means "any" —
and "every volume" has to stay "any" so a volume added later picks the photo up. A hidden photo
keeps no tags, and the storefront never sees it: public product responses leave it out (the
next shown photo becomes the primary one), and `variant_image` / `primary_image` pass it over.
Admin endpoints return it with `hidden: true`.

The admin edits all of this through `AdminProductGallery`, which lays the gallery out the way
the owner thinks about it — by shade, not by photo. Its groups are "Для всех тонов" (untagged),
one per shade (tagged with exactly that shade), "Для нескольких тонов" (two or more shades — a
palette, two tubes side by side) and "Скрытые" (hidden); the last two appear only when
something is in them. A product without shades but in several volumes is grouped by volume
the same way, and a product sold in one variant has a single group. Each group has its own
"Добавить" tile (several files at once, or dropped onto the group), and a photo added there
gets the group's tag — nothing to pick. Everything rarer happens in the photo's dialog, opened
by clicking the thumbnail: "Все тона" / "Только выбранные тона" (checkboxes) / "Скрыть", an
opt-in volume limit for a shaded product, the alt text, "Главное фото" and delete. The arrows
under a thumbnail swap it with its neighbour **within the group**: order between groups never
matters, because photos of different groups differ in specificity and the storefront ranks by
that first. Below the groups, "Как увидит покупатель" runs `imagesForVariant` for a chosen
variant, so the owner sees the exact order the product page will use.

On a saved product every gallery edit is saved at once (`PUT …/images`, alt included); the
groups follow the product's **saved** variants, since the server checks tags against those, and
the form says so when the variants table has unsaved shades. On the create page the photos wait
in the form, grouped by the rows typed so far, and are uploaded with their tags right after the
product is created; a tag whose shade was renamed in the meantime is dropped there rather than
refused by the server.

Which photo shows a variant is one rule in two places: `variant_image` in
`app/catalog/images.py` (cart lines, order snapshots) and `imagesForVariant` in
`packages/widgets/src/utils/variants.ts` (the product page's gallery). Photos tagged with
other volumes or shades only are left out; among those that fit, the most specific goes
first — tagged with shades and volumes, then shades, then volumes, then untagged (how many
shades a photo names does not count) — with the
primary photo and then gallery order breaking ties. A shade outranks a volume because two
shades look different and two volumes of one cream do not.

The order and the tags are saved together, for the whole gallery at once
(`PUT /admin/products/{id}/images`): the order is a property of the list, and a list that is
not exactly the product's current gallery is refused (`409 product_images_mismatch`) — the
form is looking at a gallery another tab has since changed.

### A product is sold in variants: volumes and shades

The same serum is sold as 30 ml and as 50 ml; the same lipstick as "01 Nude" and "05 Rose"; a
foundation in two volumes of every one of its shades. Those share a name, a description, a
brand and an address, and differ in what the customer picks — so they are one product with
several variants rather than several products. A variant is identified by the pair
**(volume, shade)**, and the two axes are independent.

- **Every product has at least one variant.** A product with nothing to measure (pads, a
  sheet mask) has a single variant with `volume_ml = None` and `shade = None`. There is no
  "product without variants" state: the whole catalogue was migrated into this shape, so the
  code has one path rather than two.
- **The price follows the volume.** Every shade of one volume costs the same; that is what
  the owner asked for, and it is what lets the storefront print one price above the shade
  buttons. It is still stored on each variant row — a cart line, an order line and a
  repricing all point at a variant — and `ProductService._require_specs` refuses a list
  whose shades of one volume disagree (`409 variant_shade_prices_differ`).
- **Shades are all or none.** Either every live variant of a product names a shade or none
  does (`409 variant_shade_missing`): a nameless button next to "01 Nude" is in practice a
  missed cell. The import can leave a product half-way (see below), and says so.
- **A shade is free text compared without case** — "05 rose" from a price list is the
  "05 Rose" already in the catalogue. One rule, `shade_key` in `app/catalog/shades.py`,
  mirrored by `shadeKey` in `packages/widgets/src/utils/variants.ts`; the unique index
  compares `lower(shade)` the same way. Inner whitespace is collapsed on the way in, the
  case is kept for display.
- **What the shades are called is the product's choice** (`products.shade_label`): "Тон" for
  a foundation, "Цвет" for a lipstick, "Оттенок", "Аромат" for a perfume. It is a closed
  enum (`ShadeLabel` in `app/catalog/shades.py`: `TONE`, `COLOR`, `SHADE`, `SCENT`, default
  `TONE`), not free text, because the word is declined wherever it lands in a sentence —
  "Выбрать цвет", "Без аромата", "Для всех оттенков" — and the site keeps every case of every
  value in `SHADE_LABEL_FORMS` (`packages/widgets/src/utils/shadeLabel.ts`). The storefront
  selector, the "Выбрать …" button on a card, the admin variants table and the admin gallery
  say it; order lines, the bot and the purchase list print the shade's value alone
  ("Помада, 05 Rose"), so nothing is snapshotted. The API error texts in `apiErrors.ts` keep
  saying "тон" — they are admin-only and not tied to one product. Adding a value is an
  `ALTER TYPE shade_label ADD VALUE` migration, its forms in `SHADE_LABEL_FORMS` and its word
  in `SHADE_LABEL_NAMES`.
- **`products.price_cents`, `products.volume_ml` and `products.in_stock` are derived** from
  the live variants and rewritten by `ProductService.refresh_display_fields` on every write
  that can move them. `price_cents` is the cheapest live variant, `volume_ml` is the volume
  only while the live variants share one volume (NULL after that — no single number
  describes a product sold in two; a lipstick in ten shades of one size keeps its), and `in_stock` is "any of them is". They stay columns on the product
  because every bulk read uses them and none of those reads wants a join: the price sort and
  filter, the search, the stock filter, the xlsx export, the sitemap, the JSON-LD and the card.
- **"от" means the variants cost different amounts**, not that there are several of them: a
  lipstick in ten shades has one price. The card, the search dropdown (`priceVaries`), the
  admin table, the `<title>` and the JSON-LD all ask `hasPriceRange`, never `variants.length`.
- **Variants are soft-deleted too** (`deleted_at`), for the same reason products are: a
  withdrawn variant is still quoted by orders that were already confirmed, and by carts that
  get it back if the owner puts it back. Taking one off and putting it back revives the same
  row, which is why the uniqueness rule is a partial index — one live row per
  `(product_id, volume_ml, lower(shade))`, with `NULLS NOT DISTINCT` so that a product
  cannot collect several nameless variants either.
- **Withdrawing a variant takes it out of every PENDING order** (`OrdersService.drop_variants`,
  run by the admin PATCH), exactly as soft-deleting a product does — an order left with
  nothing becomes `CANCELLED_BY_OWNER`, and the customer is told over Telegram with the
  variant named. Confirmed and later orders keep their lines: those are a record of what was
  agreed. The other variants of the same product are untouched, which is the whole difference
  from `drop_product`.
- **The list of variants is replaced whole** (`PATCH /admin/products/{id}` with `variants`)
  and reconciled **by id first, then by (volume, shade)**, not by position. A variant's id is
  what a cart line and a pending order point at, so a saved price edit lands on the existing
  row — replacing the list wholesale would empty every cart in the shop each time the owner
  corrected a number. The id is what keeps a **renamed shade** the same variant ("Rosee" →
  "Rose"): matched by name alone, a rename is a withdrawal plus a new arrival, and the
  withdrawal would take the shade out of every cart and pending order. The admin form sends
  the id of every row it loaded. **The id holds only while the volume does**: a row moved from
  30 ml to 50 ml is a new variant and the old one is withdrawn (with its notice), because the
  two are different things at different prices, not a typo — matching it by id would quietly
  swap what every cart and pending order holds.
- **A renamed shade reaches the pending orders.** Order lines snapshot the shade, and a
  PENDING one follows a rename the way it follows a price (`OrdersService.rename_variants`,
  called by the admin PATCH and by the import), so the bill, the bot and the purchase list do
  not go on quoting the old spelling. No notice is sent: the tube is the same.
- **Reconciling flushes in two steps.** Postgres checks the unique index row by row, so a swap
  of two shade names — or a rename onto the name of a shade being withdrawn — would collide
  with itself halfway through the UPDATEs. Rows that leave the list or change key step out of
  the index first (they are marked withdrawn and flushed), then come back with their final
  keys. A renamed shade also carries the **photo tags** that named it, as long as the rename is
  unambiguous (`_retag_images`).
- `price_cents` / `volume_ml` / `in_stock` sent on the product itself are shorthand for
  "the only variant" and keep working while there is one. Once a product is sold in several,
  they are refused with `409 product_has_variants`: applying one price to every variant would
  silently undo the split.
- **Products are soft-deleted** (`deleted_at`) so order snapshots stay valid. Admin listings
  can ask for them back with `includeDeleted`; `POST /admin/products/{id}/restore` undoes it.
- **The home page's hero shows the owner's picks** (`is_featured`, the "Показывать на главной"
  switch on the product form). At most `MAX_FEATURED_PRODUCTS = 3` live products carry it: a
  fourth pin is refused with `409 featured_limit_reached` rather than unpinning another one,
  and re-saving a product that is already pinned does not count against the limit. A
  soft-delete clears the flag (a restore does not set it back), so a withdrawn product never
  holds a slot. Fewer than three picks is normal: the page fills the free places with the
  newest in-stock products, which is all the hero showed before the flag existed. A pick is
  shown out of stock too — taking it off the home page is the owner's call. Both product
  listings filter on it with `featured=true`; the admin list offers that as "Только на главной".
- Slugs are generated by a practical (not reversible) Cyrillic transliteration, implemented
  twice on purpose: `app/catalog/import_service.py` for the importer and
  `packages/widgets/src/utils/slug.ts` for the admin forms. **Keep them in sync.**
- Import accepts xlsx and csv. Required headers: `name`, `slug`, `price`. Headers are
  normalized (lowercased, spaces/dashes → underscores) and aliased — `instock` → `in_stock`,
  `volume_ml` / `объем` / `объём` → `volume`. The `slug` cell is lower-cased before it is
  validated and before it is used as the upsert key, so `Krem-1` and `krem-1` are one
  product; anything still outside `SLUG_PATTERN` after that fails the row. Ceilings: `MAX_IMPORT_ROWS = 50 000`,
  `MAX_REPORTED_ERRORS = 200`, text columns 255 chars. A too-big file is refused as a file
  error, not per row: xlsx is deflate, and 4 MB can expand to ~150 MB of parsed rows.
- **A row is a variant, and a file repeats the slug once per variant** — which is how a
  supplier's price list is already written, and how the export writes it back. The
  product-level columns come from the first row of a slug and are reasserted by the rest;
  price, volume, shade and stock land on a variant of their own, matched by (volume, shade)
  so the row (and the carts pointing at it) survives. Variants the file does not mention are
  **left alone**, never withdrawn: a price list is usually partial, and reading silence as
  "take it off the shelf" would empty the shop from a file meant to move a few numbers.
- **The `shade` column** (aliases `тон`, `оттенок`) names the shade. Whatever a row prices,
  every shade of the same volume gets that price; two rows giving one volume two prices are
  a reported row error. **Without the column**, a row prices every shade of its volume at
  once — that is what a price is anyway — but a row that also sets stock for a product in
  several shades is refused, since stock belongs to each shade. A product's single nameless
  variant that receives its first shade keeps its row (and its carts). A file can leave a
  product with some variants shaded and some not — 30 ml rows with shades, the 50 ml row in
  another file — and the summary reports that once per product rather than guessing; the
  admin form refuses to save the mix, which points the owner straight at it. A row that
  would add a variant past `MAX_PRODUCT_VARIANTS` is refused, as the form refuses it.
- **The `shadeLabel` column** sets what the product calls its shades. The cell takes the
  Russian word ("Цвет", any case) or the code (`COLOR`); anything else is a row error naming
  the four words. **An empty cell leaves the label alone** rather than resetting it to "Тон":
  the export leaves it empty on rows without a shade, and the round trip must not undo the
  owner's choice for a product whose shades are yet to come.
- Two rows with the same `(slug, volume, shade)` are a reported row error rather than a silent
  overwrite (only rows that were applied count: a refused row neither claims its variant nor
  sets its volume's price for the rows after it), and so is an **empty `volume` cell for a product that already has volumes** (or
  an empty `shade` cell for a product that already has shades):
  "no volume" is a real variant, so the row would otherwise add a third, nameless one next
  to 30 ml and 50 ml out of what is in practice a missed cell. A product whose only variant
  has no volume is still priced by such a row — the rule is about creating one. A file **without** a `volume` column is an ordinary price list: the row is a
  price for "the product", which still means something while the product is sold in one
  volume, and is refused per row (naming the missing column) for a product sold in several.
- The summary counts **products**, not rows: two rows for one serum are one product created.

## Cart

One cart per user per cycle. **Every cart mutation requires an open cycle** — without one the
endpoint answers `409 no_active_cycle`. That is the whole reason the wishlist exists: it is
cycle-independent and the only place to park items between cycles.

**A cart line is a variant, not a product** (`UNIQUE(cart_id, variant_id)`), and is addressed
by one: `PATCH`/`DELETE /cart/items/{variant_id}`. 30 ml and 50 ml of one serum, or two shades
of one lipstick, are two lines with their own quantities. A line shows the photo of its own
variant when the gallery has one (`variant_image`), not the product's first. Stock is read off the variant, not the product — the
product counts as in stock while _any_ volume is, so filtering on it would leave a sold-out
30 ml sitting in a cart because the 50 ml is still available.

The **wishlist stays product-level**: "I want this serum", and the volume and shade are chosen
when it goes into the cart. So the cart rescue at the close of a cycle collapses two variants of
one product into one wishlist row.

Quantities are capped at `MAX_ITEM_QUANTITY = 999`, enforced on both the cart and the order
edit endpoints — a ceiling on one side only just moves where the overflow lands.

## Orders

Checkout turns a cart into an `Order` with denormalized `OrderItem` lines (name, slug, price,
**volume**, **shade**, image snapshot — the variant's own photo when it has one) and a
`total_cents`. Only the lines that went into the order leave
the cart: a line hidden from it (product discontinued or out of stock) stays and reappears
when the product does.

A customer's cancel/restore/edit and the owner's status change lock the order row
(`get_for_user(for_update=True)`, `update_status`), so the two sides cannot both pass their
checks against the same PENDING and have the later commit win.

The volume and the shade are snapshots on the line, unlike brand and category, which are read
from the live catalogue (`OrdersService.load_item_tags`): they are what the customer _chose_
between, and once a product is sold in two variants the product row no longer knows which one
a line was. Every text that names a line — the bot's messages, the purchase list, the
checklist — names it with `product_label` (`app/catalog/labels.py`): "Тональный крем, 30 мл,
21 Light". For
the same reason a price change is pulled through by **variant** (`reprice_variants`): an
order for 30 ml must not get more expensive because the 50 ml did. The owner's purchase list
splits by volume and shade too — 30 ml and 50 ml, or "01" and "05", are two things to buy.

### Orders placed by an admin

An admin can place an order for any live account from the orders panel (`POST /admin/orders`,
`OrdersService.create_for_customer`) — someone who missed the deadline, or asked in a
message rather than on the site. It is an ordinary `PENDING` order from then on: repriced
and trimmed like any other, cancellable by its customer. What differs is how it is made:

- **Which cycle.** The open one, or any that closed within `ADMIN_ORDER_WINDOW` (3 days,
  from `closed_at`, falling back to the deadline like `PendingStage` does). The form offers
  the choice (`GET /admin/orders/cycles`), open cycle first and default: someone who missed
  yesterday's deadline usually belongs in yesterday's purchase, which is still under way
  even when the next cycle has already opened. Nothing fits — `409 no_cycle_for_order`;
  the picked cycle left the window while the form was open — `409 order_cycle_unavailable`.
  The window is kept inside `PURCHASE_WINDOW` on purpose (a test holds it there): an order
  added later would read «Закупка идёт дольше обычного» on the day it was made.
- **The lines** come from the catalogue, not from the customer's cart, which is left alone.
  Same rule as adding to a placed order: a discontinued or sold-out volume refuses the
  whole order (`404 product_not_found`) rather than being silently dropped from it.
- **`orders.created_by_id`** names the admin (`createdById`/`createdByName` on the admin
  response); NULL for a checkout. With several admins, it is the answer to "where did this
  заявка come from".
- **Placing is idempotent.** The panel makes a `requestId` once per draft, and
  `orders.request_id` is unique: the same key again (a double click, a resend after a lost
  response) returns the order it already made, and nobody is notified twice. The customer's
  row is locked first, so a repeat that arrives mid-request waits and then finds that order.
  Checkout needs no key — the locked cart row plays that part.
- **A second order in the same cycle is warned about, not refused.** With `userId`,
  `GET /admin/orders/cycles` lists that customer's open orders in each cycle, and the form
  shows them; the customer may well have asked for a separate one.
- **Both sides are told** after the commit: every admin gets the usual new-order message
  with «Оформлена в админке: <имя>», and the customer gets the order's lines and sum —
  they pressed nothing, and the bill would otherwise be the first they heard of it. The
  message says what they can do with it: change it while the cycle is open, cancel it
  once it has closed.

### Statuses

```
PENDING ──▶ CONFIRMED ──▶ READY ──▶ COMPLETED
   │            │            │
   └────────────┴────────────┴──▶ CANCELLED_BY_OWNER ──▶ PENDING   (owner's own undo)

PENDING ◀──────────────────────▶ CANCELLED_BY_CUSTOMER   (customer's cancel / restore)
```

`ALLOWED_TRANSITIONS` in `app/orders/models.py` is authoritative for what the _owner_ may
set; `COMPLETED` and `CANCELLED_BY_CUSTOMER` lead nowhere. Two distinct cancellations exist
because one `CANCELLED` left both sides guessing — the customer couldn't tell "я передумал"
from "владелец не смог достать". The owner cannot assign `CANCELLED_BY_CUSTOMER`
(`order_status_not_assignable`); an invalid target is `order_status_transition_invalid`.

**A cancellation is taken back by whoever made it, and by nobody else.** The owner's own is
`CANCELLED_BY_OWNER → PENDING` from the admin panel (refused on an order `drop_product`
emptied — there is nothing to bring back), and the customer is told it came back. The
customer's own is `POST /orders/{id}/restore`, which never touches `CANCELLED_BY_OWNER`:
letting them undo the owner's "не смогла достать" would put the order back into the tally
and the purchase sheet with nobody told. Both of the customer's own presses are announced
to the owner (`notify_order_cancelled_by_customer`) — they change what gets bought, and
the admin table is not something anyone watches.

`CANCELLED_STATUSES` and `OPEN_STATUSES` (PENDING/CONFIRMED/READY) are the sets to test
membership against — never compare to a single status.

### What the customer may still do

Two different windows, and conflating them was a bug:

- **Editing** — the note, item quantities, adding and removing lines — needs the order to be
  `PENDING` **and** its cycle open. Past that: `order_not_editable` ("сбор закрылся или
  владелец взял её в работу"). Removing the last line is refused (`last_order_item`) — that
  action is a cancellation, and the message says so.
- **Cancelling** needs `PENDING` and outlives the deadline. Nothing is bought against an order
  the owner has not confirmed, so withdrawing one costs the shop a notification; what froze on
  the deadline is the purchase list, which a withdrawal shortens and never rewrites. While
  both hung off one flag, a closed cycle took both, and an unanswered request sat under
  "Ожидает подтверждения" with no action on it at all — beside a live one, with the same
  badge, that could be cancelled.

  It stops at `PendingStage.UNFULFILLED` (below). An order the purchase went by is no longer
  one the customer is holding up, so "я передумал" would be a claim about a decision that is
  not theirs to make any more — and it would file the shop's own silence under the customer
  changing their mind, where neither the owner nor any later count of unfulfilled requests
  would find it. From there the order is the shop's to answer, and the owner is nudged for
  that answer (`stale_order_sweep`, [telegram.md](telegram.md)).

- **Restoring** is theirs only over `CANCELLED_BY_CUSTOMER`, in exactly the window cancelling
  has — a narrower one would move the dead end one press further on rather than remove it, a
  wider one would let an order come back from a purchase that is over. It fails with
  `order_not_restorable` when the order was cancelled by the owner, when nothing is left to
  restore, or past `UNFULFILLED`.

All of it travels to the UI as `isEditable`/`isCancellable`/`isRestorable`
(`OrdersService.customer_flags`) — the site never recomputes them.

### How long a `PENDING` order has been waiting

`PENDING` says one thing — nothing has been bought against this order yet — and it says it for
as long as the owner takes, which is by design: **the shopping happens after the cycle
closes** (the owner's summary is what sends them out), so `PENDING → CONFIRMED` normally
happens in a closed cycle. Nothing expires an order, and no sweep touches one.

What the customer sees is therefore derived, not stored: `PendingStage`
(`app/orders/models.py`) is computed from the cycle behind the order, so it moves on its own.

| Stage         | When                                       | Reads as                                |
| ------------- | ------------------------------------------ | --------------------------------------- |
| `COLLECTING`  | cycle still open                           | «Сбор открыт — состав ещё можно менять» |
| `PURCHASING`  | < `PURCHASE_WINDOW` (5 days) since closing | «Сбор закрыт, владелец закупает»        |
| `DELAYED`     | past that, < `UNFULFILLED_AFTER` (10 days) | «Закупка идёт дольше обычного»          |
| `UNFULFILLED` | past `UNFULFILLED_AFTER`                   | «Заявка не вошла в закупку»             |

The clock starts at `closed_at` (falling back to `deadline_at` before the sweep stamps it),
never at the deadline alone — a cycle the owner shut early starts buying there.

**The stage is mostly copy.** Only `is_cancellable` and `is_restorable` consult it, and only
at its far end — everything else the customer may do still hangs off the status. An order in
`UNFULFILLED` is still an ordinary `PENDING` row that the owner can confirm — the shop admits
the request was not taken into a purchase, it does not cancel it. Cancelling it automatically is a separate
decision, deliberately not made here: nothing expires an order, and a request three weeks old
may still be one a slow owner is about to confirm. What the shop does instead is ask — once
per cycle, the owner is told in Telegram that a closed cycle still holds unanswered orders
(`stale_order_sweep`, [telegram.md](telegram.md)), and ends them, or confirms them, one at a
time from the panel.

### Price snapshots

`OrderItem` denormalizes name, price and volume at checkout, but the snapshot only becomes
**immutable once the owner confirms**. `OrdersService.reprice_variant(s)` pulls a catalog price
change through every still-`PENDING` order, recomputes `total_cents` and notifies each
affected customer. Keyed by **variant**: a price belongs to a volume, and an order for 30 ml
must not move because the 50 ml did. Soft-deleting a product runs `drop_product`, which removes the line from
every PENDING order and cancels (as `CANCELLED_BY_OWNER`) any order left with nothing.

**Therefore user-facing copy must say "snapshot as of confirmation", never "as of checkout".**

### Payment

Nothing is paid on the site. Confirming an order (`PENDING → CONFIRMED`) is what asks for
the money: the customer's notification is the bill — every line, the total, the requisites
(`messages.PAYMENT_DETAILS`) and a «📎 Отправить чек» button. The total is safe to quote
there because confirmation is where repricing stops (above).

The customer sends a photo or a PDF back to the bot; it becomes a `PaymentReceipt`
(`app/payments/`) on one of their **payable** orders — `PAYABLE_STATUSES` (CONFIRMED, READY)
with `paid_at` still empty — and is handed to every owner with «✅ Оплата получена» /
«❌ Чек не подходит». Accepting stamps `orders.paid_at`; rejecting marks only that receipt,
so the order stays payable and the customer can send another — or the same one again,
which reopens it for review. Either way the customer is told. An order the owner takes
back to PENDING loses its payment (`paid_at` cleared in `update_status`): in PENDING it is
repriced and loses lines like any other, so the old total no longer holds — confirming it
again sends a fresh bill, the receipt accepted before can be sent again for review, and
the owner settles the earlier money with the customer. A receipt sent before the order's last
confirmation (`payment_receipts.submitted_at` < `orders.confirmed_at`) belongs to the old bill:
its buttons in the owners' chats refuse it, the admin table does not count it as waiting, and
the same file sent again goes back for review (`PaymentsService.for_current_bill`). A
receipt can no longer be rejected once the order is paid
(`PaymentAlreadyAcceptedError`), and a payment cannot be confirmed on an order that has
left the payable statuses unpaid — a cancelled one, say. `review` re-reads the receipt under
the order's lock, so two owners rejecting the same file tell the customer once.

**Payment is not a status.** It runs alongside CONFIRMED → READY → COMPLETED, not between
them: `paid_at` is a stamp, and `ALLOWED_TRANSITIONS` knows nothing about it. The admin
table shows it as a badge (`paidAt`, and `hasReceipt` for a receipt on the current bill of
a payable order still waiting for the owner's verdict, on `AdminOrderResponse`). `orders.confirmed_at` records the last
PENDING → CONFIRMED, i.e. when the bill went out. The file itself
is never downloaded — only Telegram's `file_id` is stored, enough for the bot to send it on.

### Export

Two sheets, and they are opposites. Cell values starting with `=` are forced to text in
both — a product name from an import must not become a formula.

`GET /admin/export/orders` builds an xlsx purchase list: one row per **variant** summed across
every order in the cycle, **Russian headers**, optional price columns. Per variant, not per
product, because that is what the owner buys — 30 ml and 50 ml of one serum, or two shades of
one lipstick, are two things, and one summed line would be a number nobody can act on. The
variant rides in the name cell ("Сыворотка Centella, 50 мл", "Помада Velvet, 05 Rose"): the sheet is read one line at a time, and a far-right column
is one the eye has to travel to on every row. It is read by a person (or handed to a
supplier) and never uploaded back.

`GET /admin/checklist` is the same purchase list on screen, for the owner walking round a
shop with a phone: the rows of the sheet with prices, from the open cycle or — when none is
open — the last closed one (`CyclesService.get_latest_closed_cycle`), picked by the API
rather than the page. Cancelled orders are left out, since the checklist has no status
filter of its own. Each name links to the product page by the live catalogue slug
(none once the product row is gone). The "bought" ticks are not stored on the server: they live in the
browser's `localStorage` (`useChecklistMarks`), keyed by cycle, and a row is identified by
name + volume + price (+ shade, appended only when there is one, so marks made before shades
existed still match) — not quantity, so a cancellation after the purchase does not untick
what was already bought.

`GET /admin/export/products` dumps the live catalogue, and exists for the round trip:
export → edit prices and stock in Excel → upload the same file back through
`POST /admin/catalog/import`. So its headers are the **import's own column names**
(`name`, `slug`, `brand`, `category`, `price`, `volume`, `shade`, `shadeLabel`, `inStock`), not Russian
captions — a caption would break the file on the way back in. A product sold in several
variants is **several rows with the same slug**, one per variant, which is exactly what the
import reads. `shadeLabel` is written as the Russian word, and only on rows that have a shade.
`inStock` is written `да`/`нет`, which
the import reads as a boolean, and `category` carries the slug, which is the category's
identity.

Two columns are deliberately absent, and their absence is the safety property: the import
treats a column it does not see as **"leave this field alone"**, so re-uploading the sheet
keeps every `description` and every photo the catalogue already has. Both are edited on the
product page instead. Soft-deleted products are left out too — the import matches on slug
and knows nothing about `deleted_at`, so a deleted row coming back would resurrect the
product.

Inside Telegram (the Mini App, the in-app browser, or Telegram Web's frame) the site can't
save a fetched blob — `<a download>` on a blob URL is silently ignored. There the site asks
`POST /admin/export/links` for a signed link instead, and Telegram downloads
`GET /export/download/{token}` itself (`WebApp.downloadFile`, or the external browser via
`openLink` in clients older than Bot API 8.0). The token names the export and its filters,
lives two minutes, is typed `download` so it can never pass as an access token, and the
download re-reads the account's role (`load_admin`), so a demotion kills an unused link.
Client side: `apps/website/src/utils/exportDownload.ts`.

## Money

Integer `*_cents` everywhere, never floats. `MAX_PRICE_CENTS = 2 000 000 000` because
`products.price_cents` is a 32-bit `INTEGER`; `orders.total_cents` was widened to `BIGINT`.
Currency is a setting (`CURRENCY`, default `KGS`) and appears in export headers.

## Wishlist

Saved products, **cycle-independent** — the only place to keep items while no cycle is open,
and where closed cycles' carts land. Capped at `MAX_WISHLIST_ITEMS = 200` (`wishlist_full`):
it is returned whole on every call, including after each add, so an unbounded one turns a
heart press into an ever-growing response.

## Wanted products

A wish for something the catalog does not have, typed where the search came back empty:
under the header suggestions when nothing matched at all, and under the catalog grid when
it found fewer than three products (`WANTED_PROMPT_MAX_RESULTS`). `POST /wanted-products`
stores a row and the owner is told over Telegram
(`messages.wanted_product_for_owner`); there is no admin screen, because what this turns
into is a line on the next cycle's shopping list.

**An account is required.** The form still sits under a search that works without one, but
a guest sees a «Войти через Telegram» button in its place, which leads to `/login` and back.
The form asks for the text only: the server copies the name and the number off the account,
because the owner answers a wish by that number and a number typed into a public form is
whatever the writer chose. `POST /wanted-products` goes through `require_live_user`, so an
erased account's leftover token gets `not_authenticated` too. **The cycle is irrelevant on
purpose**: the wish is worth most between cycles, when
adding a product is still possible.

The row keeps its own copy of the name and the phone rather than reading them back through
`user_id`, so **erasing an account deletes its wishes outright** (see "Erasing an account") —
that copy is precisely the personal data the erasure is about. Rows left from before wishes
required an account have `user_id` null and stay.

## Shared limits

All in `app/common/limits.py`, shared rather than duplicated per schema:

| Limit                       | Value         | Why                                          |
| --------------------------- | ------------- | -------------------------------------------- |
| `MAX_ITEM_QUANTITY`         | 999           | Nobody means a thousand of anything here.    |
| `MAX_WISHLIST_ITEMS`        | 200           | Wishlist is returned whole on every call.    |
| `MAX_PRICE_CENTS`           | 2 000 000 000 | 32-bit `INTEGER` column.                     |
| `MAX_VOLUME_ML`             | 10 000        | No five-litre cosmetics; same 32-bit column. |
| `MAX_WANTED_MESSAGE_LENGTH` | 1 000         | A wish stays one readable Telegram message.  |
