# Deploying Sululu

The whole stack on a single server: Caddy (TLS) → `website` (Next) → `api`
(FastAPI) → `db` (Postgres 16). One `docker compose` command brings it up, and
only Caddy faces the internet.

That shape is a deliberate choice for the MVP: the API runs a permanent
scheduler (`app/scheduler.py` — reminders, closing cycles, session cleanup) and
keeps product photos on local disk (`LocalDiskStorage`), so serverless and
scale-to-zero don't fit, and horizontal scaling isn't needed yet.

---

## Already done (in the repository)

| File | Purpose |
| --- | --- |
| `apps/api/Dockerfile` | Backend image. Build context is `apps/api` itself. Runs `alembic upgrade head` on start |
| `apps/api/.dockerignore` | For the backend context: `.venv`, caches, the local `uploads/` |
| `apps/website/Dockerfile` | Frontend image. Build context is the **repository root** (Next compiles `widgets` from source) |
| `.dockerignore` | For the frontend context, i.e. the whole repo: keeps `.git`, `node_modules`, `.env*` out of the image |
| `docker-compose.prod.yml` | The production stack: `db`, `api`, `website`, `caddy` |
| `deploy/Caddyfile` | Routes and automatic TLS |
| `deploy/.env.prod.example` | Template for every production variable (copied to `.env.prod` at the root) |
| `deploy/backup.sh` | Backs up the database and photos, verifies the archives, rotates them, uploads via `rclone`, pings the monitor |
| `deploy/restore.sh` | Restores from those archives, keeping a safety copy of the current state |
| `deploy/health-watch.sh` | Checks the site every 5 minutes and pings healthchecks.io (Step 10) |
| `deploy/release.sh` | Deploys a release by tag: backup, build, wait for `healthy`, check `/health`, write the log (see "Releases") |
| `apps/website/next.config.js` | `output: 'standalone'`, security headers, the `/files/*` rewrite — nothing to change here |
| `.gitignore` | Contains `.env.prod`, so secrets never reach git |

The root `docker-compose.yml` (no suffix) is the **development** one: it brings
up only `db` and `api` for local work. Production never uses it, which is why
every command below passes `-f docker-compose.prod.yml` explicitly.

Verified locally: the frontend image builds, the container starts and answers
`200` on `/`, `/login` and `/catalog` even when the API is unreachable (catalog
pages fill in through ISR on first request).

**No code change is needed to deploy.** Everything below is on your side:
server, domain, bot, secrets.

---

## Step 1. Server

A VPS with Docker: 2 vCPU / 4 GB RAM / 40 GB disk is comfortably enough
(Hetzner CX22 ≈ €4.5/month, any equivalent works). OS — Ubuntu 24.04 LTS.

On a fresh server:

```bash
# as root
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # docker + docker compose plugin
adduser --disabled-password deploy              # no password needed: key-only login
usermod -aG docker deploy                       # don't work as root
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Privileges.** `deploy` is in the `docker` group, which covers everything
routine: compose, backups, releases. System commands (`apt`, `ufw`,
`systemctl`) are needed rarely but are needed — and the account has no password
and never will, so `sudo` has to work without one:

```bash
# as root
printf 'deploy ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/90-deploy
chmod 440 /etc/sudoers.d/90-deploy
visudo -c                                       # mandatory: a broken sudoers means no sudo at all
```

`NOPASSWD` is not a concession here. Access to the docker socket already equals
root (mounting `/` is one command away), and `deploy` is in the `docker` group
out of necessity — without it neither compose nor `deploy/backup.sh` works. A
password on `sudo` would imitate a barrier this machine does not have.

**SSH access.** Keys only, no root at all:

```bash
# as root
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t && systemctl reload ssh                 # -t is mandatory: a broken config locks you out
```

⚠️ **Order matters.** Make sure `sudo -n true` as `deploy` succeeds **before**
you close root: `PermitRootLogin no` with a broken `sudo` leaves the hosting
provider's console as the only way in.

Verify both halves:

```bash
ssh root@server true        # expect: Permission denied (publickey)
ssh deploy@server true      # expect: silence and exit code 0
```

Passwords are disabled not because anyone is guessing them — `root` and
`deploy` have them locked (`passwd -S` → `L`), there is nothing to guess. The
point is the day someone needs `passwd deploy`: without this, the account would
silently become reachable from the internet by password and nobody would
remember why. `PermitRootLogin` defaults to key-only anyway, but the key sitting
in root's `authorized_keys` is the same one `deploy` uses — a second door with
no gain, and one whose actions can't be told apart from the owner's in the logs.

From here on, work as `deploy`, through `sudo`.

**fail2ban.** Installs and starts itself, and its `sshd` jail is enabled out of
the box (`/etc/fail2ban/jail.d/defaults-debian.conf`); it reads the journal and
bans for 10 minutes after 5 failures:

```bash
sudo apt install -y fail2ban
sudo fail2ban-client status sshd                # the banned list fills up within hours
```

The value is mostly hygiene: with passwords off, guessing is doomed regardless,
but ~40 attempts a day from a couple of dozen addresses stop cluttering the log.

**Firewall.** Only SSH, `80` and `443` need to be reachable — the last one over
both TCP and UDP (hence four rules for three ports). Close everything else:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp     # HTTP/3; without it Caddy silently falls back to TCP
sudo ufw enable
```

⚠️ **ufw does not govern ports published by Docker.** Docker writes its own
`iptables` rules, bypassing `ufw`, so `80`/`443` from `caddy` would be reachable
even with the firewall closed. The rules above aren't for them — they're for
everything else listening on the host itself: today that's a lone `sshd`, but
every `apt install` that starts a service would otherwise land on the internet.

Port `5432` is deliberately absent: in `docker-compose.prod.yml` the `db`
service publishes no ports at all, and the database is reachable only from
inside the compose network (unlike the development `docker-compose.yml`, which
binds it to the host). An `ssh -L 5432:localhost:5432` tunnel would therefore
have nothing to connect to — work with the database on the server like this:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

(the user and database names come from the container's own environment, so the
command can't drift from `POSTGRES_USER`/`POSTGRES_DB` in `.env.prod`)

**Docker Hub.** The base images (`postgres:16-alpine`, `caddy:2-alpine`) are
pulled anonymously unless the server logs in, and an anonymous pull is metered at
10 an hour per IP address. That ceiling is only ever reached at the worst
possible moment — a rebuild in the middle of an incident — and it arrives looking
like a broken release rather than like a quota. A free account raises it to 200
an hour and meters them against the account instead of the address:

```bash
# as deploy, not through sudo: the credentials land in the home directory of
# whoever logs in, and it is deploy that runs compose and deploy/release.sh
docker login -u <hub-account>     # at the prompt, paste an access token
```

Create the token in Docker Hub → **Account settings** → **Personal access
tokens**, with **Public Repo Read-only** permissions — not the account password.
`~/.docker/config.json` keeps whatever is entered in base64, which is encoding
and not encryption, so what sits there should be a key that can do nothing but
read public images and can be revoked by itself.

Nothing else changes: compose and `deploy/release.sh` find the credentials on
their own. `docker-ratelimit-source` in the registry's response answers which
limit is in force — the account name means the login took, an IP address means it
did not.

---

## Step 2. Domain

1. Buy a domain (or use an existing one).
2. Point an `A` record at the server's IP (and `AAAA` if you have IPv6).
3. **Wait for it to propagate** (`dig +short your-domain` must return the
   server's IP).

This has to happen **before** the first start: Caddy requests a Let's Encrypt
certificate as soon as it comes up, and without working DNS it gets refused.
Several failures in a row run into Let's Encrypt's weekly limits.

---

## Step 3. Telegram bot

In [@BotFather](https://t.me/BotFather):

1. `/newbot` — get the bot's **token** and **username**.
2. Register the domain: `/mybots` → your bot → **Bot Settings** → **Login
   Widget** → add `https://your-domain` under **Allowed URLs**.
   `/setdomain` no longer works — BotFather answers it with a link to the
   [documentation](https://core.telegram.org/bots/telegram-login). Several
   addresses can be registered now, so a staging environment doesn't need a
   second bot. **The Client ID and Client Secret BotFather shows in that section
   are not needed here** — that's OIDC, which this project doesn't use. Neither
   is a Redirect URI: `TelegramLoginWidget` works through the `data-onauth`
   callback, without a redirect. With no address registered, the "Log in with
   Telegram" button on `/login` renders and then refuses to authorize; set
   `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET=false` in `.env.prod` in that case.
3. Optional: `/setmenubutton`, description, avatar.

Signing in through the bot itself (opening the chat, confirming) works **without**
this registration — it is only needed for the button that authorizes right in
the browser.

The webhook needs no manual registration: the backend does it on start, provided
all three of `TELEGRAM_USE_WEBHOOK` / `TELEGRAM_WEBHOOK_URL` /
`TELEGRAM_WEBHOOK_SECRET` are filled in `.env.prod`.

---

## Step 4. Code on the server

```bash
git clone <repository address> lulu-beauty
cd lulu-beauty
git checkout --detach v2026.09.14   # latest tag: git tag -l 'v*' --sort=-v:refname | head -1
```

Production lives on a tag, not a branch (see "Releases" below) — but on the very
first run there may be no tag yet, in which case just stay on `master`.

---

## Step 5. Environment variables

```bash
cp deploy/.env.prod.example .env.prod
```

Generate four values (each with its own command — don't reuse one):

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET
openssl rand -hex 16   # POSTGRES_PASSWORD
```

Fill in `.env.prod`:

| Variable | Value |
| --- | --- |
| `SITE_DOMAIN` | `your-domain` (without `https://`) |
| `ACME_EMAIL` | your email — Let's Encrypt sends expiry warnings there |
| `POSTGRES_PASSWORD` | the generated password |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | the generated secrets |
| `CORS_ORIGIN`, `WEBSITE_BASE_URL`, `TELEGRAM_WEBHOOK_URL` | `https://your-domain` |
| `PUBLIC_FILES_BASE_URL` | `https://your-domain/files` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | from BotFather (username without `@`) |
| `TELEGRAM_WEBHOOK_SECRET` | the generated secret |
| `OWNER_PHONE`, `OWNER_NAME` | the shop owner's phone and name |

The rest of the template already has sensible values, but check them against
your shop: `CYCLE_TIMEZONE` (`Asia/Bishkek` — cycle deadlines are computed in
it), `CURRENCY` (`KGS`) and `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` (turn it off if
the domain isn't registered with the bot yet).

⚠️ **`PUBLIC_FILES_BASE_URL` must be exactly `https://<SITE_DOMAIN>/files`.**
This isn't cosmetic: `apps/website/src/components/Image.tsx` strips precisely
that prefix off the photo address stored in the database so the image becomes
relative (`/files/...`) and goes through Next's rewrite. Let the two drift apart
and product photos stop showing.

`.env.prod` holds secrets and is in `.gitignore` — **never commit it**.

---

## Step 6. First start

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. Then:

```bash
# all four services must be Up (db, api and website healthy as well;
# caddy has no healthcheck)
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

# logs, if something didn't come up
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f caddy
```

---

## Step 7. Owner account

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec api python -m app.scripts.seed
```

The script creates an ADMIN row for the number in `OWNER_PHONE`. There is no
password — signing in happens only through Telegram, so the owner then has to
open the bot **from that exact number** and share their contact: only then does
the Telegram account bind to the admin row that was created.

Sharing the contact from a different number produces an ordinary customer with
no access to `/admin`.

---

## Step 8. Verification

- [ ] `https://your-domain` opens and the padlock is green
- [ ] `/catalog` opens (an empty catalog is fine — there are no products yet)
- [ ] `/login` → signing in through Telegram goes all the way through and the bot confirms
- [ ] the owner lands in `/admin` (a customer is redirected to `/catalog` — that's intended)
- [ ] a product **with a photo** can be added in the admin UI and the photo shows in the catalog
      (this is what verifies `PUBLIC_FILES_BASE_URL` ↔ `NEXT_PUBLIC_API_BASE_URL`)
- [ ] a cycle opens, a product goes into the cart, an order is placed, the bot sends a notification
- [ ] the xlsx export of an order downloads
- [ ] a link to the site sent in Telegram unfurls into a preview with an image
      (the `og:*` address is built from `SITE_DOMAIN` at image build time — if the preview
      is empty, check that `website` was rebuilt and not merely restarted)
- [ ] `./deploy/backup.sh` runs and produces two non-empty archives (Step 9)
- [ ] `curl -o /dev/null -w '%{http_code}\n' https://your-domain/api/proxy/health` → `200`
      (the same address goes to the external monitor later, Step 10)

---

## Step 9. Backups

State lives in two places: the `pgdata` volume (database) and the `uploads`
volume (product photos). Losing the second one leaves `product_images` rows in
the database pointing at nothing. The `caddy_data` volume (certificates) is
deliberately excluded: Caddy will issue them again — which is also why you
shouldn't recreate that volume without reason, since Let's Encrypt's weekly
limits are counted per domain. The `next_cache` volume (ISR cache and
re-encoded images) is excluded too: it refills on its own, paid for by the first
visitor of each page.

`deploy/backup.sh` takes both, verifies the archives, optionally uploads them
off the box through `rclone`, and deletes old ones:

```bash
./deploy/backup.sh
```

Its only dependencies are `docker` and `flock` (both present in Ubuntu by
default); `rclone` is optional, for uploading off-site.

Daily, from cron (as `deploy`, `crontab -e`):

```
17 3 * * * /home/deploy/lulu-beauty/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

Configured through environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_DIR` | `$HOME/lulu-backups` | where to put the archives |
| `KEEP_DAYS` | `14` | how long to keep the database dumps (locally and on the remote) |
| `KEEP_DAYS_UPLOADS` | `4` | how long to keep the photo archives, same two places |
| `BACKUP_REMOTE` | `BACKUP_REMOTE` in `.env.prod` | rclone remote to upload to, e.g. `r2:lulu-backups` |
| `ENV_FILE` | `<root>/.env.prod` | where compose reads variables from |
| `BACKUP_PING_URL` | empty | monitoring ping address (Step 10) |

**Why the two windows differ.** The database changes continuously, so fourteen
dumps are fourteen different states worth returning to, and they cost kilobytes.
The photos don't change at all — the names are uuids and the bytes behind one
never change (`app/common/static.py` leans on exactly that for its year-long
`Cache-Control`) — so every nightly archive is another copy of the same bytes.
Keeping fourteen of those means paying fourteen times for one catalogue: 700 MB
of photos would fill the free 10 GB of R2 on its own, and the same again on a
40 GB disk. Four days is enough to notice that something is wrong and reach for
an archive; beyond that the extra copies buy nothing.

⚠️ **A dump older than `KEEP_DAYS_UPLOADS` has no photo archive of its own
date.** Restore it against the newest photo archive: the files are immutable and
only ever added, so a later set is the older one plus extras no restored row
mentions. What it can lack are photos deleted in between — the owner replacing a
product's picture — and those rows then point at nothing, exactly as they would
after losing the volume.

The day the photos outgrow this shape, the fix isn't a smaller window but a
different one: `rclone sync` of the volume instead of a nightly tar, with
`--backup-dir` so a deletion is moved aside rather than repeated. That stores one
copy instead of four and lifts the ceiling to the full 10 GB — at the price of
rewriting the photo half of `restore.sh`, which is why it isn't done yet.

⚠️ **Until `BACKUP_REMOTE` is set, the copies sit on the same server** — which
doesn't help when you lose it, and the script warns about this on every run.
Off-site storage is a one-time setup:

```bash
sudo -v ; curl https://rclone.org/install.sh | sudo bash
rclone config           # add a remote (Cloudflare R2 / S3 / anything else)
BACKUP_REMOTE=r2:lulu-backups ./deploy/backup.sh
```

**Cloudflare R2 step by step** (free up to 10 GB, and egress isn't billed at all
— unlike S3, where getting data out is the main line item):

1. Cloudflare dashboard → **R2 Object Storage** → enable it (a card is required
   even for the free tier) → **Create bucket**, class **Standard**, private access.
2. **Manage R2 API Tokens** → **Create API token**. Type — **Account**, not User:
   a user token acts on behalf of a person and dies together with their access,
   and a nightly backup must not depend on who else is in the account.
3. Permissions — **Object Read & Write** (not Admin: the script needs to put, get
   and delete objects, not destroy buckets), **Apply to specific buckets** → pick
   yours.
4. **Client IP Address Filtering** can be left alone at this stage — get the
   upload working first, then restrict it to the server's address. Otherwise a
   failure is indistinguishable between a wrong key and a filtered address.
5. From the result page (shown **once**) copy the Access Key ID, Secret Access
   Key and S3 endpoint **using the buttons**.

`~/.config/rclone/rclone.conf` as `deploy`, mode `600`:

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = …
secret_access_key = …
endpoint = https://<account_id>.r2.cloudflarestorage.com
region = auto
no_check_bucket = true
```

Check access with `rclone ls r2:<bucket>`. An `AccessDenied` on `rclone lsd r2:`
specifically (without a bucket name) is normal and means nothing: a token scoped
to one bucket isn't allowed to list them all. Judge by operations on the bucket
itself.

Put `BACKUP_REMOTE=r2:lulu-backups` in `.env.prod` and every run uploads — the
nightly cron one and, just as importantly, the one `deploy/release.sh` takes
before it rebuilds. That backup snapshots the state you are about to change, so
it is the last one that should be sitting on the server alone. The environment
still wins over the file, so `BACKUP_REMOTE=r2:elsewhere ./deploy/backup.sh`
redirects a single run without editing anything.

`BACKUP_PING_URL` stays in the cron line on purpose: it describes that scheduled
job, not the installation. Ping from a release-time backup and healthchecks.io
resets its timer off-schedule, which is precisely how a nightly run that stopped
happening goes unnoticed.

**Restoring** — `deploy/restore.sh`, from the same pair of archives:

```bash
./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
                    ~/lulu-backups/uploads-2026-08-18-0317.tar.gz
```

You can pass just one — the database and the photos are restored independently.
The script verifies the archives, asks for confirmation, takes a safety copy of
the current state (`pre-restore-*`), stops `website` and `api` during the swap,
recreates the database and loads the dump, replaces the contents of the
`uploads` volume and brings the services back up. `--yes` skips the question,
`--no-safety` skips the safety copy.

⚠️ The operation is destructive: current data is replaced wholesale. The
database is genuinely recreated (DROP/CREATE) rather than loaded over: a
`pg_dump` dump contains no DROPs, and loading it into a non-empty database would
fail on key conflicts, leaving half the old rows and half the new.

**Test a restore at least once.** A backup that has never been restored isn't a
backup, it's a hope.

---

## Step 10. Monitoring

Three things you'd otherwise learn about last: the site is down, the nightly
backup didn't run, the CSP policy is breaking a page for a visitor. Everything
that could be done inside the repository is done; what's left is signing up for
the external services and putting the check addresses into cron.

### Site and database — an external check

The `/health` endpoint is exposed through Next's proxy:

```bash
curl https://your-domain/api/proxy/health
# {"status":"ok","info":{"database":{"status":"up"}}}
```

`200` means the whole chain is alive — Caddy, Next, the API and the database (a
real `SELECT 1` inside); `503` means the database is unreachable.

The root alone says little: the pages are static and are served even with a dead
database. But `/health` alone isn't enough either — a check performed by the
server itself goes quiet together with it. So monitoring has two halves, each
covering the other's blind spot.

**First half: the view from outside.** A monitor on `https://your-domain/` —
it catches what the server cannot report: the machine is off, Caddy didn't come
up, the certificate expired, the A record broke, the host had an outage.

⚠️ There is no `/health` **outside**: Caddy sends only `/telegram/webhook`
straight to the API and everything else to Next, so the public address of the
check is `/api/proxy/health` — `HEAD /health` on the domain is a 404 from Next,
not a health check. And that address is no good for a free monitor either. The
proxy forwards the method as it is (`pages/api/proxy/[...path].ts`) and passes
the upstream status back untouched, while `/health` is registered with
`@router.get`, which in FastAPI — unlike a bare Starlette route — does not answer
HEAD: the reply is `405`. Free tiers usually do nothing but HEAD (an arbitrary
method is a paid option on UptimeRobot), so a monitor pointed there reports a
working site as permanently down.

The root is therefore what is checked from outside (`HEAD /` → `200`), and the
database is covered by the second half. That split is the better shape anyway: a
check on the root doesn't depend on the proxy route surviving the next edit.

**Second half: `deploy/health-watch.sh`.** Every 5 minutes it GETs `/health`
itself and reports to healthchecks.io:

```
*/5 * * * * HEALTH_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/health-watch.sh
```

Success means `200` **and** `"status":"ok"` **and** `"database":{"status":"up"}`
in the body: the code alone is too little, since a `200` with an empty or
foreign body would mean something other than what we think is answering. Before
declaring a failure it retries once after 10 seconds — a one-off network hiccup
shouldn't wake anyone. Only failures are written to the log
(`$HOME/health-watch.log`), otherwise it accumulates 288 lines of nothing a day.

The script takes the domain from `SITE_DOMAIN` in `.env.prod` — the same
variable Caddy issues the certificate for, so the checked address can't drift
from the working one. Finding no domain, it exits with code `2` and **does not
ping**: silence in monitoring would read as "all good".

This half catches the death of the server too, but not by itself: the pings
simply stop arriving and healthchecks raises the alarm on its own schedule. Set
it up with a 5-minute period and a 15-minute grace time — then a miss caused by
a reboot won't alert, and three in a row will.

### Backup — a ping on success

`deploy/backup.sh` can report to monitoring: on success it pings
`BACKUP_PING_URL`, on failure `$BACKUP_PING_URL/fail`, with the last 20 log
lines as the body (so the email shows where it stopped). The healthchecks.io
protocol; the free tier is more than enough.

Create a check there with a "daily" schedule and put its address into cron:

```
17 3 * * * BACKUP_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

If `BACKUP_REMOTE` is set as well, both variables go on the same line, before
the path to the script.

The value here is precisely the **silence**: the email also arrives when the
backup didn't run at all — the server is off, cron is broken, the disk is full.
The ping itself can't fail the backup: three attempts, ten seconds each, and an
unreachable monitor is only a warning in the log.

### CSP — reports in the log

The full policy in `apps/website/next.config.js` is still in `Report-Only` mode:
browsers send violations to the site's own `/api/csp-report` endpoint, which
writes them to the container's stdout.

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs website | grep csp-violation
```

A line looks like this:

```
csp-violation report script-src-elem blocked=https://cdn.example/a.js page=https://your-domain/catalog at=https://your-domain/_next/static/chunk.js:42
```

— what was blocked, on which page, and which file caused it. `enforce` instead
of `report` means a violation of the **enforced** part of the policy: that one
is breaking for a visitor right now. Identical violations are logged once (the
count resets when the container restarts), and reports from other people's
browser extensions are discarded — otherwise they would fill the log entirely.

After a week or two of live traffic the log is worth reading. If there are no
violations of your own (or they're fixed), it's time to switch the policy to
enforcing mode: move the directives from `REPORT_ONLY_CSP` to `ENFORCED_CSP` and
rebuild `website`. `script-src` will keep `'unsafe-inline'` while the pages are
static, but the other directives (`img-src`, `connect-src`, `frame-src`) are
none the worse for it.

---

## Releases

Two branches. `development` is where work lands, `master` is what production
runs. Direct pushes to `master` are blocked in GitHub's settings; the only way
in is a release merge with green checks — in the branch settings they are called
`Website and widgets` and `API` (the job names, not the workflow names).

```
feature/* ──► development ──(PR)──► master ──► tag vYYYY.MM.DD ──► server
```

**1. Merge.** A PR `development → master`, a **merge commit** (not a squash: a
history of meaningful commits is the point here). That is the whole manual part:
`.github/workflows/release-tag.yml` tags the merge commit by itself, because
every merge into master is a release and the name of one shouldn't depend on
somebody remembering to type it.

The `vYYYY.MM.DD` scheme rather than semver: nothing is published as a package,
and the versions in `package.json` and `pyproject.toml` have nothing to do with
what is deployed. Two releases in one day — `v2026.09.14.2`, and the workflow
counts the suffix up from the tags that already exist. The date is taken in
`Asia/Bishkek`, not UTC: it is a date a human reads, and a merge at 03:00 local
would otherwise be stamped with the previous day.

The tag is annotated, and its message lists the commits since the previous tag —
so `git show <tag>` on the server answers "what is in this release" without
reaching for the network. Re-running the workflow on an already tagged commit
does nothing rather than inventing a second name for the same release.

By hand, if ever needed (the workflow is disabled, or a tag has to move):

```bash
git checkout master && git pull
git tag -a v2026.09.14 -m "Monitoring, ISR cache, Sululu branding"
git push origin v2026.09.14
```

⚠️ A tag created by a workflow through the default `GITHUB_TOKEN` **does not
trigger other workflows** — GitHub prevents the recursion deliberately. Nothing
depends on that today, but anything built on `on: push: tags:` later will need a
PAT or a deploy key instead, and its absence is silent: the workflow simply never
runs.

**2. Deploy.** On the server, as `deploy`:

```bash
./deploy/release.sh              # the latest tag
./deploy/release.sh v2026.09.14  # a specific one — rollbacks use the same command
```

The script checks that the working tree is clean, lists the commits between what
is deployed and what's coming, warns about migrations in the release, asks for
confirmation, takes a backup, does a `checkout --detach` onto the tag, rebuilds
the stack, waits for `db`, `api` and `website` to be `healthy`, hits
`https://<domain>/api/proxy/health` from outside, drops build cache older than a
week, and appends a line to `~/releases.log`. On failure it prints a ready-made
rollback command. Flags: `--yes`, `--no-backup`, `--no-wait`, `--no-prune`.

The cleanup is there because nothing else does it: every `up -d --build` leaves
layers behind, and on a 40 GB disk the cache outgrows the images, the volumes and
the database put together within a few dozen releases — then it runs out during a
build, which is to say during a deploy. It runs after the build, never before:
the warm cache is what makes this release, and a rollback straight after it,
quick. The age cut (`PRUNE_OLDER_THAN`, `168h` by default) is the compromise — a
rollback to a tag older than that rebuilds from further back and takes minutes
longer, which is the price of a disk that doesn't fill up quietly. A failed
cleanup is a warning and nothing more: the release is already running by then.

The detached HEAD on the server is intentional: committing in production isn't
possible. The answer to "what is in production right now" is `git describe
--tags` on the server, or `~/releases.log`.

**3. Rollback** — the same script with the previous tag. It always works,
**except for the database schema**: `api` runs `alembic upgrade head` on every
start, and migrations never go back on their own.

⚠️ Hence the release rule: **only expanding migrations in a single release** —
add a nullable column, a table, an index. Dropping a column or a table, renaming
one, adding `NOT NULL` to an existing field — those go in the next release, once
the previous one has lived in production. Then a code rollback is always safe
and needs neither `alembic downgrade` nor a restore from backup. A release that
breaks this rule can only be undone through `deploy/restore.sh`.

**A hotfix** is a branch off `master`, a PR into `master`, a tag, a deploy; then
`master` is merged back into `development`, or the fix is lost in the next
release.

---

## Everyday operations

Everything below runs **as `deploy`** (root over SSH is closed, Step 1). If you
somehow get onto the server another way, run git commands in
`/home/deploy/lulu-beauty` as `deploy` anyway — `sudo -u deploy -H git …`.
Otherwise `.git` ends up with root-owned objects, and the next run of
`deploy/release.sh` as `deploy` fails on permissions at the worst possible
moment.

**Changing the frontend's public variables** (`NEXT_PUBLIC_*` — domain, bot
username, the login-widget flag): Next bakes them into the bundle **at build
time**, so a restart isn't enough — it takes a rebuild:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build website
```

**Stopping and tearing down:**

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml stop      # stop
docker compose --env-file .env.prod -f docker-compose.prod.yml down      # remove containers
```

⚠️ `down -v` also deletes the volumes — that's the database, the photos and the
certificates in one go. That flag is never needed here.

The `next_cache` volume (`/app/apps/website/.next/cache`) is the exception:
deleting it loses nothing, it only makes the first visitors pay again for page
generation and photo re-encoding. It exists so that doesn't happen after every
redeploy: the site image is built **without** access to the API (by design), so
it contains no pre-rendered pages at all.

**Disk.** Releases clean up after themselves (see "Releases"), so this is a check
rather than a chore — but the volumes and the database grow on their own, and the
server has no monitor for space:

```bash
df -h /             # the whole disk
docker system df    # images, containers, volumes, build cache separately
```

Two things grow without a ceiling: `~/lulu-backups`, which keeps **full** copies
— `KEEP_DAYS` (14) of the database, `KEEP_DAYS_UPLOADS` (4) of the photos — and
the `uploads` volume itself. The multiplier is the thing to remember: with the
four-day window, 700 MB of product photos is some 2.8 GB of local archives and
the same again in R2, where the free tier ends at 10 GB. See "Why the two
windows differ" in Step 9 for what to do when that stops being enough.

**Logs and status:**

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
curl https://your-domain/api/proxy/health   # /health is exposed through Next's proxy
tail -n 50 ~/backup.log                     # the last nightly backup

# CSP violations collected from visitors' browsers (Step 10)
docker compose --env-file .env.prod -f docker-compose.prod.yml logs website | grep csp-violation
```

`/health` does a real `SELECT 1` — `200` means both the API and the database are
alive.

---

## Left out of the MVP

- **Photos in object storage.** Right now `STORAGE_DRIVER=local`, the files are
  on the server's disk, and because of that there must be exactly one `api`
  container. Moving to S3-compatible storage (Cloudflare R2 — free egress)
  removes that constraint and half the work of `deploy/backup.sh` (the `uploads`
  archive would no longer be needed).
- **Error tracking.** Sentry or similar: today an exception on a customer's page
  is visible nowhere, and 500s only in `docker logs`. The external `/health`
  check and the backup success ping already exist, that's Step 10.
- **A staging environment.** The same compose on a second domain/server.
- **CI deployment.** A human starts the deploy on the server
  (`deploy/release.sh`), even if it is one command with checks. GitHub Actions
  runs the tests, keeps `master` closed to direct pushes and tags the release
  (Step 1 under "Releases"), but doesn't deploy:
  that would need a deploy key on the server, and such a runner would have to be
  trusted with production entirely. The next step here isn't "Actions over SSH"
  but building images into a registry, so that production is left with `pull` +
  `up -d`.
- **Promoting the CSP.** In `apps/website/next.config.js` the full policy is
  still `Report-Only`. The reports are already collected in the log (Step 10) —
  what's left is accumulating them on live traffic and switching the policy to
  enforcing.
