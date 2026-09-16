#!/usr/bin/env bash
#
# Backs up the Sululu production stack: the database (pg_dump) and the product
# photos (the `uploads` volume). State lives in those two places only — losing
# the second one leaves product_images rows in the database pointing at nothing.
#
# Manual run:
#
#   ./deploy/backup.sh
#
# Daily, from cron (as `deploy`, `crontab -e`):
#
#   17 3 * * * /home/deploy/lulu-beauty/deploy/backup.sh >> /home/deploy/backup.log 2>&1
#
# Settings come from environment variables (defaults in brackets):
#
#   BACKUP_DIR     where to put the archives        ($HOME/lulu-backups)
#   KEEP_DAYS      how long to keep the dumps       (14)
#   KEEP_DAYS_UPLOADS  how long to keep the photos  (4)
#                  Shorter than the dumps on purpose. The database changes all
#                  the time, so fourteen points in it are fourteen different
#                  states worth returning to. The photos do not change at all:
#                  the names are uuids and the bytes behind one never change
#                  (see app/common/static.py), so each nightly archive is
#                  another copy of the same bytes. Fourteen of those cost
#                  fourteen times the catalogue — 700 MB of photos would fill
#                  the free 10 GB of R2 by itself.
#                  Where four lands: an upload is re-encoded to WebP on the way
#                  in (compress_image), so a photo is ~500 KB and costs that
#                  again in each archive — the free 10 GB ends at about 5 000
#                  photographs, 2.5 GB in the volume. Past that, the answer is
#                  `rclone sync --backup-dir` rather than a shorter window; see
#                  "Why the two windows differ" in docs/deployment.md.
#   BACKUP_REMOTE  rclone remote to upload to       (BACKUP_REMOTE in .env.prod)
#                  for example: r2:lulu-backups  or  s3:my-bucket/lulu
#                  Kept in .env.prod rather than in the cron line, so that a
#                  backup taken by deploy/release.sh uploads too — that one is
#                  snapshotting the state we are about to change, and it is the
#                  worst of all to leave on the server alone.
#   ENV_FILE       path to .env.prod                (<repository root>/.env.prod)
#   BACKUP_PING_URL  monitoring ping address        (empty — don't ping)
#                  healthchecks.io and compatible: success goes to <url>,
#                  failure to <url>/fail, along with the last lines of the log.
#                  Without it, a failed nightly backup shows up only in backup.log.
#   DISK_WARN_PERCENT  when to call the disk full     (80)
#                  Checked after the backup, and reported as a *failure* to the
#                  monitor even though the backup itself succeeded — see
#                  "The disk" below. 0 turns the check off.
#                  Read from the environment only, not from .env.prod: like
#                  BACKUP_PING_URL it describes the nightly run rather than the
#                  stack, and release.sh's backup has no use for it. To change
#                  it, put it in the cron line next to BACKUP_PING_URL:
#                    17 3 * * * DISK_WARN_PERCENT=90 BACKUP_PING_URL=… …/backup.sh
#
# ⚠️ A backup sitting on the same server does not survive losing that server.
# Until BACKUP_REMOTE is set, the script says so on every run.
#
# The disk. Nothing else on this server watches free space, and running out of it
# is not a gradual failure: Postgres shares the disk with the photos, the images
# and these archives, and the moment it cannot write, the shop stops taking
# orders. The deploy is the likeliest trigger — `docker pull` wants room for two
# more images — so it breaks during a release, which is also the least convenient
# time to discover it. This script is the one job that already runs every night
# and already has a way to reach a human, so the check lives here: past
# DISK_WARN_PERCENT it pings <BACKUP_PING_URL>/fail with the df output in the
# body. The backup still succeeded; the email is about the next one, and about
# everything else on the machine.
#
# Restoring — deploy/restore.sh (see also "Step 9" in docs/deployment.md):
#
#   ./deploy/restore.sh ~/lulu-backups/db-2026-08-18-0317.sql.gz \
#                       ~/lulu-backups/uploads-2026-08-18-0317.tar.gz
#
# Since the two are kept for different lengths of time, a dump older than
# KEEP_DAYS_UPLOADS has no photo archive of its own date left. Restore it
# against the newest photo archive instead: the files are immutable and only
# ever added, so a later set is the older one plus extras that no restored row
# mentions. What it can be missing are photos deleted between the two dates —
# the owner replacing a product's picture — and those rows then point at
# nothing, exactly as they would after losing the volume.

set -Eeuo pipefail

# The repository root is two levels above this script, so it can be run from any
# directory (including cron, where $PWD is the home directory).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$HOME/lulu-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_DAYS_UPLOADS="${KEEP_DAYS_UPLOADS:-4}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"
BACKUP_PING_URL="${BACKUP_PING_URL:-}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$REPO_ROOT/docker-compose.prod.yml")

# Every line is mirrored into memory so the tail of the log can be sent to the
# monitor: the healthchecks.io email then shows the cause, not just the fact.
LOG_TAIL=""
log() {
  local line
  line="$(printf '%s  %s' "$(date '+%F %T')" "$*")"
  printf '%s\n' "$line"
  LOG_TAIL="$LOG_TAIL$line"$'\n'
}
die() { log "ERROR: $*"; exit 1; }

# The monitoring ping. healthchecks.io protocol: success is a GET/POST to the
# address itself, failure to <address>/fail; the request body becomes the event
# text. The silence here is deliberate: an unreachable monitor must not turn a
# successful backup into a failed one, so a curl error is only noted in the log.
ping_monitor() {
  [[ -n "$BACKUP_PING_URL" ]] || return 0

  if ! command -v curl >/dev/null; then
    log "warning: BACKUP_PING_URL is set, but curl is not installed"
    return 0
  fi

  curl -fsS -m 10 --retry 3 -o /dev/null \
    --data-raw "$(printf '%s' "$LOG_TAIL" | tail -n 20)" \
    "$BACKUP_PING_URL$1" ||
    log "warning: could not send the monitoring ping"
}

# Only runs that actually took a backup are pinged: exiting because the lock was
# held (cron overlapping a manual run) is not an event.
NOTIFY=0

# Set by check_disk. Kept apart from the exit code on purpose: the backup did
# work and its archives are valid, so failing the script would say the wrong
# thing in backup.log and would delete nothing — but the monitor has to go red,
# because a full disk is the one problem here nobody finds out about otherwise.
DISK_ALERT=0

# How full the filesystem behind a path is, as a bare number.
#
# `df -P` is what makes the awk safe: without it a long device name is wrapped
# onto a line of its own and the columns shift. The trailing % is stripped here
# rather than in the comparison, so the caller gets something it can do
# arithmetic with.
disk_usage_percent() { df -P "$1" | awk 'NR==2 { sub(/%$/, "", $5); print $5 }'; }
disk_mount_point()   { df -P "$1" | awk 'NR==2 { print $6 }'; }

# Both places that fill up, which on this server are usually one filesystem:
# the archives, and everything Docker keeps (the pgdata and uploads volumes, the
# images a deploy pulls, the container logs). Deduplicated by mount point, so the
# usual single-disk server is reported once rather than twice.
#
# /var/lib/docker is root-owned and mode 0710, but `df` only needs to statfs it —
# search permission on /var/lib is enough, and `deploy` has that. No sudo.
check_disk() {
  # Spelled out rather than left to `[[ -gt ]]`, which evaluates its operands
  # arithmetically: there a stray `80%` or an empty line in the cron file is 0,
  # and the check would turn itself off without saying so.
  if [[ ! "$DISK_WARN_PERCENT" =~ ^[0-9]+$ ]]; then
    log "warning: DISK_WARN_PERCENT is '$DISK_WARN_PERCENT', not a number — disk check skipped"
    return 0
  fi
  [[ "$DISK_WARN_PERCENT" -gt 0 ]] || return 0

  local path mount used
  local seen=''

  for path in "$BACKUP_DIR" /var/lib/docker; do
    [[ -e "$path" ]] || continue

    mount="$(disk_mount_point "$path" 2>/dev/null || true)"
    [[ -n "$mount" ]] || { log "warning: could not read df for $path"; continue; }
    [[ "$seen" == *"|$mount|"* ]] && continue
    seen="$seen|$mount|"

    used="$(disk_usage_percent "$path" 2>/dev/null || true)"
    [[ "$used" =~ ^[0-9]+$ ]] || { log "warning: could not read df for $path"; continue; }

    if [[ "$used" -ge "$DISK_WARN_PERCENT" ]]; then
      DISK_ALERT=1
      log "DISK: $mount is ${used}% full (threshold ${DISK_WARN_PERCENT}%)"
      # The df line itself goes into the log, and therefore into the alert email:
      # the percentage says there is a problem, the free gigabytes say how long
      # there is to fix it.
      log "      $(df -h "$path" | awk 'NR==2 { printf "%s used of %s, %s free", $3, $2, $4 }')"
    else
      log "disk: $mount is ${used}% full"
    fi
  done

  if [[ $DISK_ALERT -eq 1 ]]; then
    log "      what grows here: $BACKUP_DIR (KEEP_DAYS=$KEEP_DAYS,"
    log "      KEEP_DAYS_UPLOADS=$KEEP_DAYS_UPLOADS), the uploads volume, old images"
    log "      (docker system df; deploy/release.sh prunes those older than a week)"
  fi
}

# Any interruption halfway leaves half-written archives — remove them, so a
# broken file can't pass for a valid backup.
finish() {
  local code=$?

  if [[ $code -ne 0 ]]; then
    # The files may already be gone: an interruption during the upload happens
    # after both archives have been renamed to their final names.
    if [[ -f "${DB_TMP:-}" || -f "${UPLOADS_TMP:-}" ]]; then
      rm -f "${DB_TMP:-}" "${UPLOADS_TMP:-}"
      log "interrupted with code $code, unfinished files removed"
    else
      log "interrupted with code $code"
    fi

    [[ $NOTIFY -eq 1 ]] && ping_monitor /fail
    return 0
  fi

  if [[ $NOTIFY -eq 1 ]]; then
    # The one case where a successful run pings /fail: see DISK_ALERT above.
    if [[ $DISK_ALERT -eq 1 ]]; then ping_monitor /fail; else ping_monitor ''; fi
  fi
  return 0
}
trap finish EXIT

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
command -v docker >/dev/null || die "docker is not installed"

# Resolved only after the file is known to exist: under `set -e` a failing sed
# here would take the whole script down. The environment still wins, so a
# one-off run can redirect the upload without touching .env.prod.
BACKUP_REMOTE="${BACKUP_REMOTE:-$(sed -n 's/^BACKUP_REMOTE=//p' "$ENV_FILE" | tail -n1)}"

mkdir -p "$BACKUP_DIR"

# Two backups at once (cron overlapping a manual run) are pointless: the second
# one simply leaves instead of competing for disk and IO.
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { log "another backup is already running — leaving"; exit 0; }

NOTIFY=1

STAMP="$(date +%F-%H%M)"
DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
DB_TMP="$DB_FILE.part"
UPLOADS_TMP="$UPLOADS_FILE.part"

log "backing up into $BACKUP_DIR"

# --- Database ----------------------------------------------------------------
# The user and database names come from the container's own environment rather
# than from parsing .env.prod, where they are optional (compose has defaults).
log "pg_dump…"
# The single quotes are deliberate: $POSTGRES_USER/$POSTGRES_DB must expand
# inside the container, not here.
# shellcheck disable=SC2016
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$DB_TMP"

# pg_dump can fail after gzip has already created the file — `set -o pipefail`
# catches that, but an empty or corrupt archive is checked separately.
gzip -t "$DB_TMP" || die "the database dump is corrupt"
[[ -s "$DB_TMP" ]] || die "the database dump is empty"
mv "$DB_TMP" "$DB_FILE"
log "database: $(du -h "$DB_FILE" | cut -f1)"

# --- Photos ------------------------------------------------------------------
# The volume is read through the api container itself, to avoid guessing the
# volume name (it depends on the project directory: <project>_uploads).
log "archiving uploads…"
"${COMPOSE[@]}" exec -T api tar czf - -C /app/uploads . > "$UPLOADS_TMP"

gzip -t "$UPLOADS_TMP" || die "the photo archive is corrupt"
mv "$UPLOADS_TMP" "$UPLOADS_FILE"
log "photos: $(du -h "$UPLOADS_FILE" | cut -f1)"

# --- Upload off the box ------------------------------------------------------
if [[ -n "$BACKUP_REMOTE" ]]; then
  command -v rclone >/dev/null || die "BACKUP_REMOTE is set, but rclone is not installed"
  log "rclone → $BACKUP_REMOTE"
  rclone copy "$DB_FILE" "$BACKUP_REMOTE" --no-traverse
  rclone copy "$UPLOADS_FILE" "$BACKUP_REMOTE" --no-traverse
  # Rotation on the remote side: the same two windows as locally.
  rclone delete "$BACKUP_REMOTE" --min-age "${KEEP_DAYS}d" --include 'db-*.sql.gz'
  rclone delete "$BACKUP_REMOTE" --min-age "${KEEP_DAYS_UPLOADS}d" --include 'uploads-*.tar.gz'
  log "uploaded"
else
  log "WARNING: BACKUP_REMOTE is not set — the copies are on this server only."
  log "         Losing the server means losing the backups. Set up an rclone remote."
fi

# --- Rotate the local copies -------------------------------------------------
# Two windows, for the reason spelled out at the top of this file. The safety
# copies from restore.sh (pre-restore-*) are rotated here as well — they have no
# schedule of their own — and they keep the longer window whichever half they
# hold: one is taken immediately before a destructive restore, which is the
# moment a copy is worth the most. The `uploads-*` pattern does not match them,
# `pre-restore-uploads-*.tar.gz` starts with something else.
rotate() {
  local days="$1"
  shift

  local match=()
  local pattern
  for pattern in "$@"; do
    [[ ${#match[@]} -eq 0 ]] || match+=(-o)
    match+=(-name "$pattern")
  done

  find "$BACKUP_DIR" -maxdepth 1 -type f \( "${match[@]}" \) -mtime "+$days" -print -delete |
    while read -r old; do
      log "removed old: $(basename "$old")"
    done
}

rotate "$KEEP_DAYS" 'db-*.sql.gz' 'pre-restore-*'
rotate "$KEEP_DAYS_UPLOADS" 'uploads-*.tar.gz'

# --- Free space --------------------------------------------------------------
# Last, deliberately: by now this run's archives have been written and the
# expired ones deleted, so the number is what the disk will actually look like
# until tomorrow night rather than a reading taken mid-rotation.
check_disk

log "done"
