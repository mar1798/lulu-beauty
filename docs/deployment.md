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

| File                                   | Purpose                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/api/Dockerfile`                  | Backend image. Build context is `apps/api` itself. Runs `alembic upgrade head` on start                        |
| `apps/api/.dockerignore`               | For the backend context: `.venv`, caches, the local `uploads/`                                                 |
| `apps/website/Dockerfile`              | Frontend image. Build context is the **repository root** (Next compiles `widgets` from source)                 |
| `.dockerignore`                        | For the frontend context, i.e. the whole repo: keeps `.git`, `node_modules`, `.env*` out of the image          |
| `docker-compose.prod.yml`              | The production stack: `db`, `api`, `website`, `caddy` — images come prebuilt from GHCR                         |
| `docker-compose.prod.build.yml`        | Override that builds those two images on the server instead of pulling them (`release.sh --build`)             |
| `deploy/Caddyfile`                     | Routes and automatic TLS                                                                                       |
| `deploy/.env.prod.example`             | Template for every production variable (copied to `.env.prod` at the root)                                     |
| `deploy/backup.sh`                     | Backs up the database and photos, verifies and rotates the archives, uploads via `rclone`, checks free disk, pings the monitor |
| `deploy/restore.sh`                    | Restores from those archives, keeping a safety copy of the current state                                       |
| `deploy/health-watch.sh`               | Checks the site every 5 minutes and pings healthchecks.io (Step 10)                                            |
| `deploy/release.sh`                    | Deploys a release by tag: backup, pull, wait for `healthy`, check `/health`, write the log (see "Releases")    |
| `deploy/watch-release.sh`              | From cron: notices an approved release on GitHub, runs `release.sh`, reports the outcome (see "Releases")      |
| `apps/website/next.config.js`          | `output: 'standalone'`, security headers, the `/files/*` rewrite — nothing to change here                      |
| `.github/scripts/check-migrations.py`  | Reports contracting operations in a release's migrations; used by the guard, runnable by hand                  |
| `.github/workflows/release-tag.yml`    | On a merge into `master`: checks the migrations, tags it, builds both images into GHCR, prunes the old ones    |
| `.github/workflows/release-deploy.yml` | Checks the release, waits for your approval, moves `refs/deploy/current` — the only manual step                |
| `.gitignore`                           | Contains `.env.prod`, so secrets never reach git                                                               |

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
routine: compose, backups, releases. System commands (`apt`, `systemctl`,
`reboot`) are needed rarely but are needed — and the account has no password
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
both TCP and UDP (hence four rules for three ports). The filtering is done by a
**Hetzner Cloud Firewall**, which is configured in the Hetzner console
(Cloud → project → Firewalls) and is already attached to this server:

| Direction | Rules                                                              |
| --------- | ------------------------------------------------------------------ |
| Inbound   | `22/tcp`, `80/tcp`, `443/tcp`, `443/udp` — everything else dropped |
| Outbound  | **left open on purpose**                                           |

`443/udp` is not optional: that's HTTP/3, and without it Caddy silently falls
back to TCP — the site keeps working, so the omission goes unnoticed for months.
Outbound stays open deliberately: restricting it breaks the `rclone` upload to
R2, ACME certificate renewal and the Telegram API in one go.

It filters on Hetzner's network, before a packet ever reaches the machine, and
that is precisely why it is the right layer here: it neither knows nor cares
which process listens on a port, so it also covers **ports published by
Docker** — and those are most of what this server exposes. It costs nothing,
it survives a reinstall of the OS, and it can only be switched off from the
Hetzner account rather than from a root shell on the box.

Its state lives in that console and nowhere else, so **no command run over SSH
will show you whether it is attached or what it allows** — `ss`, `iptables` and
`ufw status` all describe the machine, not the network in front of it. Check it
in the browser.

**There is deliberately no `ufw` on the server**, and the reason is worth
spelling out, because every Ubuntu guide starts with one:

- ufw would not protect `80`/`443`. Docker writes its own rules into
  `DOCKER`/`DOCKER-USER`, evaluated before ufw's chain, so a published container
  port is reachable whatever ufw says. Read that the other way round too:
  **anything added to a `ports:` line is public the moment the container
  starts** — a `5432:5432` added "just for an hour of debugging" is an open
  database, not a local one. The cloud firewall is what catches that; ufw is not.
- The only thing ufw governs is what the host itself listens on, and today
  that's one process — `sshd` on `22`, which has to stay open anyway. So a
  correct ufw ruleset here would block exactly nothing that isn't already
  blocked upstream.

⚠️ **When it becomes worth adding.** ufw's real value is flipping the host's
default from "open" to "closed", and that starts to matter the moment something
runs on the host outside Docker: a metrics exporter, a Redis or Postgres
installed with `apt` for a one-off task, anything from a guide that binds to
`0.0.0.0` by default. Without the cloud firewall such a service is on the
internet within a second of `apt install`; with it, it is merely one console
mistake away. If that day comes — or if the server ever moves to a provider
with no network-level firewall — add ufw as the second layer:

```bash
sudo ufw allow OpenSSH     # first, always: `ufw enable` below cuts the session without it
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status            # expect: active, and exactly those four rules
```

The two are complements rather than alternatives: the cloud firewall doesn't
know about loopback or the internal interfaces, ufw doesn't know about Docker.

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

**GHCR.** The `api` and `website` images are built by CI and pulled from GitHub's
registry (see "Releases"). **Both packages are public**, so the server pulls them
with no credentials at all and `docker login ghcr.io` is not part of setting one
up. They are built from a public repository and carry no secrets, so public costs
nothing here.

That visibility is also what keeps them off the billing page, and it is the
reason this project has no package bill to watch: a public package costs neither
storage nor transfer, while a private one is counted against the 500 MB the Free
plan gives — per version, whole, with no credit for the layers two releases
share. Two images of this size reach that in three or four releases, which is
why the first thing done after the first release was to flip both to public
(the checklist under "After the first release").

⚠️ A new package on GHCR is private whatever the repository is. So if the
packages are ever recreated — a rename of the repository or the account, a
deleted package, a second deployment under a different owner — they come back
private and the server stops being able to pull. The fix is to make them public
again; logging in is the workaround while that is being done:

```bash
# as deploy, for the same reason as above
docker login ghcr.io -u <github-account>    # at the prompt, paste a token
```

The token is a classic PAT with **`read:packages`** and nothing else. Same
reasoning as with Docker Hub: `~/.docker/config.json` stores whatever is entered
in base64, which is encoding and not encryption, so what sits there should be a
key that can only read images and can be revoked on its own.

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

| Variable                                                  | Value                                                  |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `SITE_DOMAIN`                                             | `your-domain` (without `https://`)                     |
| `ACME_EMAIL`                                              | your email — Let's Encrypt sends expiry warnings there |
| `POSTGRES_PASSWORD`                                       | the generated password                                 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                 | the generated secrets                                  |
| `CORS_ORIGIN`, `WEBSITE_BASE_URL`, `TELEGRAM_WEBHOOK_URL` | `https://your-domain`                                  |
| `PUBLIC_FILES_BASE_URL`                                   | `https://your-domain/files`                            |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`             | from BotFather (username without `@`)                  |
| `TELEGRAM_WEBHOOK_SECRET`                                 | the generated secret                                   |
| `OWNER_PHONE`, `OWNER_NAME`                               | the shop owner's phone and name                        |

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

Every later deploy pulls images built by CI (see "Releases"), but on a fresh
server there is no release to pull yet — so the first start builds them here,
through the override, with a throwaway name for the tag:

```bash
RELEASE_TAG=bootstrap docker compose --env-file .env.prod \
  -f docker-compose.prod.yml -f docker-compose.prod.build.yml up -d --build
```

The first build takes a few minutes. From the first real release onwards the
command is `./deploy/release.sh`, which rewrites `RELEASE_TAG` in `.env.prod`
itself. Then:

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

The script creates a SUPER_ADMIN row for the number in `OWNER_PHONE` — the head
owner, who is the only account that can grant and revoke `ADMIN` in the panel and
whose own role nothing can change. There is no password — signing in happens only
through Telegram, so the owner then has to open the bot **from that exact number**
and share their contact: only then does the Telegram account bind to the admin row
that was created.

Re-running the script is safe and idempotent, and it is the only way the role is
ever assigned: on a shop that predates the role it promotes the existing owner, and
it is also the way back in should the head owner's number ever change.

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
- [ ] the Hetzner Cloud Firewall is attached and allows exactly `22/tcp`, `80/tcp`,
      `443/tcp`, `443/udp` (Step 1 — check it in the console: nothing in the running
      stack depends on it, so a missing firewall shows up nowhere on the server)
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

| Variable            | Default                        | Purpose                                                         |
| ------------------- | ------------------------------ | --------------------------------------------------------------- |
| `BACKUP_DIR`        | `$HOME/lulu-backups`           | where to put the archives                                       |
| `KEEP_DAYS`         | `14`                           | how long to keep the database dumps (locally and on the remote) |
| `KEEP_DAYS_UPLOADS` | `4`                            | how long to keep the photo archives, same two places            |
| `BACKUP_REMOTE`     | `BACKUP_REMOTE` in `.env.prod` | rclone remote to upload to, e.g. `r2:lulu-backups`              |
| `ENV_FILE`          | `<root>/.env.prod`             | where compose reads variables from                              |
| `BACKUP_PING_URL`   | empty                          | monitoring ping address (Step 10)                               |
| `DISK_WARN_PERCENT` | `80`                           | how full the disk may get before the run reports a failure (in the cron line, Step 10) |

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

**How far away that day is, in photographs.** Every upload is re-encoded to WebP
by `compress_image` before it is stored, which puts a product photo at roughly
500 KB; `uploads-*.tar.gz` is gzip over WebP and gains essentially nothing, so a
photo costs its own 500 KB in the volume and in each of the four archives. The
free 10 GB of R2 therefore ends at about **5 000 photographs** — some 1 600
products at three photos each — and the same figure is 2.5 GB in the `uploads`
volume. That is the number to watch, and it is far enough away that nothing here
needs changing for it yet.

The day the photos do outgrow this shape, the fix isn't a smaller window but a
different one: `rclone sync` of the volume instead of a nightly tar, with
`--backup-dir` so a deletion is moved aside rather than repeated. That stores one
copy instead of four and lifts the ceiling to the full 10 GB — at the price of
rewriting the photo half of `restore.sh`, which is why it isn't done yet. The
four-day window is what buys the delay: at fourteen, the same ceiling would
arrive at 1 400 photographs instead.

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
happening goes unnoticed. `DISK_WARN_PERCENT` lives in the same line for the same
reason — the disk check belongs to the nightly run, and the backup
`deploy/release.sh` takes has no use for it. Neither is read from `.env.prod`.

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

Four things you'd otherwise learn about last: the site is down, the nightly
backup didn't run, an approved release never reached the server, the CSP policy
is breaking a page for a visitor. Everything that could be done inside the
repository is done; what's left is signing up for the external services and
putting the check addresses into cron.

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

`DISK_WARN_PERCENT` goes on that same line when the default 80 doesn't suit —
`DISK_WARN_PERCENT=90 BACKUP_PING_URL=… …/backup.sh`. It is read from the
environment only, so `.env.prod` is not the place for it. `BACKUP_REMOTE`, by
contrast, does belong in `.env.prod` (see Step 9): the release-time backup has
to upload too.

The value here is precisely the **silence**: the email also arrives when the
backup didn't run at all — the server is off, cron is broken, the disk is full.
The ping itself can't fail the backup: three attempts, ten seconds each, and an
unreachable monitor is only a warning in the log.

**One `/fail` does not mean the backup failed.** The same run also checks free
space — on the filesystem holding `BACKUP_DIR` and the one holding
`/var/lib/docker`, which on this server are one and the same — and past
`DISK_WARN_PERCENT` (80) it pings `/fail` although the archives were written and
verified. That is deliberate: the backup is the only job here that runs nightly
and already has a way to reach a person, and a full disk is the one failure on
this machine that nothing else would report. It does not announce itself
gradually — Postgres shares the disk with the photos, the images and these
archives, and the usual way to discover it is a release dying in `docker pull`.

The log tail in the email says which it was: a disk alert starts with `DISK:`
and carries the `df` line and a list of what grows (`~/lulu-backups`, the
`uploads` volume, old images), while a genuine failure ends at the step that
broke. `DISK_WARN_PERCENT=0` turns the check off.

### A failed deploy — a ping

Since the server deploys by itself (see "Releases"), nobody is watching the
output at the moment it goes wrong. And a deploy that fails is **invisible from
every other direction**: GitHub records the release as approved and moves on,
the previous version keeps running and answering, so the two checks above see a
perfectly healthy site. The release simply never went live, and the only trace
is a line in a log on a server nobody has a reason to open.

So `deploy/watch-release.sh` reports the same way the backup does — a plain ping
to `DEPLOY_PING_URL` on success, `$DEPLOY_PING_URL/fail` on failure, with the
last 30 lines of `~/release-watch.log` as the body. That body is the point: it
carries the actual reason — the images weren't in the registry, a container
never went healthy, the external `/health` check failed after the switch — so
the email answers the question it raises instead of starting an ssh session.

```
* * * * * DEPLOY_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/watch-release.sh
```

⚠️ Unlike the backup check, this one is **not** on a schedule: create it with
the period turned off (in healthchecks.io terms, a period longer than any gap
between releases — a year does), because releases happen when they happen.
Silence here means nothing was released, not that something broke; the alert is
the explicit `/fail`. That is also why success is pinged at all — it puts the
release on the monitor's timeline next to the failures, and it turns the check
green again after one.

Left unset, the variable disables the ping entirely and the script is as silent
as before. It is the one thing in this whole chain that tells you the deploy you
approved didn't happen, so set it.

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
feature/* ──► development ──(PR)──► master ──► guard ──► tag ──► images ──► ⏸ approve ──► ref ──► server
                                              └──────── by itself ────────┘   you    └── by itself ──┘
```

Everything that needs no decision happens on its own; the one manual step is the
approval, and by the time it is asked for the release is already built and
waiting. Nothing in this chain can reach the server: GitHub moves a ref, the
server watches it. There is no deploy key on GitHub and no production secret
either.

**1. Merge.** A PR `development → master`, a **merge commit** (not a squash: a
history of meaningful commits is the point here). That is the whole manual part
of preparing a release.

**2. What happens by itself** — `.github/workflows/release-tag.yml`, one run:

- **The migration guard**, first of all — before the tag exists. Every migration
  the release adds or changes goes through
  `.github/scripts/check-migrations.py`, which parses the file and looks inside
  `upgrade()` for `op.drop_column`, `op.drop_table`, `op.drop_constraint`,
  `op.rename_table`, and for an `op.alter_column` that renames or sets
  `NOT NULL`. A hit fails the run before anything is named or built — the
  rollback rule below is easier to keep when it is checked than when it is
  remembered.

  It runs first so that a refusal costs nothing: the release is then simply not
  a release. No tag was pushed, no image exists, and `master` is left exactly as
  the merge made it — which means the baseline has not moved either, so the next
  release is measured from the same previous tag and the same migrations are
  reported again rather than sliding behind a name that was spent on something
  nobody can deploy.

  Contracting is read as "the previous release stops working against this
  schema", which is wider than dropping things, so three more are flagged:
  `op.add_column` with `nullable=False` and no `server_default` (the old code
  inserts rows without that column and the database refuses them — the expanding
  way to add a required field is two releases, nullable now and `NOT NULL` once
  the old code is gone), `op.create_unique_constraint`, and `op.create_index`
  with `unique=True` (the old code writes rows that collide). All three are
  allowed on a table the same migration creates: a rule on data that did not
  exist a minute ago constrains nobody.

  `op.execute` is read as SQL rather than trusted or blanket-refused: the
  migrations here use it for `CREATE EXTENSION`, `ALTER TYPE … ADD VALUE` and
  plain `UPDATE`s, so failing on every one of them would only teach everyone to
  ignore the job — but a `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT`,
  `DROP TYPE`, `RENAME` or `SET NOT NULL` inside the string fails it. An
  argument the script can't read as text (a name built elsewhere) is reported as
  exactly that and fails too; "I could not tell" must not come out as "expanding
  only". `op.drop_index` is deliberately allowed: the previous release still
  runs without an index, only slower, and a unique one is a constraint.

  The exit codes say the three things apart — `0` nothing, `1` something
  contracting, `2` a file that would not parse — so a broken migration fails the
  guard instead of passing it on an empty result.

  Parsed rather than grepped, because a grep would be useless here: every
  autogenerated migration mirrors itself in `downgrade()`, so searching the diff
  for `drop_table` flags the very migration that _creates_ the table. Widening a
  type or making a column nullable is expanding and passes. The script is checked
  by `ruff` and `mypy --strict` and has its own tests
  (`.github/scripts/test_check_migrations.py`), run by the `API` job — a guard
  whose failure mode is a restore from backup is not a place for unchecked code.

  This is not the first time a release hears about it: the same script runs on
  every push to `development` (the `API` job again), where it **warns** and
  annotates the offending line. There it cannot fail the branch, because the
  `[contracting]` marker lives in a merge commit that does not exist yet — so the
  answer is given here, and the notice comes one merge earlier. The script takes
  file paths, so it also runs by hand before the release PR:

  ```bash
  python3 .github/scripts/check-migrations.py $(
    git diff --name-only --diff-filter=AM origin/master...HEAD \
      -- apps/api/migrations/versions
  )
  ```

  The escape hatch is a `[contracting]` marker in the merge commit message,
  deliberately in the history rather than in a flag on the workflow: the next
  rollback is where it will be read.

  ⚠️ Which means it is written **when the merge is made**, not afterwards — the
  merge commit is on `master` by the time the guard speaks, and `master` is not
  rewritten. Re-running the job cannot help, and that is what the warning on
  `development` is for: the question is asked one merge earlier, where it can
  still be answered. If the guard does fail, there are two ways on — take the
  migration back out on `development` and merge again, which is the right answer
  unless the drop genuinely cannot wait a release, or merge again with the
  marker.

  Neither is urgent, which is the point of the guard running before the tag: the
  refused merge left nothing behind to clean up, and the finding comes back on
  every release until it is dealt with.

- **The tag**, once the guard is satisfied. Every merge into master is a
  release, and the name of one shouldn't depend on somebody remembering to type
  it. `vYYYY.MM.DD` rather than semver: nothing is published as a package, and
  the versions in `package.json` and `pyproject.toml` have nothing to do with
  what is deployed. Two releases in one day — `v2026.09.14.2`, counted up from
  the tags that already exist. The date is taken in `Asia/Bishkek`, not UTC: it
  is a date a human reads, and a merge at 03:00 local would otherwise be stamped
  with the previous day. The tag is annotated, and its message lists the commits
  since the previous one — the same range the guard just checked — so
  `git show <tag>` on the server answers "what is in this release" without
  reaching for the network. Re-running the workflow on an already tagged commit
  doesn't invent a second name for the same release — it adopts the one that is
  there and carries on, re-checking the migrations and building the images again
  under it. That is what finishes a release whose build failed on something
  passing: a tag can't be pushed twice and a merge commit can't be re-made, so a
  re-run that skipped everything would leave that release impossible to complete.
  Nothing is asked of you twice either: the approval below is skipped when the
  release is already the approved one.
- **The images.** `api` and `website` are built and pushed to
  `ghcr.io/<owner>/lulu-beauty/{api,website}:<tag>`. This is the part that used
  to happen on the server, on two vCPUs, during the deploy.

  The website image is tied to its domain: `NEXT_PUBLIC_*` and the `/files/*`
  rewrite are baked in by `next build` (see `apps/website/Dockerfile`). Those
  values come from **repository variables** — `SITE_DOMAIN`,
  `TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` — not from
  secrets: every one of them ships inside the client bundle anyway, and a secret
  would only hide them from the person who has to check them. They must agree
  with `.env.prod` on the server; where they disagree, the built bundle is what
  the browser gets.

  Which is why the build also writes those values onto the image as labels
  (`sululu.build.*`, at the end of `apps/website/Dockerfile`). Nothing else can
  read them back: they were compiled into minified JavaScript, they are not in
  the container's environment, and the only honest way to ask what a finished
  image points at is to ask the image. `deploy/release.sh` does, on every
  deploy — step 4 below.

  The first two are required and an empty one fails the build, because an empty
  one ships a bundle pointing at `https://` and the first to notice would be a
  customer. The login-widget flag isn't: unset means `false` (the default in
  `apps/website/Dockerfile` and [environment.md](environment.md)), and `false`
  is the safe end of that flag — a missing button beats one that renders and
  then refuses to authorize.

- **The old images.** The last twenty versions of each package are kept and the
  rest are deleted (`Prune old images`). Nothing else removes them: the server
  prunes its own disk on every deploy, but each release adds two versions to the
  registry and they stay for good. Twenty and not five, because a deleted
  version cannot be pulled back — an old release with no image isn't a slow
  rollback but an impossible one — and because the server keeps its local copies
  for a week anyway, so a rollback inside that week never reaches the registry.
  A failure here never fails the release: by then the images are pushed and the
  approval is waiting.

All of it is one workflow rather than a chain, and that is not tidiness: a tag
pushed with the default `GITHUB_TOKEN` **does not trigger** other workflows —
GitHub prevents the recursion deliberately — so anything keyed on `on: push:
tags:` would simply never run, and its absence would be silent. Inside a single
run `needs:` has no such limit.

**3. Approve** — `.github/workflows/release-deploy.yml`. Two jobs, and the
split is the point. `Check the release` has no environment, so it runs _before_
the gate: it resolves which tag this run is about and verifies that both images
are really in the registry. Only then does `Deploy` sit down on the `production`
environment, which has you as a required reviewer — the run pauses, and GitHub
announces it by itself: email, and a push in GitHub Mobile. Approving moves one
ref, `refs/deploy/current`, to the release commit.

Everything that can refuse a release is therefore on the near side of the
approval. A question answered after it is a question asked too late: the owner
has already decided, and the failure then reads as the deploy breaking rather
than the release never having been deployable. A migration the guard refused
never gets this far — it was stopped before the tag, so there is no release to
approve; what the registry check catches here is a build that failed on its own,
a timeout or a broken Dockerfile, where the name exists and nothing else can
tell it apart from a release that is ready.

A run that has nothing to do doesn't ask at all: `Release tag` runs again for a
commit that is already tagged — a re-run, or a merge of something already
released — and builds that same release again under the same name;
`refs/deploy/current` already pointing at that commit is how this workflow
knows. Approving it would ask the owner to decide about a release that
is already live, which is how a person learns to click through the one prompt
that is supposed to mean something. A **Run workflow** with a tag named by hand
is never skipped this way — re-deploying what is already approved is exactly
what that button is for.

A custom ref and not a branch, on purpose: it is a machine pointer, not
somewhere to commit or to open a pull request from. To see what is approved:

```bash
git ls-remote origin refs/deploy/current
```

The same workflow also takes a manual run (**Actions → Release deploy → Run
workflow**) with a tag — that is how a rollback is approved, and how a release
is deployed again after the server has been rebuilt.

⚠️ A pending approval **expires after 30 days** and the run then fails. Re-run
it, or dispatch the workflow by hand with the tag.

Two releases merged in a row queue rather than race: a run waiting on the
approval holds the `release-deploy` concurrency group, so the second one stays
pending until the first is approved or rejected — which is also the order they
would have to go live in. A **third** merge while two are still outstanding
cancels the pending middle one; that is GitHub's rule for the group, not a
choice made here. Nothing is lost by it — the newest release contains the
commits of the one that was dropped — but it does mean the tag that goes live
skips a name, and `~/releases.log` on the server is where that shows.

**4. The server picks it up.** `deploy/watch-release.sh` runs from cron every
minute, fetches that ref, and on a change runs `deploy/release.sh <tag> --yes`.
The script checks that the working tree is clean, lists the commits between what
is deployed and what's coming, warns about migrations, takes a backup, **pulls** the two
images, does a `checkout --detach` onto the tag, starts the stack, writes the
tag into `.env.prod` as `RELEASE_TAG`, waits for `db`, `api` and
`website` to be `healthy`, hits `https://<domain>/api/proxy/health` from outside,
drops unused images older than a week, and appends a line to `~/releases.log`. On
failure it prints a ready-made rollback command. Flags: `--yes`, `--no-backup`,
`--no-wait`, `--no-prune`, `--build`.

The pull comes before the checkout on purpose: the images depend on the tag and
not on what is checked out, so a release that never reached the registry leaves
the server exactly as it was. For the same reason it pulls the two names
directly rather than through compose — at that moment the compose file on disk
is still the previous release's, and a release that renamed a service would have
it pull the wrong thing.

Between the pull and the start it checks that the website image was built for
**this** server: the `sululu.build.*` labels carry the domain and the bot name
the bundle was compiled with, and they are compared against `SITE_DOMAIN` and
`TELEGRAM_BOT_USERNAME` in `.env.prod`. A mismatch is a refusal, not a warning —
a bundle calling an API on the wrong domain is a broken site, and the only
moment it can still be stopped cheaply is this one, with the images on the disk
and the previous release still serving. The login-widget flag is only a warning:
on this path nothing reads it from `.env.prod` anyway. An image built before
these labels existed — a rollback to an older release — skips the check rather
than failing it: that release ran in production, and labels are all it lacks.

`RELEASE_TAG` goes into `.env.prod` only once the stack is up, for a related
reason: until then the file still names the release the containers are actually
serving. A deploy that dies on the `pull` therefore leaves `docker compose up
-d`, typed by hand, bringing back what was running — rather than starting the
release that has just failed. Compose gets the new tag from the environment
meanwhile, so the start itself doesn't wait on the file.

Whichever way it ends, the watcher pings monitoring (`DEPLOY_PING_URL`, Step
10). That ping is the only thing that says an approved release didn't arrive:
GitHub has already recorded it as approved, and a deploy that failed left the
previous version running and healthy, so nothing else will notice.

Nothing is built on the server any more, so a deploy is a download and a
restart — under a minute — and `--build`, through
`docker-compose.prod.build.yml`, is the fallback for when the registry is
unreachable or a fix isn't in a tag yet.

The cleanup is there because nothing else does it: every release leaves two
images behind, and on a 40 GB disk a few dozen of them outgrow the volumes and
the database put together — then the disk runs out during a `pull`, which is to
say during a deploy. It runs after the deploy, never before: the previous
release's images are what make a rollback instant, and they are the first thing
wanted when this one turns out to be broken. The age cut (`PRUNE_OLDER_THAN`,
`168h` by default) is the compromise — a rollback to a release older than that
downloads its images again and takes a minute longer, which is the price of a
disk that doesn't fill up quietly. A failed cleanup is a warning and nothing
more: the release is already running by then.

The detached HEAD on the server is intentional: committing in production isn't
possible. The answer to "what is in production right now" is `git describe
--tags` on the server, `RELEASE_TAG` in `.env.prod`, or `~/releases.log`; what
the watcher did and when is `~/release-watch.log`.

**5. Rollback** — approve the previous tag by hand (**Run workflow** above), or,
if GitHub is the thing that is down, run `./deploy/release.sh <previous tag>` on
the server. It always works, **except for the database schema**: `api` runs
`alembic upgrade head` on every start, and migrations never go back on their own.

⚠️ Hence the release rule the guard enforces: **only expanding migrations in a
single release** — add a nullable column, a table, an index. Dropping a column or
a table, renaming one, adding `NOT NULL` to an existing field — those go in the
next release, once the previous one has lived in production. Then a code rollback
is always safe and needs neither `alembic downgrade` nor a restore from backup. A
release that breaks this rule can only be undone through `deploy/restore.sh`.

A rollback done on the server by hand leaves `refs/deploy/current` where it was,
and the watcher compares against the ref value it last acted on rather than
against the deployed commit — so it stays quiet instead of rolling production
forward again a minute later.

⚠️ Which also means re-approving the _same_ tag on GitHub won't undo that
rollback: the ref never changes value, so the watcher sees nothing new. To go
forward again, deploy it on the server — `./deploy/release.sh <tag>` — or let
the next release carry it. The state file (`~/.release-watch-state`) is the
other way: delete it and the watcher's next run adopts whatever is approved
without deploying it, which is the same first-run behaviour.

**A hotfix** is a branch off `master`, a PR into `master`, then the same chain:
tag, images, approve. Afterwards `master` is merged back into `development`, or
the fix is lost in the next release.

### Setting it up once

On GitHub, in the repository settings:

- **Environments → New environment → `production`**, and under _Deployment
  protection rules_ tick **Required reviewers** and add yourself. This is the
  gate; an environment with no rules — which is what a freshly created one is —
  deploys straight through without asking, so it is worth re-checking after any
  change to repository settings. ⚠️ Protection rules are free on a **public**
  repository (this one) and on GitHub Pro/Team for a private one; should this
  repository ever go private on the Free plan, the gate becomes the manual **Run
  workflow**, which `release-deploy.yml` already supports.
- **Secrets and variables → Actions → Variables**: `SITE_DOMAIN` and
  `TELEGRAM_BOT_USERNAME` (required — a release fails without them), and
  `NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET` if the widget is on (unset is `false`).
  The same values as in `.env.prod`.

On the server, as `deploy`:

```bash
# no `docker login ghcr.io` — both packages are public (Step 1). It is needed
# only if a package is ever recreated, since a new one is private regardless.

# IMAGE_PREFIX in .env.prod, once: ghcr.io/owner/lulu-beauty

# the watcher, every minute (crontab -e). DEPLOY_PING_URL is what reports a
# failed deploy — without it nothing does; Step 10 explains why
* * * * * DEPLOY_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/watch-release.sh
```

Its first run deploys nothing: it records what is currently approved and stops.
Installing a cron job must not, by itself, change what production is running —
on a server deliberately a release or two behind, it otherwise would, silently.

### After the first release

A package on GHCR does not exist until something has pushed it, so these three
cannot be done in advance — and all three are the kind that stay broken quietly.
Once `Release tag` has finished for the first time, at
`github.com/users/<owner>/packages`, for **both** `lulu-beauty/api` and
`lulu-beauty/website`:

- ✅ **Package settings → Change visibility → Public.** Done — both packages are
  public. The server pulls without logging in, and the images are counted
  against neither storage nor transfer on the Free plan (Step 1 explains what
  that costs otherwise). The step stays written down because a recreated package
  comes back private.
- **Package settings → Manage Actions access → add `lulu-beauty` with the `Write`
  role.** ⚠️ A container package belongs to the *account*, not to the repository
  that built it, and `GITHUB_TOKEN` reaches it only through this setting. The
  push works regardless — it authenticates as the actor — but `Prune old images`
  does not, and that job is `continue-on-error: true` on purpose, so it fails
  without turning the release red. Nothing else will mention it.
- **Check that the pruning works**, a couple of releases later and then
  occasionally. The count of versions is the count of releases: the build is
  single-platform and `type=gha` caching lives in the Actions cache rather than
  the registry, so no untagged versions accumulate. Above twenty, therefore,
  means the job is not doing its work:

  ```bash
  gh auth refresh -s read:packages     # once — the default token has no such scope
  gh api "user/packages?package_type=container" \
    --jq '.[] | "\(.name)\t\(.visibility)\t\(.version_count)"'
  ```

### The one release that switches a running server over

⚠️ Only relevant to a server that was deployed before any of this existed, and
only once — but getting it wrong stops a deploy halfway, after the backup and
the checkout.

The release that brings these changes is still deployed by the **old**
`release.sh`, the one already checked out on the server, and that script builds
(`up -d --build`). By the time it runs the command, though, the checkout has
already put the **new** `docker-compose.prod.yml` in place — and that file has no
`build:` at all, only `image: ${IMAGE_PREFIX}/api:${RELEASE_TAG}`. So the build
turns into a pull, which is the intended end state, except that nothing has told
the server where to pull from yet. Both variables are `:?`-required, so compose
stops with a message about variable interpolation rather than about a setup step.

So on the server, **before approving that one release**:

```bash
# the one moment a login IS needed: CI has just created both packages and a new
# package is private, whatever the repository is — they are made public in the
# checklist below, which comes after this release, not before it.
docker login ghcr.io -u <github-account>    # paste a read:packages token

# both lines in .env.prod. RELEASE_TAG is set by hand exactly this once —
# from the next deploy onwards release.sh rewrites it itself.
IMAGE_PREFIX=ghcr.io/owner/lulu-beauty
RELEASE_TAG=<the tag being deployed>
```

Then deploy it the old way — `./deploy/release.sh <tag>` — and everything after
it is the chain above. Install the cron watcher afterwards, not before: until
this release is on the server, `watch-release.sh` isn't there to run.

If the pull fails anyway, the stack is down with the new compose file checked
out, and the way back up is the build override, which by then exists:

```bash
RELEASE_TAG=<the tag> docker compose --env-file .env.prod \
  -f docker-compose.prod.yml -f docker-compose.prod.build.yml up -d --build
```

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
time**, so a restart isn't enough — it takes a rebuild. They live in two places
that have to agree: the repository variables CI builds with, and `.env.prod`
here. Change both, then make a release — the new bundle comes with it. Changing
only one is caught on the next deploy rather than by a customer: `release.sh`
compares the pulled image against `.env.prod` and refuses (step 4 under
"Releases").

Without waiting for a release (the value is wrong right now), build on the
server from what is checked out:

```bash
docker compose --env-file .env.prod \
  -f docker-compose.prod.yml -f docker-compose.prod.build.yml up -d --build website
```

That image lives until the next deploy pulls the CI-built one over it, so the
repository variable has to be fixed too — otherwise the next release quietly
brings the old value back.

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

**Disk.** The nightly backup checks it — past `DISK_WARN_PERCENT` (80) it pings
`<BACKUP_PING_URL>/fail`, so a filling disk arrives as an email rather than as a
failed deploy. Looking by hand:

```bash
df -h /             # the whole disk
docker system df    # images, containers, volumes, build cache separately
```

⚠️ **The photos are not what fills this disk.** The largest consumer is Docker:
two images per release, each a few hundred megabytes, kept for a week by
`release.sh`'s `PRUNE_OLDER_THAN` — so the disk grows with how often you release,
not with how big the catalogue is. After that come `pgdata`, the fourteen
database dumps, and `next_cache`, where the image optimizer stores each photo
re-encoded to AVIF and WebP — lazily, one variant per width actually requested,
so the ceiling is Next's eight default widths and the real figure is below it.
Only `next_cache` may be deleted outright; it costs the next visitors one round
of page generation and nothing else.

Two things grow without a ceiling of their own: `~/lulu-backups`, which keeps
**full** copies — `KEEP_DAYS` (14) of the database, `KEEP_DAYS_UPLOADS` (4) of
the photos — and the `uploads` volume. At about 500 KB a photo, the four-day
window makes a photograph cost 2.5 MB across the volume and the archives
together, and the binding limit is R2's free 10 GB rather than this disk. See
"Why the two windows differ" in Step 9 for where that lands and what to do about
it.

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
  check, the backup ping and the failed-deploy ping already exist, that's
  Step 10.
- **A staging environment.** The same compose on a second domain/server.
- **Deploying without an approval.** The chain stops at one click: a release is
  tagged, checked and built by itself, but a human approves it before the server
  picks it up (see "Releases"). Removing that click would mean auto-merging into
  `master` too, and the release PR is the last place anyone looks at what is
  about to go live — while the rollback is still bounded by the database schema.
  What was deliberately _not_ done to get here: Actions over SSH. The registry is
  what removed the need for it — GitHub moves a ref, the server pulls, and no
  runner is ever trusted with production.
- **Promoting the CSP.** In `apps/website/next.config.js` the full policy is
  still `Report-Only`. The reports are already collected in the log (Step 10) —
  what's left is accumulating them on live traffic and switching the policy to
  enforcing.
