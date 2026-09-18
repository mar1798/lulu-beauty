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

`Category` → `Product` → `ProductImage`. Products carry `name`, `slug` (unique), `brand`,
`price_cents`, `volume_ml`, `in_stock`, a category and images.

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

## Cart

One cart per user per cycle. **Every cart mutation requires an open cycle** — without one the
endpoint answers `409 no_active_cycle`. That is the whole reason the wishlist exists: it is
cycle-independent and the only place to park items between cycles.

Quantities are capped at `MAX_ITEM_QUANTITY = 999`, enforced on both the cart and the order
edit endpoints — a ceiling on one side only just moves where the overflow lands.

## Orders

Checkout turns a cart into an `Order` with denormalized `OrderItem` lines (name, slug, price,
image snapshot) and a `total_cents`.

### Statuses

```
PENDING ──▶ CONFIRMED ──▶ READY ──▶ COMPLETED
   │            │            │
   └────────────┴────────────┴──▶ CANCELLED_BY_OWNER ──▶ PENDING   (owner's own undo)

PENDING ◀──────────────────────▶ CANCELLED_BY_CUSTOMER   (customer's cancel / restore)
```

`ALLOWED_TRANSITIONS` in `app/orders/models.py` is authoritative for what the *owner* may
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

While the order is `PENDING` **and** its cycle is open, the customer can edit the note, change
or remove item quantities, add items, and cancel. Past that: `order_not_editable`
("сбор закрылся или владелец взял её в работу"). Removing the last line is refused
(`last_order_item`) — that action is a cancellation, and the message says so. Restoring is
theirs only over `CANCELLED_BY_CUSTOMER`, and fails with `order_not_restorable` when the order
was cancelled by the owner, the cycle closed, or nothing is left to restore. Both answers
travel to the UI as `isEditable`/`isRestorable` (`OrdersService.customer_flags`) — the site
never recomputes them.

### Price snapshots

`OrderItem` denormalizes name and price at checkout, but the snapshot only becomes
**immutable once the owner confirms**. `OrderService.reprice_product(s)` pulls a catalog price
change through every still-`PENDING` order, recomputes `total_cents` and notifies each
affected customer. Soft-deleting a product runs `drop_product`, which removes the line from
every PENDING order and cancels (as `CANCELLED_BY_OWNER`) any order left with nothing.

**Therefore user-facing copy must say "snapshot as of confirmation", never "as of checkout".**

### Export

Two sheets, and they are opposites. Cell values starting with `=` are forced to text in
both — a product name from an import must not become a formula.

`GET /admin/export/orders` builds an xlsx purchase list: one row per product summed across
every order in the cycle, **Russian headers**, optional price columns. It is read by a
person (or handed to a supplier) and never uploaded back.

`GET /admin/export/products` dumps the live catalogue, and exists for the round trip:
export → edit prices and stock in Excel → upload the same file back through
`POST /admin/catalog/import`. So its headers are the **import's own column names**
(`name`, `slug`, `brand`, `category`, `price`, `volume`, `inStock`), not Russian captions —
a caption would break the file on the way back in. `inStock` is written `да`/`нет`, which
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
