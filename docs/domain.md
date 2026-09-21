# Domain model and business rules

The rules the code enforces, and the reasoning behind the ones that look arbitrary. Source of
truth: `apps/api/app/*/models.py` and `*/service.py`.

## Glossary

| Term               | In code            | Meaning                                                                                                                                                                                         |
| ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order cycle / сбор | `OrderCycle`       | A collection window with a deadline. The shop buys once per cycle.                                                                                                                              |
| Request / заявка   | `Order`            | What a customer submits. Called "order" in code, "заявка" in Russian copy — there is no payment, so it is a request to buy.                                                                     |
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
  change roles.
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
- Cart, wishlist, refresh tokens and any waiting login session are deleted outright.
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
`JWT_ACCESS_TTL_SECONDS`, 15 minutes), exactly as it does after `revoke_all_for_user`.

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
`name`, `slug` (unique), `brand`, `description`, a category and images; a **variant** carries
`volume_ml`, `price_cents` and `in_stock`.

### A product is sold in volumes

The same serum is sold as 30 ml and as 50 ml. Those differ in exactly two things a customer
cares about — millilitres and price — and share everything else, so they are one product with
two variants rather than two products.

- **Every product has at least one variant.** A product with nothing to measure (pads, a
  sheet mask) has a single variant with `volume_ml = None`. There is no "product without
  variants" state: the whole catalogue was migrated into this shape, so the code has one
  path rather than two.
- **`products.price_cents`, `products.volume_ml` and `products.in_stock` are derived** from
  the live variants and rewritten by `ProductService.refresh_display_fields` on every write
  that can move them. `price_cents` is the cheapest live variant (the "от N ₽" on a card),
  `volume_ml` is the volume only while there is exactly one (NULL after that — no single
  number describes a product sold in two), and `in_stock` is "any of them is".
  They stay columns on the product because every bulk read uses them and none of those reads
  wants a join: the price sort and filter, the search, the stock filter, the xlsx export,
  the sitemap, the JSON-LD and the card.
- **Variants are soft-deleted too** (`deleted_at`), for the same reason products are: a
  withdrawn volume is still quoted by orders that were already confirmed, and by carts that
  get it back if the owner puts it back. Taking one off and putting it back revives the same
  row, which is why the uniqueness rule is a pair of partial indexes — one row per volume,
  and at most one row without a volume (Postgres NULLs are distinct, so the second index is
  what says so).
- **Withdrawing a volume takes it out of every PENDING order** (`OrdersService.drop_variants`,
  run by the admin PATCH), exactly as soft-deleting a product does — an order left with
  nothing becomes `CANCELLED_BY_OWNER`, and the customer is told over Telegram with the
  volume named. Confirmed and later orders keep their lines: those are a record of what was
  agreed. The other volumes of the same product are untouched, which is the whole difference
  from `drop_product`.
- **The list of volumes is replaced whole** (`PATCH /admin/products/{id}` with `variants`)
  and reconciled **by volume**, not by position. A variant's id is what a cart line and a
  pending order point at, so a saved price edit lands on the existing row — replacing the
  list wholesale would empty every cart in the shop each time the owner corrected a number.
- `price_cents` / `volume_ml` / `in_stock` sent on the product itself are shorthand for
  "the only variant" and keep working while there is one. Once a product is sold in several,
  they are refused with `409 product_has_variants`: applying one price to every volume would
  silently undo the split.
- **Products are soft-deleted** (`deleted_at`) so order snapshots stay valid. Admin listings
  can ask for them back with `includeDeleted`; `POST /admin/products/{id}/restore` undoes it.
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
- **A row is a volume, and a file repeats the slug once per volume** — which is how a
  supplier's price list is already written, and how the export writes it back. The
  product-level columns come from the first row of a slug and are reasserted by the rest;
  price, volume and stock land on a variant of their own, matched by volume so the row (and
  the carts pointing at it) survives. Volumes the file does not mention are **left alone**,
  never withdrawn: a price list is usually partial, and reading silence as "take it off the
  shelf" would empty the shop from a file meant to move a few numbers.
- Two rows with the same `(slug, volume)` are a reported row error rather than a silent
  overwrite, and so is an **empty `volume` cell for a product that already has volumes**:
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
by one: `PATCH`/`DELETE /cart/items/{variant_id}`. 30 ml and 50 ml of one serum are two lines
with their own prices and quantities. Stock is read off the variant, not the product — the
product counts as in stock while _any_ volume is, so filtering on it would leave a sold-out
30 ml sitting in a cart because the 50 ml is still available.

The **wishlist stays product-level**: "I want this serum", and the volume is chosen when it
goes into the cart. So the cart rescue at the close of a cycle collapses two volumes of one
product into one wishlist row.

Quantities are capped at `MAX_ITEM_QUANTITY = 999`, enforced on both the cart and the order
edit endpoints — a ceiling on one side only just moves where the overflow lands.

## Orders

Checkout turns a cart into an `Order` with denormalized `OrderItem` lines (name, slug, price,
**volume**, image snapshot) and a `total_cents`.

The volume is a snapshot on the line, unlike brand and category, which are read from the live
catalogue (`OrdersService.load_item_tags`): it is what the customer _chose_ between, and once
a product is sold in two volumes the product row no longer knows which one a line was. For
the same reason a price change is pulled through by **variant** (`reprice_variants`): an
order for 30 ml must not get more expensive because the 50 ml did. The owner's purchase list
splits by volume too — 30 ml and 50 ml are two things to buy.

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

### Export

Two sheets, and they are opposites. Cell values starting with `=` are forced to text in
both — a product name from an import must not become a formula.

`GET /admin/export/orders` builds an xlsx purchase list: one row per **volume** summed across
every order in the cycle, **Russian headers**, optional price columns. Per volume, not per
product, because that is what the owner buys — 30 ml and 50 ml of one serum are two things,
and one summed line would be a number nobody can act on. The volume rides in the name cell
("Сыворотка Centella, 50 мл"): the sheet is read one line at a time, and a far-right column
is one the eye has to travel to on every row. It is read by a person (or handed to a
supplier) and never uploaded back.

`GET /admin/export/products` dumps the live catalogue, and exists for the round trip:
export → edit prices and stock in Excel → upload the same file back through
`POST /admin/catalog/import`. So its headers are the **import's own column names**
(`name`, `slug`, `brand`, `category`, `price`, `volume`, `inStock`), not Russian captions —
a caption would break the file on the way back in. A product sold in several volumes is
**several rows with the same slug**, one per volume, which is exactly what the import reads. `inStock` is written `да`/`нет`, which
the import reads as a boolean, and `category` carries the slug, which is the category's
identity.

Two columns are deliberately absent, and their absence is the safety property: the import
treats a column it does not see as **"leave this field alone"**, so re-uploading the sheet
keeps every `description` and every photo the catalogue already has. Both are edited on the
product page instead. Soft-deleted products are left out too — the import matches on slug
and knows nothing about `deleted_at`, so a deleted row coming back would resurrect the
product.

## Money

Integer `*_cents` everywhere, never floats. `MAX_PRICE_CENTS = 2 000 000 000` because
`products.price_cents` is a 32-bit `INTEGER`; `orders.total_cents` was widened to `BIGINT`.
Currency is a setting (`CURRENCY`, default `KGS`) and appears in export headers.

## Wishlist

Saved products, **cycle-independent** — the only place to keep items while no cycle is open,
and where closed cycles' carts land. Capped at `MAX_WISHLIST_ITEMS = 200` (`wishlist_full`):
it is returned whole on every call, including after each add, so an unbounded one turns a
heart press into an ever-growing response.

## Shared limits

All in `app/common/limits.py`, shared rather than duplicated per schema:

| Limit                | Value         | Why                                          |
| -------------------- | ------------- | -------------------------------------------- |
| `MAX_ITEM_QUANTITY`  | 999           | Nobody means a thousand of anything here.    |
| `MAX_WISHLIST_ITEMS` | 200           | Wishlist is returned whole on every call.    |
| `MAX_PRICE_CENTS`    | 2 000 000 000 | 32-bit `INTEGER` column.                     |
| `MAX_VOLUME_ML`      | 10 000        | No five-litre cosmetics; same 32-bit column. |
