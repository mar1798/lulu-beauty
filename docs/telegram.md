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
  person tapping.

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
⭐ Избранное (`/wishlist`), 📅 Текущий сбор (`/deadline`), 🌐 Сайт (`/site`),
ℹ️ Помощь (`/help`), plus `/start`, `/menu` and unlinking.

**Throttling** (`throttling.py`) is an *outer* middleware registered before filters run: every
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

## Notifications

`app/telegram/notify.py`. Everything addressed to "the owner" fans out to **every** account
with admin rights — `ADMIN` and `SUPER_ADMIN` alike (`recipients.get_owners`).

| Trigger | Who hears |
| --- | --- |
| New order at checkout | Owner |
| Order status change | Customer |
| Order deleted by owner | Customer |
| Catalog price change repricing PENDING orders | Each affected customer |
| Product soft-deleted, dropping lines | Each affected customer |
| Cycle opened / deadline moved | Customers |
| Deadline reminders (24h, 3h) | Customers with a non-empty cart |
| Cycle closed: shopping summary | Owner |
| Cycle closed: cart rescued into wishlist | Each cart holder |
| Cycle closed | Customers with orders in it |

**Two rules that the code is shaped around:**

1. **Notify after the commit, never inside the transaction.** A message about a state that
   then rolls back is a lie the system cannot retract — the owner sent shopping against a
   cycle still collecting, or customers told their carts are saved when they aren't. Services
   return what needs saying; the caller commits and then sends.
2. **For reminders: plan → send → stamp.** Planning is read-only so no write transaction is
   held open across a Telegram round-trip per recipient, and the stamp follows the send so a
   crash mid-sweep re-sends rather than silently swallowing. A duplicate nudge is a nuisance;
   a missed one is a lost order. Only what actually went out is stamped.

Message copy lives in `messages.py` and is Russian. The bot omits link buttons pointing at
`localhost` — Telegram rejects those — so those buttons simply don't appear in local dev.
