#!/usr/bin/env bash
#
# Restores the Sululu production stack from archives taken by deploy/backup.sh.
# The database and the photos are restored independently — pass both archives
# or just one.
#
#   ./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
#                       ~/lulu-backups/uploads-2026-08-18-0317.tar.gz
#
#   ./deploy/restore.sh --yes ~/lulu-backups/db-2026-08-18-0317.sql.gz
#
# What happens:
#   1. the archives are verified (gzip -t), the plan is printed and confirmed;
#   2. a safety copy of the current state is taken (pre-restore-*) —
#      disabled with --no-safety;
#   3. `website` and `api` are stopped, so nobody writes during the swap;
#   4. the database is recreated (DROP/CREATE) and loaded from the dump;
#   5. the contents of the uploads volume are replaced wholesale, and file
#      ownership is fixed up for the api container's user;
#   6. the services are brought back up.
#
# ⚠️ The operation is destructive: the current database and photos are replaced
# entirely. Restoring "on top" without a DROP is deliberately not done — a
# pg_dump dump contains no DROPs, and loading it into a non-empty database would
# fail on key conflicts, leaving half the old rows and half the new.
#
# Settings come from environment variables:
#
#   BACKUP_DIR   where to put the safety copy  ($HOME/lulu-backups)
#   ENV_FILE     path to .env.prod             (<repository root>/.env.prod)

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/lulu-backups}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

DB_ARCHIVE=''
UPLOADS_ARCHIVE=''
ASSUME_YES=false
SAFETY=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)    ASSUME_YES=true ;;
    --no-safety) SAFETY=false ;;
    -h|--help)   usage 0 ;;
    -*)          die "unknown flag: $1" ;;
    *.sql.gz)    DB_ARCHIVE="$1" ;;
    *.tar.gz)    UPLOADS_ARCHIVE="$1" ;;
    *)           die "unrecognised argument: $1 (expected *.sql.gz and/or *.tar.gz)" ;;
  esac
  shift
done

[[ -n "$DB_ARCHIVE" || -n "$UPLOADS_ARCHIVE" ]] || usage 1
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
command -v docker >/dev/null || die "docker is not installed"

# The archives are verified before anything is stopped: discovering a corrupt
# dump after DROP DATABASE is the worst possible moment for it.
for f in "$DB_ARCHIVE" "$UPLOADS_ARCHIVE"; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || die "archive not found: $f"
  gzip -t "$f" || die "archive is corrupt: $f"
done

echo
echo "Restoring Sululu. The current data will be REPLACED:"
[[ -n "$DB_ARCHIVE" ]]      && echo "  database  ← $DB_ARCHIVE ($(du -h "$DB_ARCHIVE" | cut -f1))"
[[ -n "$UPLOADS_ARCHIVE" ]] && echo "  photos    ← $UPLOADS_ARCHIVE ($(du -h "$UPLOADS_ARCHIVE" | cut -f1))"
$SAFETY && echo "  safety copy of the current state → $BACKUP_DIR/pre-restore-*"
echo

if ! $ASSUME_YES; then
  read -r -p 'Type "restore" to continue: ' answer
  [[ "$answer" == 'restore' ]] || { log "cancelled"; exit 1; }
fi

# The api container's name is needed for the uploads volume as well (--volumes-from
# works even with the container stopped), so it is looked up in advance.
API_CID="$("${COMPOSE[@]}" ps -aq api || true)"
[[ -n "$API_CID" || -z "$UPLOADS_ARCHIVE" ]] || die "the api container does not exist — run up -d first"

log "starting db"
"${COMPOSE[@]}" up -d db
# Wait for the healthcheck: right after start Postgres isn't accepting connections yet.
for _ in $(seq 1 30); do
  "${COMPOSE[@]}" exec -T db pg_isready -q && break
  sleep 2
done
"${COMPOSE[@]}" exec -T db pg_isready -q || die "Postgres is not responding"

# --- Safety copy -------------------------------------------------------------
if $SAFETY; then
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%F-%H%M)"
  log "safety copy of the current state…"
  # shellcheck disable=SC2016  # the container's shell expands these, not ours
  "${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip > "$BACKUP_DIR/pre-restore-db-$STAMP.sql.gz"
  gzip -t "$BACKUP_DIR/pre-restore-db-$STAMP.sql.gz" || die "the safety dump is corrupt"
  if [[ -n "$API_CID" ]]; then
    docker run --rm --volumes-from "$API_CID" alpine \
      tar czf - -C /app/uploads . > "$BACKUP_DIR/pre-restore-uploads-$STAMP.tar.gz"
    gzip -t "$BACKUP_DIR/pre-restore-uploads-$STAMP.tar.gz" || die "the safety archive is corrupt"
  fi
  log "safety copy: $BACKUP_DIR/pre-restore-*-$STAMP.*"
fi

# --- Stop the writers --------------------------------------------------------
# api writes to both stores (the scheduler ticks on its own, without requests),
# and website holds the ISR cache of catalog pages — it is stopped too, so it
# doesn't serve the old pages after the restore.
log "stopping website and api"
"${COMPOSE[@]}" stop website api

# --- Database ----------------------------------------------------------------
if [[ -n "$DB_ARCHIVE" ]]; then
  log "recreating the database and loading the dump…"
  # shellcheck disable=SC2016  # the whole script below runs in the container's shell
  # DROP DATABASE refuses while even one connection is open — we cut the others.
  # Everything runs from the `postgres` maintenance database, or psql would be
  # sawing off the branch it sits on.
  "${COMPOSE[@]}" exec -T db sh -c '
    set -e
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"'"'$POSTGRES_DB'"'"' AND pid <> pg_backend_pid()" >/dev/null
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\""
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
  '
  # shellcheck disable=SC2016
  gunzip -c "$DB_ARCHIVE" | "${COMPOSE[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' >/dev/null
  log "database restored"
fi

# --- Photos ------------------------------------------------------------------
if [[ -n "$UPLOADS_ARCHIVE" ]]; then
  log "replacing the contents of the uploads volume…"
  # The owner is taken from the directory itself and handed back to the
  # extracted files: tar running as root would create root-owned files, and api
  # (the unprivileged apiusr from the Dockerfile) could then not delete a
  # product photo.
  gunzip -c "$UPLOADS_ARCHIVE" | docker run --rm -i --volumes-from "$API_CID" alpine sh -c '
    set -e
    owner=$(stat -c "%u:%g" /app/uploads)
    find /app/uploads -mindepth 1 -delete
    tar xf - -C /app/uploads
    chown -R "$owner" /app/uploads
  '
  log "photos restored"
fi

# --- Bring it back up --------------------------------------------------------
log "starting api and website"
"${COMPOSE[@]}" up -d api website

log "done. Check:"
log "  ${COMPOSE[*]} ps"
log "  curl -sf https://<domain>/api/proxy/health"
