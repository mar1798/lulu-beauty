#!/usr/bin/env bash
#
# An external liveness check for the site: it hits the public /health endpoint
# and reports to healthchecks.io. It complements UptimeRobot, which on the free
# tier can only do HEAD and therefore sees nothing but static pages — and those
# are served even with a dead database.
#
# From cron (every 5 minutes):
#
#   */5 * * * * HEALTH_PING_URL=https://hc-ping.com/<uuid> /home/deploy/lulu-beauty/deploy/health-watch.sh
#
# Settings come from environment variables (defaults in brackets):
#
#   HEALTH_PING_URL  healthchecks.io check address     (empty — exit code only)
#   HEALTH_URL       what to request    (https://<SITE_DOMAIN>/api/proxy/health)
#   ENV_FILE         where to read the domain from  (<repo root>/.env.prod)
#   LOG_FILE         where failures are written        ($HOME/health-watch.log)
#   RELEASE_FLAG     deploy/release.sh raises it for the length of a deploy;
#                    while it is there this check keeps quiet
#                                                    ($HOME/.release-in-progress)
#   RELEASE_MAX_AGE  how long that flag is believed, in seconds          (600)
#
# Silence in the log means everything is fine: successes are not written, or 288
# lines of nothing would pile up every day. Only failures are.
#
# This scheme catches the death of the server too — but not by itself: the pings
# simply stop arriving, and healthchecks raises the alarm on its own schedule.

set -uo pipefail

# The repository root is two levels above this script, so it can be run from any
# directory (including cron, where $PWD is the home directory).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.prod}"

# The domain comes from the same variable Caddy issues the certificate for —
# otherwise one address would be checked one day while another one served.
SITE_DOMAIN="${SITE_DOMAIN:-$(sed -n 's/^SITE_DOMAIN=//p' "$ENV_FILE" 2>/dev/null | tail -n1)}"

HEALTH_URL="${HEALTH_URL:-https://$SITE_DOMAIN/api/proxy/health}"
HEALTH_PING_URL="${HEALTH_PING_URL:-}"
LOG_FILE="${LOG_FILE:-$HOME/health-watch.log}"

RELEASE_FLAG="${RELEASE_FLAG:-$HOME/.release-in-progress}"
RELEASE_MAX_AGE="${RELEASE_MAX_AGE:-600}"

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; }

# A deploy replaces the `api` and `website` containers, and for a few seconds in
# the middle the site answers with what a stranger would call an outage: Next is
# already up, the API behind it is not yet, and the proxy returns a 503. A cron
# tick landing in that window used to send a failure ping and an email about a
# release going exactly as intended — the kind of alarm that teaches people to
# ignore this check.
#
# deploy/release.sh raises the flag for the length of the deploy and removes it
# on the way out, whatever the outcome; here it means "skip this tick". Silence
# and not a success ping, deliberately: we do not know the site is up, we only
# know that we are not the ones to judge it right now. Missing one or two ticks
# is invisible against the 15-minute grace time (see docs/deployment.md).
#
# The age limit is what keeps a forgotten flag from muting monitoring forever —
# a release killed mid-swap (SIGKILL, a rebooted server) never runs its trap.
# Past RELEASE_MAX_AGE the flag is ignored and the failure, if any, is reported.
if [[ -f "$RELEASE_FLAG" ]]; then
  FLAG_AGE=$(( $(date +%s) - $(stat -c %Y "$RELEASE_FLAG" 2>/dev/null || echo 0) ))

  if [[ $FLAG_AGE -lt $RELEASE_MAX_AGE ]]; then
    exit 0
  fi

  log "warning: $RELEASE_FLAG is ${FLAG_AGE}s old — ignoring it; if no deploy is running, delete it"
fi

# With no domain there is nothing to check, and silently pinging "all good" is
# the worst thing a monitor can do: silence in healthchecks would mean the site
# is alive.
if [[ -z "$SITE_DOMAIN" ]]; then
  log "ERROR: could not determine SITE_DOMAIN (no $ENV_FILE?), the check did not run"
  exit 2
fi

# One probe: the status code and the body. Success means 200 with the database
# up — the endpoint answers 503 when Postgres is unreachable, but relying on the
# code alone is too little: a 200 with an empty or foreign body would mean
# something other than what we think is answering.
probe() {
  local body code
  # The curl error text (unreachable host, timeout, TLS) has to reach the email:
  # "FAILURE" without a reason helps nobody who was woken up by it.
  body="$(curl -sS -m 15 -w '\n%{http_code}' "$HEALTH_URL" 2>&1)" || {
    printf 'network: %s' "$(printf '%s' "$body" | tr '\n' ' ')"
    return 1
  }
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"

  [[ "$code" == "200" ]] || { printf '%s' "code $code: $body"; return 1; }
  printf '%s' "$body" | grep -q '"status":"ok"' || { printf '%s' "body without status=ok: $body"; return 1; }
  printf '%s' "$body" | grep -q '"database":{"status":"up"}' || { printf '%s' "database not up: $body"; return 1; }
  return 0
}

# A second attempt 10 seconds later: a one-off network hiccup must not wake anyone.
if ! DETAIL="$(probe)"; then
  sleep 10
  DETAIL="$(probe)" && FAILED=0 || FAILED=1
else
  FAILED=0
fi

if [[ -n "$HEALTH_PING_URL" ]]; then
  if [[ $FAILED -eq 0 ]]; then
    curl -fsS -m 10 --retry 2 -o /dev/null "$HEALTH_PING_URL" || log "warning: the success ping did not go out"
  else
    curl -fsS -m 10 --retry 2 -o /dev/null --data-raw "$DETAIL" "$HEALTH_PING_URL/fail" ||
      log "warning: the failure ping did not go out"
  fi
fi

if [[ $FAILED -eq 1 ]]; then
  log "FAILURE: $DETAIL"
  # The log must not grow without bound, even if the site is down for a week.
  [[ $(stat -c%s "$LOG_FILE") -gt 1048576 ]] && tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  exit 1
fi

exit 0
