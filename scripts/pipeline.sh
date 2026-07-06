#!/usr/bin/env bash
#
# pipeline.sh — deterministic start/stop for the local api + relay + worker.
#
# Why this exists: running the services through `npm`/`pnpm` creates a
# wrapper chain (npm -> sh -c -> node) whose top can be killed while the
# real `node` child is orphaned to PID 1 and keeps consuming jobs. This
# supervisor runs each service as its OWN process (setsid-free, one node
# per instance), records its PID in a pidfile, and stops it by PID with a
# graceful SIGTERM -> SIGKILL escalation. No pattern-matching, no orphans.
#
# Horizontal scaling: relay and worker scale out. Run N of each with
#   RELAYS=2 WORKERS=2 scripts/pipeline.sh up
# Each instance is numbered (relay.1, worker.2, …) with its own pid/log.
# This mirrors a K8s Deployment's `replicas: N`; the roles are safe to run
# N-wide because of FOR UPDATE SKIP LOCKED, BullMQ jobId dedup, and the CAS
# state machine (see ADR-003/006/007).
#
# Usage:
#   [RELAYS=n] [WORKERS=n] scripts/pipeline.sh up   # start all, wait until ready
#   scripts/pipeline.sh down               # graceful stop all managed instances
#   scripts/pipeline.sh restart [inst...]  # restart named instance(s), default all
#   scripts/pipeline.sh status             # show pid + liveness per instance
#   scripts/pipeline.sh logs <inst>        # tail an instance log (e.g. worker.1)
#   scripts/pipeline.sh sweep              # last-resort: kill any stray pipeline node procs
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
RUN_DIR="${PP_RUN_DIR:-$ROOT_DIR/.run}"

NVM_NODE="$HOME/.nvm/versions/node/v22.22.3/bin"
[[ -d "$NVM_NODE" ]] && export PATH="$NVM_NODE:$PATH"

# Load the single local config source if present (`cp .env.example .env`). These
# are HOST values (localhost URLs), correct for the local ts-node processes. The
# `:-` fallbacks below still apply when .env is absent, so behavior is unchanged
# until you opt in by creating .env.
set -a; [[ -f "$ROOT_DIR/.env" ]] && . "$ROOT_DIR/.env"; set +a

export DATABASE_URL="${DATABASE_URL:-postgres://payments:payments@localhost:5432/payments}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

TSNODE="$API_DIR/node_modules/.bin/ts-node"
TSC="$API_DIR/node_modules/.bin/tsc"

RELAYS="${RELAYS:-1}"
WORKERS="${WORKERS:-1}"

declare -A ENTRY=( [api]="src/main.ts"  [relay]="src/relay.ts" [worker]="src/worker.ts" )
declare -A READY=( [api]="curl"         [relay]="log:relay up" [worker]="log:worker up" )

mkdir -p "$RUN_DIR"

# instance list for the requested scale (api is a single HTTP server here)
instances() {
  echo "api"
  local i
  for i in $(seq 1 "$RELAYS");  do echo "relay.$i";  done
  for i in $(seq 1 "$WORKERS"); do echo "worker.$i"; done
}
# managed instances = whatever has a pidfile (robust across scale changes)
managed() { local f; for f in "$RUN_DIR"/*.pid; do [[ -e "$f" ]] && basename "$f" .pid; done; }
base()    { echo "${1%%.*}"; }   # relay.2 -> relay

pidfile() { echo "$RUN_DIR/$1.pid"; }
logfile() { echo "$RUN_DIR/$1.log"; }
alive()   { kill -0 "$1" 2>/dev/null; }

wait_ready() {
  local inst="$1" pid="$2" i probe="${READY[$(base "$1")]}"
  for i in $(seq 1 30); do
    alive "$pid" || { echo "[$inst] DIED during startup — see $(logfile "$inst")"; return 1; }
    case "$probe" in
      curl)  curl -sf -o /dev/null http://localhost:3000/health/live && { echo "[$inst] ready (pid $pid)"; return 0; } ;;
      log:*) grep -q "${probe#log:}" "$(logfile "$inst")" 2>/dev/null && { echo "[$inst] ready (pid $pid)"; return 0; } ;;
    esac
    sleep 1
  done
  echo "[$inst] readiness timeout — see $(logfile "$inst")"; return 1
}

start_one() {
  local inst="$1" b pf pid log
  b="$(base "$inst")"; pf="$(pidfile "$inst")"; log="$(logfile "$inst")"
  if [[ -f "$pf" ]] && alive "$(cat "$pf")"; then
    echo "[$inst] already running (pid $(cat "$pf"))"; return 0
  fi
  # N workers on one host would collide on the metrics port, so offset it per
  # instance (worker.1 -> 9101, worker.2 -> 9102). In K8s each pod has its own
  # network namespace, so this only matters when running replicas locally.
  (
    cd "$API_DIR"
    [[ "$b" == worker ]] && export METRICS_PORT=$(( 9100 + ${inst##*.} ))
    exec nohup "$TSNODE" "${ENTRY[$b]}" >"$log" 2>&1 </dev/null
  ) &
  pid=$!
  echo "$pid" >"$pf"
  echo "[$inst] started (pid $pid, log $log)"
  wait_ready "$inst" "$pid"
}

stop_one() {
  local inst="$1" pf pid i
  pf="$(pidfile "$inst")"
  [[ -f "$pf" ]] || { echo "[$inst] not managed (no pidfile)"; return 0; }
  pid="$(cat "$pf")"
  if alive "$pid"; then
    kill -TERM "$pid" 2>/dev/null || true
    for i in $(seq 1 20); do alive "$pid" || break; sleep 0.5; done
    if alive "$pid"; then kill -KILL "$pid" 2>/dev/null || true; echo "[$inst] force-killed (pid $pid)"
    else echo "[$inst] stopped gracefully (was pid $pid)"; fi
  else
    echo "[$inst] already dead (stale pidfile)"
  fi
  rm -f "$pf"
}

status() {
  local inst pid state any=0
  for inst in $(managed); do
    any=1; pid="$(cat "$(pidfile "$inst")")"
    alive "$pid" && state="up   (pid $pid)" || state="DEAD (stale pidfile $pid)"
    printf "  %-9s %s\n" "$inst" "$state"
  done
  [[ "$any" == 0 ]] && echo "  (all down)"
}

sweep() {
  local p rest
  pgrep -af "ts-node/dist/bin.js src/(main|relay|worker)\.ts" | while read -r p rest; do
    [[ "$p" == "$$" ]] && continue
    echo "sweep: kill $p ($rest)"; kill -KILL "$p" 2>/dev/null || true
  done
  echo "sweep done"
}

cmd="${1:-}"; [[ $# -gt 0 ]] && shift || true
case "$cmd" in
  up)      # @payments/shared resolves to its compiled dist (main -> dist), so
           # build it before the ts-node roles start.
           "$TSC" -p "$ROOT_DIR/packages/shared/tsconfig.build.json" && echo "[shared] built"
           for s in $(instances); do start_one "$s"; done ;;
  down)    for s in $(managed);   do stop_one  "$s"; done ;;
  restart) for s in "${@:-$(managed)}"; do stop_one "$s"; start_one "$s"; done ;;
  status)  status ;;
  logs)    tail -n 40 -f "$(logfile "${1:-api}")" ;;
  sweep)   sweep ;;
  *) echo "usage: [RELAYS=n WORKERS=n] pipeline.sh {up|down|restart [inst...]|status|logs <inst>|sweep}"; exit 1 ;;
esac
