# Shared helpers for the demo beat scripts. Inspect-only unless a beat says
# otherwise: they read the logs and the database to PROVE each beat's guarantee.
# Sourced by beatN.sh — not meant to be run directly.
set -uo pipefail

# Hop to the project root (parent of this file's dir) so `docker compose`
# always finds the compose file no matter where the script is invoked from.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DC="docker compose"
PSQL=($DC exec -T postgres psql -U payments -d payments)
SINCE="${SINCE:-30m}"          # log lookback window; override: SINCE=2h demo/beat1.sh
API="${API:-http://localhost:3000}"

if [ -t 1 ]; then
  Y=$'\033[1;33m'; C=$'\033[1;36m'; G=$'\033[1;32m'; Z=$'\033[0m'
else
  Y=''; C=''; G=''; Z=''
fi

header()  { printf '\n%s== %s ==%s\n' "$G" "$*" "$Z"; }
point()   { printf '\n%s> %s%s\n' "$Y" "$*" "$Z"; }
echocmd() { printf '%s$ %s%s\n' "$C" "$*" "$Z"; }

# scalar query — clean value, no headers/borders
pq() { "${PSQL[@]}" -tAc "$1"; }

# captioned table query: print the point, echo a copy-pasteable command, run it
sql() { # <caption> <SQL>
  point "$1"
  echocmd "docker compose exec postgres psql -U payments -d payments -c \"$2\""
  "${PSQL[@]}" -c "$2"
}

# captioned shell command
shl() { # <caption> <command>
  point "$1"; echocmd "$2"; eval "$2"
}

latest_payment() { pq "SELECT id FROM payments ORDER BY created_at DESC LIMIT 1;"; }

resolve_cid() { # <paymentId> -> correlationId (may be empty)
  pq "SELECT correlation_id FROM payment_events WHERE payment_id='$1' AND correlation_id IS NOT NULL ORDER BY occurred_at LIMIT 1;"
}

# full lifecycle in the logs across api + worker, matched by paymentId + correlationId
logs_for() { # <paymentId>
  local pid="$1" cid pat
  cid="$(resolve_cid "$pid")"
  pat="$pid"; [ -n "$cid" ] && pat="$pid|$cid"
  point "Logs across api + worker (matched by paymentId / correlationId)"
  echocmd "docker compose logs --since $SINCE api worker | grep -E '$pat'"
  $DC logs --since "$SINCE" api worker 2>/dev/null | grep -E "$pat" \
    || echo "(no matching lines in the last $SINCE — widen it: SINCE=2h $0 $pid)"
}

# use $1 if given, else the most recent payment
pick_payment() { # [paymentId]
  local pid="${1:-}"
  [ -z "$pid" ] && pid="$(latest_payment)"
  if [ -z "$pid" ]; then echo "no payments found — submit one first" >&2; exit 1; fi
  printf '%s' "$pid"
}
