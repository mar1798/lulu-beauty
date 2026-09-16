#!/usr/bin/env bash
#
# Deploys a release to production. Run it **on the server**, as `deploy`.
#
#   ./deploy/release.sh              # the latest vYYYY.MM.DD tag from origin
#   ./deploy/release.sh v2026.09.14  # a specific one (rollbacks use the same command)
#
# Usually nobody runs it by hand: deploy/watch-release.sh calls it from cron
# once a release has been approved on GitHub ("Releases" in docs/deployment.md).
# By hand is for rollbacks and for the days GitHub is down.
#
# Why a tag and not `git pull`: a branch answers "what is there right now", but
# what gets deployed should have a name. After the checkout the repository on
# the server stays in detached HEAD — not an accident but a safeguard:
# committing in production is then physically impossible.
#
# The images are not built here: CI builds `api` and `website` on the tag and
# pushes them to GHCR, so a deploy is a `pull` and a restart — under a minute,
# and a rollback to a recent release is just as quick because its images are
# still on the disk. The tag being deployed is written into .env.prod as
# RELEASE_TAG, which is where compose reads it from; that way an ad-hoc `docker
# compose ps` in any shell describes the release that is actually running.
#
# Because the website bundle is compiled elsewhere, the pulled image is checked
# against .env.prod before anything starts: the domain and the bot name are
# baked in by CI from the repository variables, and nothing else would notice
# them drifting apart from the ones this server serves and certifies.
#
# Flags:
#
#   --yes        don't ask for confirmation (for non-interactive runs)
#   --no-backup  skip the backup before deploying
#   --no-wait    don't wait for healthy and don't check /health (just start)
#   --no-prune   keep the old images this release would otherwise clean up
#   --build      build the images here instead of pulling them, through
#                docker-compose.prod.build.yml — for when the registry is
#                unreachable or the fix isn't in a tag yet
#
# Settings come from environment variables (defaults in brackets):
#
#   ENV_FILE          path to .env.prod              (<repository root>/.env.prod)
#   RELEASE_LOG       log of deployments             ($HOME/releases.log)
#   WAIT_SECONDS      how long to wait for healthy   (240)
#   PRUNE_OLDER_THAN  age of unused images to drop   (168h)
#
# ⚠️ Rolling the code back does **not** roll back the database schema: the `api`
# container runs `alembic upgrade head` on every start, and migrations never go
# back on their own. So a release may only carry an expanding migration (add a
# nullable column, a table, an index); drops and NOT NULL go in the next
# release, once the previous one has lived in production. See "Releases" in
# docs/deployment.md.

set -Eeuo pipefail

# The repository root is two levels above this script, so it can be run from any
# directory.
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"
RELEASE_LOG="${RELEASE_LOG:-$HOME/releases.log}"
WAIT_SECONDS="${WAIT_SECONDS:-240}"
PRUNE_OLDER_THAN="${PRUNE_OLDER_THAN:-168h}"

ASSUME_YES=0
DO_BACKUP=1
DO_WAIT=1
DO_PRUNE=1
DO_BUILD=0
TARGET=""

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --no-wait) DO_WAIT=0 ;;
    --no-prune) DO_PRUNE=0 ;;
    --build) DO_BUILD=1 ;;
    -*) die "unknown flag: $1" ;;
    *) [[ -z "$TARGET" ]] || die "extra argument: $1"; TARGET="$1" ;;
  esac
  shift
done

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
command -v docker >/dev/null || die "docker is not installed"
command -v git >/dev/null || die "git is not installed"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")
if [[ $DO_BUILD -eq 1 ]]; then
  COMPOSE+=(-f "$REPO_ROOT/docker-compose.prod.build.yml")
fi

# A value out of .env.prod, read the way compose reads it: the last assignment
# wins, and one layer of matching quotes comes off — compose unquotes on
# interpolation, so `SITE_DOMAIN="lulu.example"` is the same domain to it as the
# unquoted line, and the checks below have to agree or they refuse a correct
# release over a pair of quotes. An absent key is an empty string, not an error.
env_value() {
  local value
  value="$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1)"

  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  printf '%s' "$value"
}

# Where the images come from. Compose would fail on its own without it, but two
# lines later and with a message about variable interpolation.
IMAGE_PREFIX="${IMAGE_PREFIX:-$(env_value IMAGE_PREFIX)}"
[[ -n "$IMAGE_PREFIX" ]] ||
  die "no IMAGE_PREFIX in $ENV_FILE (e.g. ghcr.io/owner/lulu-beauty — see deploy/.env.prod.example)"

cd "$REPO_ROOT"

# Uncommitted changes in production are always somebody's forgotten debugging.
# A checkout must not wipe them silently: this may be the only copy.
[[ -z "$(git status --porcelain)" ]] ||
  die "the working tree is not clean — deal with the changes on the server before deploying"

log "git fetch…"
git fetch --tags --prune --quiet origin

if [[ -z "$TARGET" ]]; then
  # Sorted by version rather than lexically: v2026.10.01 must outrank
  # v2026.9.30, whatever the strings look like.
  TARGET="$(git tag -l 'v*' --sort=-v:refname | head -n1)"
  [[ -n "$TARGET" ]] || die "no vYYYY.MM.DD tags in the repository — name a ref explicitly"
fi

git rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null ||
  die "ref not found: $TARGET (did the tag reach origin?)"

TARGET_SHA="$(git rev-parse --short "$TARGET^{commit}")"
CURRENT_SHA="$(git rev-parse --short HEAD)"
# How production is currently identified: a tag if there is one, else the hash.
CURRENT_NAME="$(git describe --tags --always HEAD 2>/dev/null || echo "$CURRENT_SHA")"

log "current:   $CURRENT_NAME ($CURRENT_SHA)"
log "deploying: $TARGET ($TARGET_SHA)"

if [[ "$CURRENT_SHA" == "$TARGET_SHA" ]]; then
  log "same commit — restarting in place"
else
  echo
  # The range is deliberately symmetric: on a rollback `CURRENT..TARGET` is
  # empty, and the operator would be shown nothing at all.
  git log --oneline --left-right "$CURRENT_SHA...$TARGET_SHA" | sed 's/^/  /'
  echo

  # Migrations are the one thing that doesn't roll back with the code, so they
  # are called out separately and up front, not afterwards in a container log.
  if git diff --name-only "$CURRENT_SHA" "$TARGET_SHA" -- apps/api/migrations/versions |
    grep -q .; then
    log "WARNING: this release has migrations — the schema changes and won't revert by itself"
  fi
fi

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "Deploy? [y/N] " answer
  [[ "$answer" == [yY] ]] || { log "cancelled"; exit 0; }
fi

if [[ $DO_BACKUP -eq 1 ]]; then
  log "backup before deploying…"
  # A backup must not fail the release silently, but its failure can't be
  # ignored either: most often it means the database is already unreachable.
  "$REPO_ROOT/deploy/backup.sh" || die "the backup failed — not starting the deploy"
fi

# Compose takes RELEASE_TAG from the process environment before .env.prod, so
# everything below starts the right release whatever the file still says.
export RELEASE_TAG="$TARGET"

# What is running, written where compose looks: after this, a `docker compose
# ps` typed by hand months later still names the right release rather than
# whatever was in the file when it was last edited.
#
# Called after `up` and never before it: until then the file still names the
# release that is actually running, and that is the one a `docker compose up -d`
# typed by hand should bring back. Writing it earlier would turn the obvious
# way out of a failed deploy — start the stack again — into starting the broken
# release instead of the one the containers are still serving.
persist_release_tag() {
  if grep -q '^RELEASE_TAG=' "$ENV_FILE"; then
    sed -i "s|^RELEASE_TAG=.*|RELEASE_TAG=$TARGET|" "$ENV_FILE"
  else
    printf 'RELEASE_TAG=%s\n' "$TARGET" >> "$ENV_FILE"
  fi
}

# What the image was built for, from the labels apps/website/Dockerfile puts on
# it. An absent label and an empty one read the same here, and a nil label map
# makes the template print `<no value>`.
image_label() {
  local value
  value="$(docker image inspect --format "{{index .Config.Labels \"$2\"}}" "$1" 2>/dev/null || true)"
  [[ "$value" == "<no value>" ]] && value=""
  printf '%s' "$value"
}

# The frontend's public variables exist in two places that nothing keeps in
# agreement: the repository variables CI builds the bundle from, and .env.prod
# here, which is what Caddy issues the certificate for. They are baked into the
# bundle, so a disagreement cannot be fixed by restarting anything — the browser
# gets whatever was compiled in, and the first to notice is a customer whose
# page calls an API on the wrong domain.
#
# Hence this, between the pull and the start: the images are on the disk, the
# stack is still the previous release, and refusing here costs nothing.
verify_image_matches_env() {
  local image="$IMAGE_PREFIX/website:$TARGET"
  local built_url built_bot built_widget
  built_url="$(image_label "$image" sululu.build.site-url)"

  # An image from before these labels existed — a rollback to an older release.
  # Not a reason to refuse: that release ran in production, and the labels are
  # the only thing it is missing.
  if [[ -z "$built_url" ]]; then
    log "note: $TARGET was built without the build labels — skipping the check"
    return 0
  fi

  local domain expected
  domain="$(env_value SITE_DOMAIN)"
  expected="https://$domain"
  [[ "$built_url" == "$expected" ]] ||
    die "the image is built for $built_url, and $ENV_FILE says $expected — fix SITE_DOMAIN in the repository variables and release again ('Releases' in docs/deployment.md)"

  built_bot="$(image_label "$image" sululu.build.telegram-bot-username)"
  local bot
  bot="$(env_value TELEGRAM_BOT_USERNAME)"
  # Not cosmetic: the sign-in link is built from the name in the bundle, so a
  # stale one sends customers to a bot that knows nothing about this site while
  # the API waits for updates from another.
  [[ "$built_bot" == "$bot" ]] ||
    die "the image is built for the bot @$built_bot, and $ENV_FILE says @$bot — fix TELEGRAM_BOT_USERNAME in the repository variables and release again"

  # A warning and no more. On this path nothing reads the flag from .env.prod
  # (it only reaches a `--build`), so the two disagreeing is confusing rather
  # than broken — and the bundle is right either way.
  built_widget="$(image_label "$image" sululu.build.telegram-login-widget)"
  local widget
  widget="$(env_value NEXT_PUBLIC_TELEGRAM_LOGIN_WIDGET)"
  [[ -n "$widget" ]] || widget=false
  [[ "$built_widget" == "$widget" ]] ||
    log "warning: the login widget is $built_widget in the image and $widget in $ENV_FILE — the image wins; see docs/environment.md"
}

if [[ $DO_BUILD -eq 1 ]]; then
  log "checkout $TARGET"
  git checkout --detach --quiet "$TARGET"

  log "building here (--build) and starting…"
  "${COMPOSE[@]}" up -d --build
else
  # Before the checkout, deliberately: the images depend on the tag and not on
  # what is checked out, so a release that never reached the registry leaves
  # this server exactly as it was.
  #
  # By name and not through compose, for the same reason: at this point the
  # checked-out compose file is still the *previous* release's, and a release
  # that renames a service or changes where the images come from would have it
  # pull the wrong thing — quietly, because the right thing would then be
  # pulled by `up` a minute later and the only trace would be the time it took.
  # These two names are what the new compose file resolves to, and the tag is
  # what makes them specific.
  #
  # The failures here are the ones that aren't about this server: the release
  # wasn't built, the approval named a tag CI never saw, or this machine was
  # never logged in to the registry. All three read the same from `pull` alone.
  for image in api website; do
    log "pulling $IMAGE_PREFIX/$image:$TARGET…"
    docker pull --quiet "$IMAGE_PREFIX/$image:$TARGET" >/dev/null ||
      die "could not pull $IMAGE_PREFIX/$image:$TARGET — is $TARGET built, and is this server logged in to the registry (docker login ghcr.io)?"
  done

  # Only on this path: with --build the bundle is compiled from this very file a
  # moment from now, so there is nothing for it to disagree with.
  verify_image_matches_env

  log "checkout $TARGET"
  git checkout --detach --quiet "$TARGET"

  log "starting…"
  "${COMPOSE[@]}" up -d
fi

# The stack is up on the new images, so the file may now say so. A failure
# further down (never healthy, /health refusing) doesn't take this back: the new
# release *is* what is running by then, and the rollback below names the old one
# explicitly, which rewrites this line again.
persist_release_tag

# --- Verification ------------------------------------------------------------
# The rollback is printed in advance: whoever reads this output at three in the
# morning shouldn't have to recall what was running before.
rollback_hint() {
  log "rollback: ./deploy/release.sh $CURRENT_NAME --no-backup"
  [[ "$CURRENT_SHA" == "$TARGET_SHA" ]] ||
    log "         (migrations, if this release had any, won't revert by themselves)"
}

# Every release leaves two images behind and nothing removes them: on a 40 GB
# disk a few dozen releases outgrow the volumes and the database put together,
# and the disk runs out during a `pull` — which is to say during a deploy.
#
# Always after the deploy, never before it: the previous release's images are
# what make a rollback instant, and they are the first thing wanted when this
# one turns out to be broken. The age cut is the compromise — a rollback to a
# release older than PRUNE_OLDER_THAN downloads its images again and takes a
# minute longer, which is worth a disk that doesn't fill up quietly.
#
# `--all` rather than dangling only: an old release's image is tagged, not
# dangling, and tagged is exactly what it stays until something removes it.
# Images in use by a running container are never touched, so `postgres` and
# `caddy` survive whatever their age.
#
# A failure here is reported and no more. By this point the release is already
# running, and housekeeping is no reason to exit non-zero.
prune_old_images() {
  [[ $DO_PRUNE -eq 1 ]] || return 0

  log "cleaning up unused images older than $PRUNE_OLDER_THAN…"
  docker image prune --force --all --filter "until=$PRUNE_OLDER_THAN" 2>&1 |
    tail -n1 | sed 's/^/  /' ||
    log "warning: could not clean up images — check the disk with docker system df"

  # Only --build leaves build cache on this machine; in the normal path there
  # is none, and the command is a no-op that costs a second.
  [[ $DO_BUILD -eq 1 ]] || return 0
  log "cleaning up build cache older than $PRUNE_OLDER_THAN…"
  docker builder prune --force --filter "until=$PRUNE_OLDER_THAN" 2>&1 |
    tail -n1 | sed 's/^/  /' ||
    log "warning: could not clean the build cache — check the disk with docker system df"
}

if [[ $DO_WAIT -eq 0 ]]; then
  prune_old_images
  log "verification skipped (--no-wait); deployed: $TARGET ($TARGET_SHA)"
  exit 0
fi

# We wait for compose's healthchecks rather than for "the container started":
# `api`'s healthcheck runs a real SELECT 1, `website`'s requests the root page.
# `caddy` has no healthcheck; the external request below covers it.
log "waiting for healthy (up to ${WAIT_SECONDS}s)…"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
while :; do
  unhealthy=""
  for service in db api website; do
    cid="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    if [[ -z "$cid" ]]; then
      unhealthy="$unhealthy $service(no container)"
      continue
    fi
    state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
    [[ "$state" == "healthy" ]] || unhealthy="$unhealthy $service($state)"
  done

  [[ -n "$unhealthy" ]] || break

  if [[ $(date +%s) -ge $deadline ]]; then
    log "gave up waiting for:$unhealthy"
    log "logs: docker compose --env-file $ENV_FILE -f docker-compose.prod.yml logs --tail=50 api website"
    rollback_hint
    exit 1
  fi

  sleep 5
done
log "containers healthy"

# The external check: the same chain a customer travels (Caddy → Next → API →
# database), at the same address deploy/health-watch.sh polls.
SITE_DOMAIN="${SITE_DOMAIN:-$(sed -n 's/^SITE_DOMAIN=//p' "$ENV_FILE" | tail -n1)}"
if [[ -z "$SITE_DOMAIN" ]]; then
  log "warning: no SITE_DOMAIN in $ENV_FILE — the external check was skipped"
else
  HEALTH_URL="https://$SITE_DOMAIN/api/proxy/health"
  log "checking $HEALTH_URL"

  ok=0
  for attempt in 1 2 3; do
    body="$(curl -sS -m 15 "$HEALTH_URL" 2>&1)" || body="network: $body"
    if printf '%s' "$body" | grep -q '"database":{"status":"up"}'; then
      ok=1
      break
    fi
    [[ $attempt -eq 3 ]] || sleep 5
  done

  if [[ $ok -eq 0 ]]; then
    log "unexpected answer: $(printf '%s' "$body" | tr '\n' ' ')"
    rollback_hint
    exit 1
  fi
fi

prune_old_images

# The deployment log. The answer to "what did we deploy, and when" that survives
# a `git checkout` and doesn't need the registry to be reachable.
printf '%s  %s  %s  (was %s)\n' "$(date '+%F %T')" "$TARGET" "$TARGET_SHA" "$CURRENT_NAME" \
  >> "$RELEASE_LOG"

log "done: $TARGET ($TARGET_SHA), recorded in $RELEASE_LOG"
