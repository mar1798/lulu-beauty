# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Repeat local customers who order from Lulu Beauty regularly, not first-time/discovery shoppers. They are comfortable with the offline-fulfillment model (no online payment — the owner fulfills requests offline). Customers authenticate through Telegram only: there is no password and no code to type — the bot confirms a waiting tab, and sharing a contact with the bot is what creates the account.

## Product Purpose

An online catalog/ordering platform for a small beauty business. Customers browse a product catalog, add items to a cart, and submit a request ("заявка" — not a paid order) before an owner-defined deadline. The owner fulfills requests offline and exports them to Excel for fulfillment. Success means a customer can reliably assemble and submit an accurate request before their cycle's deadline with minimal friction.

## Positioning

The deadline/batch ordering model is the product's defining mechanism, not product curation. The owner runs a calendar of deadline dates; each date is an order cycle. Carts are scoped to the currently active cycle — when its deadline passes an uncommitted cart is emptied into the customer's wishlist rather than lost, and customers get Telegram reminders roughly 24 hours and 3 hours before if they still have items pending. This submit-by-date → owner-batch-fulfills rhythm is what a generic always-on storefront couldn't replicate.

## Operating Context

Customer flow: browse catalog → add items to cart (scoped to the current active order cycle) → submit request before the cycle deadline. There is no online payment or checkout.

Owner flow (admin): manage the product catalog (manual CRUD, plus bulk import from Excel/CSV), manage the deadline calendar (create/edit/delete cycles), and view/export submitted requests to Excel per cycle.

## Capabilities and Constraints

- No online payment/checkout anywhere in the product — "orders" are unpaid requests.
- Auth is Telegram-only: no password, no OTP code. The customer links their account once by sharing their contact with the bot, and every sign-in afterwards is confirmed in that chat (or by a Telegram Login Widget / Mini App signature).
- One cart per user per active order cycle.
- Currency and cycle timezone default to KGS / Asia/Bishkek at the API layer (`CURRENCY`, `CYCLE_TIMEZONE`) — an operational default, not a binding constraint on UI copy/formatting.
- A wishlist exists alongside the cart and is cycle-independent: it is the only place to park items while no cycle is open.

## Product Principles

- Design for the returning customer, not first-time conversion — familiarity and low-friction repeat use outrank persuasion.
- Make the active cycle's deadline a first-class, always-visible fact — the batch/deadline mechanic is the product's core differentiator and must never be ambiguous.
- Never imply a payment or checkout is happening — the request/no-payment model must stay explicit so it isn't mistaken for a real purchase.
- Keep the owner's offline fulfillment workflow (Excel export, catalog import) unblocked — customer-facing changes shouldn't complicate what the owner needs to extract and act on.
