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

The Login Widget is behind `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` because it only authorizes on
the domain registered with `/setdomain` in BotFather. Anywhere else — localhost included — it
renders and then refuses, which is worse than not offering it.

## The bot

`app/telegram/`: `bot.py` (lifecycle), `handlers.py` (commands, buttons, callbacks),
`keyboards.py`, `messages.py` (**all Russian copy**), `notify.py`, `recipients.py`,
`throttling.py`, `webhook.py`, `client.py`, `service.py`.

Menu buttons, each also a command: 🛒 Корзина (`/cart`), 📦 Мои заявки (`/orders`),
⭐ Избранное (`/wishlist`), 📅 Текущий сбор (`/deadline`), 🌐 Ссылки (`/links`, and
`/site` for the older name), ℹ️ Помощь (`/help`), plus `/start`, `/menu` and unlinking.

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

### Polling vs webhook

Long polling by default. Webhook mode needs **all three** of `TELEGRAM_USE_WEBHOOK`,
`TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET` — a url without a secret is an endpoint
anyone who guesses the path can post to, and the bot refuses that configuration. Registration
failure **falls back to polling** rather than raising: a bad bot setting must not take
`/health` and the catalog down with it.

`POST /telegram/webhook` is mounted always and 404s unless enabled; it is exempt from rate
limiting. Note that long polling is what makes `uvicorn --reload` awkward while working on the
bot.

A token can be delivered to only one of the two at a time, so a local bot sharing the
production token never receives an update — see **Local dev needs its own bot** in
[gotchas.md](gotchas.md).

## Notifications

`app/telegram/notify.py`. Everything addressed to "the owner" fans out to **every** account
with admin rights — `ADMIN` and `SUPER_ADMIN` alike (`recipients.get_owners`).

| Trigger                                                               | Who hears                       |
| --------------------------------------------------------------------- | ------------------------------- |
| New order at checkout                                                 | Owner                           |
| Order status change (incl. the owner undoing their own cancel)        | Customer                        |
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

Message copy lives in `messages.py` and is Russian. The bot omits link buttons pointing at
`localhost` — Telegram rejects those — so those buttons simply don't appear in local dev.
