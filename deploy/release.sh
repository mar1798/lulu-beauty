#!/usr/bin/env bash
#
# Deploys a release to production. Run it **on the server**, as `deploy`.
#
#   ./deploy/release.sh              # the latest vYYYY.MM.DD tag from origin
#   ./deploy/release.sh v2026.09.14  # a specific one (rollbacks use the same command)
#
# Why a tag and not `git pull`: a branch answers "what is there right now", but
# what gets deployed should have a name. After the checkout the repository on
# the server stays in detached HEAD — not an accident but a safeguard:
# committing in production is then physically impossible.
#
# Flags:
#
#   --yes        don't ask for confirmation (for non-interactive runs)
#   --no-backup  skip the backup before deploying
#   --no-wait    don't wait for healthy and don't check /health (just build and start)
#
# Settings come from environment variables (defaults in brackets):
#
#   ENV_FILE      path to .env.prod            (<repository root>/.env.prod)
#   RELEASE_LOG   log of deployments           ($HOME/releases.log)
#   WAIT_SECONDS  how long to wait for healthy (240)
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

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

ASSUME_YES=0
DO_BACKUP=1
DO_WAIT=1
TARGET=""

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --no-wait) DO_WAIT=0 ;;
    -*) die "unknown flag: $1" ;;
    *) [[ -z "$TARGET" ]] || die "extra argument: $1"; TARGET="$1" ;;
  esac
  shift
done

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
command -v docker >/dev/null || die "docker is not installed"
command -v git >/dev/null || die "git is not installed"

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
  log "same commit — rebuilding in place"
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

log "checkout $TARGET"
git checkout --detach --quiet "$TARGET"

log "building and starting…"
"${COMPOSE[@]}" up -d --build

# --- Verification ------------------------------------------------------------
# The rollback is printed in advance: whoever reads this output at three in the
# morning shouldn't have to recall what was running before.
rollback_hint() {
  log "rollback: ./deploy/release.sh $CURRENT_NAME --no-backup"
  [[ "$CURRENT_SHA" == "$TARGET_SHA" ]] ||
    log "         (migrations, if this release had any, won't revert by themselves)"
}

if [[ $DO_WAIT -eq 0 ]]; then
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

# The deployment log. The only answer to "what did we deploy, and when": there
# are no image tags here and no registry.
printf '%s  %s  %s  (was %s)\n' "$(date '+%F %T')" "$TARGET" "$TARGET_SHA" "$CURRENT_NAME" \
  >> "$RELEASE_LOG"

log "done: $TARGET ($TARGET_SHA), recorded in $RELEASE_LOG"
