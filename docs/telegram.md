# Telegram: sign-in and notifications

Telegram is the only identity provider and the only notification channel in this product.
There is **no password, no OTP code to type and no registration form** anywhere.

Backend: `apps/api/app/auth/` and `apps/api/app/telegram/` (aiogram).
Frontend: `apps/website/src/pages/api/auth/*`, `src/hooks/useTelegramLogin.ts`,
`src/hooks/useTelegramMiniApp.ts`, `src/components/TelegramLoginWidget.tsx`.

## Accounts

An account is a phone number in E.164 (`app/common/phone.py`) plus a `telegram_chat_id`.
Accounts are created in exactly one place: `telegram/handlers.py::handle_contact`, when
someone shares a contact with the bot. The name is taken from the Telegram profile and can be
changed later on the site.

The share-contact button sends the sender's own number, but nothing stops someone attaching
any card from their address book, and Telegram delivers both as a plain `contact`. Binding on
the number alone would hand over the account behind it, so the handler checks
`contact.user_id` — filled in by Telegram, not the client. **Do not relax that check.**

Because the account is born at that tap, the tap is also where consent is taken.
`/start` answers an unbound chat with **two** messages: the greeting carrying the
share-contact reply keyboard, then `messages.CONSENT` carrying a «Политика обработки
данных» url button (`keyboards.privacy_link`). Two, because a message has room for one
`reply_markup` and the greeting spends it on the keyboard — and the consent goes second so
it sits directly above the button it is about, still before the tap. It names what will be
stored (number, Telegram profile name, this chat) and why; that list must keep matching
what the `users` table actually holds. The address is never written into the text: it is a
button, so on a host Telegram won't link to it simply drops (`_site_button`) rather than
leaving `http://localhost:3000/privacy` in the first thing a customer reads.

The same promise is made on the site's `/login` page, and both are the consent the shop
relies on. Erasing an account is how it is withdrawn
([domain.md](domain.md#erasing-an-account)); it also unbinds the chat, so the same number
can start over from `/start`.

## Sign-in

### 1. Bot-confirmed session (the default, `/login`)

```
browser                 next (/api/auth/*)            api                 telegram
   │  press "Войти"          │                         │                     │
   ├────────────────────────▶│  POST /auth/telegram/session ────────────────▶ │
   │                         │◀── { botUrl, sessionId, pollSecret } ───────── │
   │  open t.me/…?start=…  ──┼─────────────────────────┼───────────────────▶ │
   │                         │                         │  /start <payload>   │
   │                         │                         │◀─ bot authorizes ── │
   │  poll /api/auth/telegram/poll ──▶ POST /auth/telegram/claim ───────────▶ │
   │◀── lb_at / lb_rt cookies set ────                 │                     │
```

- Session TTL is `AUTH_SESSION_TTL_SECONDS` (default 300s) — long enough to find your phone,
  short enough not to leave a working key in a chat.
- Only digests of the link payload and the poll secret are stored; the plaintext exists for
  one moment, in `StartedAuthSession`.
- The tab polls on `lb_ls`, a **different** secret from the `?start=` payload. The link is
  visible in the Telegram chat; polling on it would let anyone who sees the chat claim the
  sign-in.
- `AuthSessionNotFoundError` covers unknown id, wrong secret and already-spent alike —
  distinguishing them would let a caller probe which sessions exist.
- After authorizing, the bot sends a second message with a **reject** button, because the tab
  being let in is whichever one produced the link, not necessarily the one in front of the
  person tapping. Both authorizing paths send it: `/start` in a chat that is already bound,
  and the shared contact that creates the account.
- «Это не я» spends the session and revokes every refresh token of that account. It stays
  pressable until the row is cleaned up, `AUTH_SESSION_RETENTION_SECONDS` (1 day) after the
  session expires — the row is kept precisely for this, since the session itself is spent a
  second after the tap. An access token already issued is **not** revocable (stateless, no DB
  lookup in `get_current_user`), so a tab that was let in keeps working for up to
  `JWT_ACCESS_TTL_SECONDS` (15 min) and then cannot refresh. The copy says so rather than
  claiming every session is gone at once — an overstated security message is worse than
  one that admits a gap.
- The tab survives being unloaded while the person is in Telegram: `useTelegramLogin` keeps
  the bot link in `sessionStorage` and, on the next mount, polls the existing `lb_ls` first,
  opening a new session only on 404/410. It also polls at once on `visibilitychange` and
  `pageshow`, and every poll has a 10s timeout. `isEnabled` is latched after it first turns
  true, so SWR retrying `/api/auth/me` does not tear the polling loop down.
- `TelegramLoginService.reject` answers None both for "this button no longer applies" and
  for "it applied, but the login never named an account", and the handler shows the same
  «отменять нечего» for both. The second case needs a callback for an unauthorized session
  bound to the presser's own chat, and the button is only ever attached after authorizing,
  so it is unreachable today — but it is why the two are not told apart.

### 2. Signature paths (skip the wait)

`POST /auth/telegram/widget` (Telegram Login Widget on `/login`) and
`POST /auth/telegram/mini-app` (the site running inside Telegram's webview) verify Telegram's
own HMAC-SHA256 offline in `auth/telegram_identity.py`. Both are the same trick with different
keys derived from the bot token; payloads older than `MAX_AGE_SECONDS` (24h) are rejected.

`hash` and `signature` are excluded from the hashed string — leaving `signature` in makes
every Mini App login fail.

**Neither path carries a phone number**, so they can only sign in an account that already
exists; a stranger gets `telegram_account_not_linked` and is sent to the bot.

In the Mini App (`useTelegramMiniApp`) a guest retries the sign-in whenever the window becomes
visible again, since they come back from the bot registered, and the «Нужна регистрация» toast
closes on success. A signed-in session is compared with the account in `initData`
(`telegramUserId` on `/users/me` against `user.id`): Telegram accounts on one phone share the
webview's cookies, so on a mismatch the Mini App signs in again as the opener, or signs out
if that account isn't linked. `_document` sends `web_app_ready`/`web_app_expand` from an inline
script before hydration, and `useTelegramBackButton` shows Telegram's BackButton whenever the
window has history of its own (depth counted by Next's `history.state.key`).

The Login Widget is behind `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` because it only authorizes on
the domain registered with `/setdomain` in BotFather. Anywhere else — localhost included — it
renders and then refuses, which is worse than not offering it.

## The bot

`app/telegram/`: `bot.py` (lifecycle), `handlers.py` (commands, buttons, callbacks),
`keyboards.py`, `messages.py` (**all Russian copy**), `notify.py`, `recipients.py`,
`throttling.py`, `webhook.py`, `client.py`, `service.py`.

Menu buttons, each also a command: 🛒 Корзина (`/cart`), 📦 Мои заявки (`/orders`),
📅 Текущий сбор (`/deadline`), 🌐 Ссылки (`/links`, and `/site` for the older name),
ℹ️ Помощь (`/help`), plus `/start`, `/menu` and unlinking. `/wishlist` has no button any
more: it still answers with the saved products to whoever types it.
✍️ Написать Sululu is the one without a command: it asks for a message to the shop (see
"The owner writing to a customer" below).

🌐 Ссылки and ℹ️ Помощь carry an **Instagram** button, and so do the two notifications
that send the customer to the owner — an order deleted and one the owner cancelled, both
through `keyboards.owner_contact_actions`. The shop's account is the only place the owner
speaks outside the bot. Its address is hardcoded in `keyboards.INSTAGRAM_URL`
and duplicated by hand in `apps/website/src/utils/contacts.ts` (the footer and the FAQ use it
there); change one and change the other. Unlike every link to the site it needs no
`_is_public_url` check, so it survives on localhost, where the site button disarms itself.

**Throttling** (`throttling.py`) is an _outer_ middleware registered before filters run: every
path into the bot opens a database session on behalf of an unauthenticated sender, and a
throttled update should not even be matched against handlers. It is a token bucket, so
tapping three buttons in a row is fine and only a sustained burst is refused.

**At most six updates are handled at once** (`concurrency.py`, an outer middleware right
after the throttle): the bot shares the process's database pool (`DB_POOL_SIZE` +
`DB_MAX_OVERFLOW`, 20) with the site and the scheduler, and the throttle bounds one sender,
not many together. A handler holds at most one session at a time, so the slots are also
the most connections the bot can hold; anything past them waits in memory, never dropped.
A second pool for the bot was the alternative and draws the line worse — `notify.py` is
shared by all three, and Postgres would carry both pools.

### The owner writing to a customer

A customer the owner cannot find by phone in Telegram is the usual case, not a rare
one: the number on the account is the one Telegram vouched for, but «Кто может найти
меня по номеру: Мои контакты» makes Telegram answer a search, an «add contact» or a
`t.me/+<number>` link as if the number had no account at all. The bot holds the chat
itself, which no privacy setting touches — so the admin orders table has a
«Написать покупателю через бота» button (`POST /admin/orders/{id}/message`).

The text goes out wrapped by `messages.owner_message` — the order's `#xxxxxxxx` on top,
and «Ответьте на это сообщение или напишите в Instagram» at the bottom, with
`keyboards.owner_message_actions` under it: «✍️ Ответить» (`ReplyAction`), then the
order list and Instagram. The length limit (`MAX_OWNER_MESSAGE_LENGTH`) is counted in UTF-16 code units,
the way Telegram and the textarea's `maxLength` count, not in Python characters.

A **reply to that message** goes to the owner, and so does a reply to the prompt that
«✍️ Ответить» under the message and «✍️ Написать Sululu» in the menu both send:
`messages.reply_prompt` as a `ForceReply` — naming the order from under the message, no
order from the menu — so the client makes the next message a reply without the customer
knowing how. `handle_customer_reply` (matched by `messages.OWNER_MESSAGE_HEADER` on the
replied-to text or caption, or `REPLY_PROMPT_HEADER` / `SHOP_PROMPT_HEADER` on its text,
registered before `handle_receipt`; the order is read off the header's first line only)
passes it to every owner under `messages.customer_reply_for_owner` — a text inside the
same message, anything else (photo, voice, sticker) as a `copy_message` — and
tells the customer `CUSTOMER_REPLY_FORWARDED`, or `CUSTOMER_REPLY_NOT_DELIVERED` when no
owner took it. One exception: a photo or file replying about an order that still takes
payment is a receipt and goes to `handle_receipt`, so it gets filed with the verdict
buttons instead of arriving as chat.

The owner answers the same way, by replying in the chat to what was passed on —
`handle_owner_reply`, matched by `messages.CUSTOMER_MESSAGE_TITLES` on the replied-to
text **or caption**: a customer's photo, video, file or voice reaches the owner as a copy
with the header put into its caption (`_takes_caption`; a sticker or a too-long caption
keeps the header as a message of its own, the copy sent as a reply to it). A text too
long for one message is cut (`service.split_message`) and **every part repeats the
header**; the same holds for the owner's long answer.

The title only routes the reply to `handle_owner_reply`. **Who it goes to is never read
off the text**: every message passed on to an owner — each part, the header and its copy
alike — is recorded in `relayed_messages` (`relay.record`, owner's chat + message id →
writer, order, the `#xxxxxxxx` shown), and the reply is looked up by the id of the
message it answers (`relay.resolve`). It used to be the phone on the `Покупатель:` line,
and that line is partly the customer's: a name with a line break in it, or a photo whose
caption was too long for the header and so arrived under the customer's own words alone,
could name somebody else's number, and the owner's answer went to them. Names are now
flattened to one line as well (`common/text.single_line`; the ones saved before were
rewritten by migration `7c3e5a91d4b2`, wishes included), but the record is the fix.
A message with no record — passed on before the table existed — gets
`OWNER_REPLY_UNTRACKED`, which points to the panel's button. The table is never pruned:
the 30-second limit below keeps it to a trickle, and an owner may answer months later.
The answer goes out as
`messages.owner_message` with `owner_message_actions` (a text inside it; a photo, video,
file or voice as a copy with `messages.owner_media_caption` as its caption, the buttons on
an album's first photo only; a sticker as a copy replying to a «ниже» header), so the
customer can answer it again. The owner hears `OWNER_REPLY_SENT`, or why not: the account is gone or unlinked,
the customer blocked the bot (the binding is dropped), or Telegram refused. Only
`ADMIN_ROLES` are passed on; anyone else quoting a header gets the fallback.

A **wish for the next cycle** (`messages.wanted_product_for_owner`, opening with
`WANTED_PRODUCT_TITLE`) is answered the same way: `handle_owner_reply` matches it too
(`OWNER_REPLYABLE_TITLES`), and `notify_wanted_product` records it the same way, with the
wish's id (`relayed_messages.wanted_product_id`; erasing the account deletes the wish and
the record with it). The
customer gets `owner_message(..., wish=True)` — «Сообщение от Sululu по вашему
пожеланию» — with the same buttons, so they can answer back. Wishes now need an account, so
the number is one the bot has seen; when it no longer leads to a linked chat (the account
was unlinked, or the wish predates the sign-in requirement, when guests typed in any
number), the owner hears `messages.owner_reply_wish_unreachable` with the number to call
instead.

Only a reply travels. Plain text typed into the chat is still `handle_fallback`'s, and
`messages.FALLBACK` says how to reach the shop: press ✍️ Написать Sululu or reply to
the shop's message. Nothing is stored about who pressed what — the prompt carries it all;
what is stored is only where each passed-on message landed, for the way back.

**One message per customer per 30 seconds** (`SHOP_MESSAGE_INTERVAL_SECONDS`): anything
sooner is not passed on, and the customer gets `messages.shop_message_too_soon` with the
seconds left. The mark is set before the send and taken back if no owner got it, so an
undelivered message costs no wait. An album counts as one message — its later photos
(same `media_group_id`) go through and are not acknowledged again — and a receipt is
never held back, since it goes to `handle_receipt` before the limit is looked at. Kept
in memory like the throttle: a restart forgets it.

Unlike every notification it is sent **inside the request**, not after it: nothing was
committed for it to contradict, and the owner is waiting to learn whether it arrived.
The read transaction is ended before the send, and a flood limit is not waited out
(`retry_on_flood=False`) — it comes back as `telegram_send_failed` at once.
Each failure is its own code — `customer_not_in_bot` (no binding, or an erased
account; the page re-reads the list, since the button it pressed was stale),
`customer_blocked_bot` (Telegram said 403; the binding is dropped, the same
as after a broadcast, and the button greys out), `telegram_send_failed` (502, no bot
or Telegram refused). `AdminOrderResponse.canMessage` is what the button reads.

### Payment receipts

Any photo or document sent to the bot is taken for a receipt (`handle_receipt`, registered
**before** `handle_fallback`, which catches every message and would swallow it). A document
must be a PDF or an image; anything else is refused in words. Which order it pays for is
worked out on arrival, **not remembered from the button press** — the dispatcher's FSM
storage is in memory and a restart between the tap and the photo would lose it:

- a reply to a bot message naming exactly one order (`#xxxxxxxx`) takes that one if it is
  the customer's and still payable, at any age; if it is theirs but paid or cancelled since,
  they are told it no longer takes payment — never guessed onto another order. The
  «📎 Отправить чек» button checks the same before prompting. «📎 Отправить чек» sends its prompt as a `ForceReply`, so the client makes the file
  a reply to the prompt by itself, and the prompt names the order — no state, nothing a
  restart could lose. A reply to the bill works the same way. The acknowledgement brings
  the reply keyboard back, since the `ForceReply` displaced it;
- otherwise the candidates are the customer's unpaid **CONFIRMED** orders confirmed within
  the last week (`RECEIPT_GUESS_WINDOW`, measured from `orders.confirmed_at`) — READY ones
  and old cycles' leftovers are not guessed at. One candidate takes it;
- several: the bot replies to the file with one button per order, and the answer
  (`ReceiptOrderChoice`) finds the file again as the question's `reply_to_message`;
- none: the customer is told nothing is waiting for payment.

The same file twice (`file_unique_id`) is one receipt — unless the owner already decided on
it (rejected, or accepted before the order lost its payment), or it was sent against a bill
from before the order went back to PENDING: sent again, that row goes
back for review and to the owners, since the customer evidently holds
it to be right. An album arrives as one message per
page: each page is filed and sent to the owners, the customer is thanked once
(`_acknowledged_albums`, in memory). Owners receive the file re-sent by `file_id` — not
forwarded, since a forward cannot carry buttons — with `PaymentAction` buttons that work
like the order ones: role checked on the presser, caption rewritten to drop them, customer
told after the commit.

**At most `MAX_PENDING_RECEIPTS` (10) wait for the owner per bill**
(`payments/service.py`): every new file is a row and a message to each owner, and the
throttle alone still let one a second through. Past the ceiling `add_receipt` raises
`TooManyPendingReceiptsError` and the customer hears `messages.receipt_too_many` — once
per album (`_refused_albums`). It counts undecided receipts for the current bill, under
the order's row lock, so it is the owner's verdict that makes room, and an album's pages
are counted one after another. A file already waiting is still answered «уже у нас».

A bill longer than Telegram's 4096 (every line is listed) goes out in several messages cut
between lines (`service.split_message`), the receipt button under the last.

The bill greets the customers of the **first** cycle (no earlier deadline) as the shop's
first; every later one gets the same text without that word (`notify._is_first_cycle`).

The bill is the one message sent with `parse_mode="HTML"`: «Sululu» and the sum to pay are
bold, so every product name in it goes through `html.escape`. Every other text is plain and
escapes nothing. Its amounts are written without the thousands separator («3050 сом»),
unlike every other message and the site («3 050 сом»).

### Polling vs webhook

Long polling by default. Webhook mode needs **all three** of `TELEGRAM_USE_WEBHOOK`,
`TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET` — a url without a secret is an endpoint
anyone who guesses the path can post to, and the bot refuses that configuration. Registration
failure **falls back to polling** rather than raising: a bad bot setting must not take
`/health` and the catalog down with it.

`POST /telegram/webhook` is mounted always and 404s unless enabled; it is exempt from rate
limiting. Registration **keeps the updates that piled up** while the process was down
(`drop_pending_updates=False`): among them are receipts and messages for the shop, and a
dropped one was lost without a word to its sender. Telegram holds them for a day; a stale
button press among them is harmless, since every callback re-checks the state it acts on. Note that long polling is what makes `uvicorn --reload` awkward while working on the
bot.

A token can be delivered to only one of the two at a time, so a local bot sharing the
production token never receives an update — see **Local dev needs its own bot** in
[gotchas.md](gotchas.md).

## Notifications

`app/telegram/notify.py`. Everything addressed to "the owner" fans out to **every** account
with admin rights — `ADMIN` and `SUPER_ADMIN` alike (`recipients.get_owners`).

| Trigger                                                               | Who hears                       |
| --------------------------------------------------------------------- | ------------------------------- |
| New order — at checkout, or placed by an admin (then it names them)   | Owner                           |
| Order an admin placed for the customer, listing its lines             | That customer                   |
| Order status change (incl. the owner undoing their own cancel)        | Customer                        |
| Order confirmed: the bill, requisites and «📎 Отправить чек»          | Customer                        |
| Payment receipt sent to the bot                                       | Owner (the file, with verdict)  |
| Owner accepted / rejected a receipt                                   | Customer                        |
| Order cancelled by its customer, and that cancellation taken back     | Owner                           |
| Order deleted by owner (unless it was already completed or cancelled) | Customer                        |
| Catalog price change repricing PENDING orders                         | Each affected customer          |
| Product soft-deleted, dropping lines                                  | Each affected customer          |
| Cycle opened / deadline moved                                         | Customers                       |
| Deadline reminders (24h, 3h)                                          | Customers with a non-empty cart |
| Cycle closed: shopping summary                                        | Owner                           |
| Cycle closed: cart rescued into wishlist                              | Each cart holder                |
| Cycle closed                                                          | Customers with orders in it     |
| Account erased, withdrawing its pending orders                        | Owner (one message naming them) |
| Closed cycle still holding unanswered orders (once per cycle)         | Owner                           |
| Wish for a product the catalog lacks, left under an empty search      | Owner (name, phone and text)    |
| Owner's own text from the orders panel (sent in the request)          | That order's customer           |
| Customer's reply to the owner's text or to the «Ответить» prompt      | Owner (name, phone and reply)   |
| Owner's reply in the chat to a customer's passed-on message           | That customer                   |
| Owner's reply in the chat to a wish for the next cycle                | Its writer, if linked by phone  |

**Three rules that the code is shaped around:**

1. **Notify after the commit, never inside the transaction.** A message about a state that
   then rolls back is a lie the system cannot retract — the owner sent shopping against a
   cycle still collecting, or customers told their carts are saved when they aren't. Services
   return what needs saying; the caller commits and then sends.
2. **For reminders: plan → send → stamp.** Planning is read-only so no write transaction is
   held open across a Telegram round-trip per recipient, and the stamp follows the send so a
   crash mid-sweep re-sends rather than silently swallowing. A duplicate nudge is a nuisance;
   a missed one is a lost order. Only what actually went out is stamped.
3. **The opening announcement is stamped the same way**, in `order_cycles.announced_at`. It
   fans out over every linked customer and runs outside the request that created the cycle, so
   a restart partway through it used to leave everyone past that point permanently unaware the
   shop was open, with nothing recording that they had been missed. `cycle_notice_sweep` picks
   up any still-collecting cycle the stamp is missing from and re-runs `notify_cycle_opened`,
   which repeats itself to the customers it did reach — the same trade as a duplicate nudge.
   A cycle already closed or past its deadline is left alone: announcing it invites people to
   order in something that no longer takes orders. Reopening one, on the other hand, clears
   the stamp and announces it afresh, in place of the deadline-changed notice.

   While a broadcast is in flight the cycle is claimed in memory (`notify._announcing`), so a
   tick landing mid-fan-out does not start a second copy of it. In memory and not in the row
   on purpose — a claim that survived the process would leave a cycle killed mid-announcement
   claimed for good, which is the failure this exists to repair. It rests on the scheduler
   living in the one API process, as every sweep here already does.

**The stale-order nudge** (`stale_order_sweep`) is the one message about something that
never happened. `UNFULFILLED_AFTER` past a cycle's close, any order still `PENDING` in it is
one the purchase went by without answering — the customer already reads that on the site
(`PendingStage.UNFULFILLED`, [domain.md](domain.md)), and this tells the owner the same thing
once, in `order_cycles.stale_orders_notice_at`, plan → send → stamp like the reminders —
and, like them, only what actually went out is stamped: the stamp is final, so a nudge that
failed to send is left planned for the next tick rather than lost.

It nudges and never acts. Nothing expires an order: the sweep touches no row but the stamp,
and the orders it counts are ended — or confirmed after all — by the owner in the panel, one
at a time. A timer picking `CANCELLED_BY_OWNER` on their behalf would be the shop saying "не
смогла достать" about goods nobody had looked for, and an order three weeks old may still be
one a slow owner is about to confirm.

**The thanks after pickup asks for a Google review.** `order_completed_actions` puts
«⭐ Оставить отзыв в Google» above the orders link and the Instagram, pointing at
`GOOGLE_REVIEW_URL`. Reviews on the Business Profile are what rank the shop on the map for a
bare «косметика», and the moment the goods are in hand is the one moment to ask. Only there:
a review button under a cancellation would be asking at the worst time. With the variable
empty, which is how it stays until Google verifies the profile and hands out the link, the
button drops out and the keyboard is the contact one unchanged.

Message copy lives in `messages.py` and is Russian. The bot omits link buttons pointing at
`localhost` — Telegram rejects those — so those buttons simply don't appear in local dev.
On an `https` site every link to it is a **`web_app` button**, not a url one
(`keyboards._site_button`): it opens the page as a Mini App, which signs the customer in from
`initData` by itself, while a url button would land them on the site as a guest. Plain `http`
can't be a Mini App, so there the buttons stay url buttons. Tests read either kind through
`keyboards.button_target`.
