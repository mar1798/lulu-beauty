#!/usr/bin/env bash
#
# Deploys the release that was approved on GitHub. Runs on the server, as
# `deploy`, from cron (every minute):
#
#   * * * * * /home/deploy/lulu-beauty/deploy/watch-release.sh
#
# The approval moves the ref `refs/deploy/current` to the release commit
# (.github/workflows/release-deploy.yml). This script notices the move and runs
# deploy/release.sh for the tag on that commit. Nothing is pushed to the server:
# it asks, GitHub answers, and no key to production lives anywhere but here.
#
# Settings come from environment variables (defaults in brackets):
#
#   DEPLOY_REF       the ref that names the approved release  (refs/deploy/current)
#   STATE_FILE       the last ref value acted on              ($HOME/.release-watch-state)
#   LOG_FILE         what this script and the deploy wrote    ($HOME/release-watch.log)
#   LOCK_FILE        guards against overlapping runs          ($HOME/.release-watch.lock)
#   DEPLOY_PING_URL  monitoring ping address           (empty — log and exit code only)
#
# Everything is logged, not just failures (unlike deploy/health-watch.sh):
# releases are rare, and the log is the only place that says the deploy started
# without a human. What went live is still `~/releases.log`, written by
# release.sh itself.
#
# ⚠️ Set DEPLOY_PING_URL. A deploy that fails here is otherwise invisible: GitHub
# shows the release as approved and moves on, the previous version keeps running
# and answering, so deploy/health-watch.sh sees a perfectly healthy site — and
# the release simply never went live. Nobody is watching a log on a server at
# the moment a cron job decides nothing happened. See "Releases" and Step 10 in
# docs/deployment.md.
#
# ⚠️ The state is the ref value this script last acted on — deliberately not a
# comparison with the deployed commit. A rollback done here by hand
# (`./deploy/release.sh <previous tag>`) leaves the ref where it was, so this
# script stays quiet instead of rolling production forward again a minute later.
#
# Which cuts both ways: re-approving the *same* tag on GitHub does not undo that
# rollback either, because the ref never changes value. Go forward again with
# `./deploy/release.sh <tag>` here, or let the next release carry it. Deleting
# STATE_FILE is the other lever — the next run then adopts what is approved
# without deploying it, exactly as a first run does.

set -Eeuo pipefail

# The repository root is two levels above this script, so it can be run from any
# directory (including cron, where $PWD is the home directory).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_REF="${DEPLOY_REF:-refs/deploy/current}"
STATE_FILE="${STATE_FILE:-$HOME/.release-watch-state}"
LOG_FILE="${LOG_FILE:-$HOME/release-watch.log}"
LOCK_FILE="${LOCK_FILE:-$HOME/.release-watch.lock}"
DEPLOY_PING_URL="${DEPLOY_PING_URL:-}"

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; }

# The monitoring ping, same protocol and same restraint as deploy/backup.sh: a
# plain request on success, <address>/fail on failure, and the body becomes the
# text of the alert. An unreachable monitor is only a line in the log — the
# deploy has already happened either way, and its outcome is not the ping's to
# change.
#
# The tail of this log is the body because that is what answers the only
# question the alert raises: the pull failed, or the containers never went
# healthy, or the external /health check did. Without it the email says a
# release failed and nothing more, at which point somebody has to open an ssh
# session to learn what every alert should have said by itself.
ping_monitor() {
  [[ -n "$DEPLOY_PING_URL" ]] || return 0

  if ! command -v curl >/dev/null; then
    log "warning: DEPLOY_PING_URL is set, but curl is not installed"
    return 0
  fi

  curl -fsS -m 10 --retry 3 -o /dev/null \
    --data-raw "$(tail -n 30 "$LOG_FILE")" \
    "$DEPLOY_PING_URL$1" ||
    log "warning: could not send the monitoring ping"
}

# A deploy takes minutes (a backup, a pull, waiting for healthy) and cron fires
# every minute. Without the lock the second run would start a backup while the
# first one is still switching containers.
#
# Checked rather than assumed: `flock -n 9` on a machine without it fails like a
# lock that is already held, and this script would then do nothing at all, every
# minute, in silence.
command -v flock >/dev/null ||
  { log "flock is not installed (apt install util-linux) — cannot deploy safely"; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

cd "$REPO_ROOT"

# Whether there is anything to fetch at all, asked separately — because a fetch
# of a ref the remote does not have fails exactly like a remote that cannot be
# reached. Before the first approval it does not have one, so on a freshly
# installed watcher the two are indistinguishable, and the log fills with a
# warning about an unreachable GitHub once a minute while the network is
# perfectly fine. A warning that cries wolf every minute is not read on the day
# it is true.
#
# --exit-code says which: 0 the ref is there, 2 the remote answered and has no
# such ref, anything else it could not be asked.
status=0
git ls-remote --exit-code --quiet origin "$DEPLOY_REF" >/dev/null 2>>"$LOG_FILE" || status=$?

case $status in
  0) ;;
  2)
    # Before the first approval, or after the ref was deleted. Not an error, and
    # deliberately silent: the first release approved from here creates it.
    exit 0
    ;;
  *)
    log "could not reach origin — trying again next minute"
    exit 0
    ;;
esac

# A custom ref namespace isn't fetched by default — it has to be named. The tags
# come along because release.sh deploys by tag, and `git describe` below needs
# them to turn a commit into a release name.
if ! git fetch --quiet --tags origin "+$DEPLOY_REF:$DEPLOY_REF" 2>>"$LOG_FILE"; then
  log "git fetch failed — GitHub unreachable? trying again next minute"
  exit 0
fi

approved="$(git rev-parse --verify --quiet "$DEPLOY_REF" || true)"
if [[ -z "$approved" ]]; then
  # The remote had the ref a moment ago and the fetch reported success, so this
  # is not the "no approval yet" case handled above — something is wrong with
  # the local repository. Quiet rather than deployed: there is no commit here to
  # act on either way.
  exit 0
fi

# First run: remember where things stand and deploy nothing. Installing a cron
# job must not, by itself, change what production is running — and on a server
# that is deliberately a release or two behind, it otherwise would, silently.
if [[ ! -f "$STATE_FILE" ]]; then
  printf '%s\n' "$approved" > "$STATE_FILE"
  log "first run: the approved release is $approved, nothing deployed"
  exit 0
fi

# `[[ … ]] && exit 0` would be a trap here: under `set -e` a false test is a
# failing last command, and cron would get a non-zero exit every quiet minute.
if [[ "$approved" == "$(cat "$STATE_FILE")" ]]; then
  exit 0
fi

tag="$(git describe --tags --exact-match "$approved" 2>/dev/null || echo "$approved")"

# Written before the deploy, not after: a release that fails must be looked at,
# not retried every minute — each attempt takes a backup, and sixty of those an
# hour is how a disk fills up while nobody is watching.
printf '%s\n' "$approved" > "$STATE_FILE"

log "approved: $tag ($approved) — deploying"
if "$REPO_ROOT/deploy/release.sh" "$tag" --yes >>"$LOG_FILE" 2>&1; then
  log "deployed $tag"
  # Pinged too, and not only the failures: it is what puts the release on the
  # monitor's timeline next to the failures, and what turns the check green
  # again after one. The alert is still the /fail below — releases are not on a
  # schedule, so silence here means nothing was released, not that something
  # went wrong.
  ping_monitor ''
else
  log "DEPLOY FAILED for $tag — see the output above and ~/releases.log for what is running"
  ping_monitor /fail
  # The exit code is what a monitoring wrapper around this cron line would see.
  exit 1
fi
