#!/usr/bin/env bash
#
# pipeline.sh — deterministic start/stop for the local api + relay + worker.
#
# Why this exists: running the services through `npm`/`pnpm` creates a
# wrapper chain (npm -> sh -c -> node) whose top can be killed while the
# real `node` child is orphaned to PID 1 and keeps consuming jobs. This
# supervisor runs each service as its OWN process-group leader (setsid),
# records its PID in a pidfile, and stops it by PID/group with a graceful
# SIGTERM -> SIGKILL escalation. No pattern-matching, no orphans.
#
# Usage:
#   scripts/pipeline.sh up                 # start all, wait until ready
#   scripts/pipeline.sh down               # graceful stop all
#   scripts/pipeline.sh restart [svc...]   # restart named svc(s), default all
#   scripts/pipeline.sh status             # show pid + liveness per service
#   scripts/pipeline.sh logs <svc>         # tail a service log
#   scripts/pipeline.sh sweep              # last-resort: kill any stray pipeline node procs
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
RUN_DIR="${PP_RUN_DIR:-$ROOT_DIR/.run}"

# Use the project's pinned node if present, else whatever is on PATH.
NVM_NODE="$HOME/.nvm/versions/node/v22.22.3/bin"
[[ -d "$NVM_NODE" ]] && export PATH="$NVM_NODE:$PATH"

export DATABASE_URL="${DATABASE_URL:-postgres://payments:payments@localhost:5432/payments}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

TSNODE="$API_DIR/node_modules/.bin/ts-node"

SERVICES=(api relay worker)
declare -A ENTRY=(  [api]="src/main.ts"   [relay]="src/relay.ts"  [worker]="src/worker.ts" )
# readiness probe per service: "curl" hits the health endpoint; "log:<str>" greps the log.
declare -A READY=(  [api]="curl"          [relay]="log:relay up"  [worker]="log:worker up" )

mkdir -p "$RUN_DIR"

pidfile() { echo "$RUN_DIR/$1.pid"; }
logfile() { echo "$RUN_DIR/$1.log"; }
alive()   { kill -0 "$1" 2>/dev/null; }

wait_ready() {
  local svc="$1" pid="$2" i probe="${READY[$1]}"
  for i in $(seq 1 30); do
    alive "$pid" || { echo "[$svc] DIED during startup — see $(logfile "$svc")"; return 1; }
    case "$probe" in
      curl)  curl -sf -o /dev/null http://localhost:3000/health/live && { echo "[$svc] ready (pid $pid)"; return 0; } ;;
      log:*) grep -q "${probe#log:}" "$(logfile "$svc")" 2>/dev/null && { echo "[$svc] ready (pid $pid)"; return 0; } ;;
    esac
    sleep 1
  done
  echo "[$svc] readiness timeout — see $(logfile "$svc")"; return 1
}

start_one() {
  local svc="$1" pf pid log
  pf="$(pidfile "$svc")"; log="$(logfile "$svc")"
  if [[ -f "$pf" ]] && alive "$(cat "$pf")"; then
    echo "[$svc] already running (pid $(cat "$pf"))"; return 0
  fi
  # Run the ts-node BINARY directly (no npm/pnpm/sh wrapper) so the recorded
  # PID is the real node process. Inside the subshell we `cd` then `exec nohup`,
  # which replaces the subshell in place — so $! (the subshell pid) IS the node
  # pid, and nohup keeps it alive after this shell exits. ts-node runs in one
  # process (no forked children), so a bare `kill $pid` is exact and complete.
  ( cd "$API_DIR" && exec nohup "$TSNODE" "${ENTRY[$svc]}" >"$log" 2>&1 </dev/null ) &
  pid=$!
  echo "$pid" >"$pf"
  echo "[$svc] started (pid $pid, log $log)"
  wait_ready "$svc" "$pid"
}

stop_one() {
  local svc="$1" pf pid i
  pf="$(pidfile "$svc")"
  [[ -f "$pf" ]] || { echo "[$svc] not managed (no pidfile)"; return 0; }
  pid="$(cat "$pf")"
  if alive "$pid"; then
    # Graceful first so OnApplicationShutdown hooks run (relay clears its timer).
    kill -TERM "$pid" 2>/dev/null || true
    for i in $(seq 1 20); do alive "$pid" || break; sleep 0.5; done
    if alive "$pid"; then
      kill -KILL "$pid" 2>/dev/null || true
      echo "[$svc] force-killed (pid $pid)"
    else
      echo "[$svc] stopped gracefully (was pid $pid)"
    fi
  else
    echo "[$svc] already dead (stale pidfile)"
  fi
  rm -f "$pf"
}

status() {
  local svc pf pid state
  for svc in "${SERVICES[@]}"; do
    pf="$(pidfile "$svc")"
    if [[ -f "$pf" ]]; then
      pid="$(cat "$pf")"
      alive "$pid" && state="up   (pid $pid)" || state="DEAD (stale pidfile $pid)"
    else
      state="down"
    fi
    printf "  %-7s %s\n" "$svc" "$state"
  done
}

# Last resort only: kill untracked pipeline node procs (e.g. orphans from a
# previous run started outside this supervisor). Matches the real node bin,
# not the wrapper, and skips this script's own pid.
sweep() {
  local p rest
  pgrep -af "ts-node/dist/bin.js src/(main|relay|worker)\.ts" | while read -r p rest; do
    [[ "$p" == "$$" ]] && continue
    echo "sweep: kill $p ($rest)"
    kill -KILL "$p" 2>/dev/null || true
  done
  echo "sweep done"
}

cmd="${1:-}"; [[ $# -gt 0 ]] && shift || true
case "$cmd" in
  up)      for s in "${SERVICES[@]}"; do start_one "$s"; done ;;
  down)    for s in "${SERVICES[@]}"; do stop_one  "$s"; done ;;
  restart) for s in "${@:-${SERVICES[@]}}"; do stop_one "$s"; start_one "$s"; done ;;
  status)  status ;;
  logs)    tail -n 40 -f "$(logfile "${1:-api}")" ;;
  sweep)   sweep ;;
  *) echo "usage: pipeline.sh {up|down|restart [svc...]|status|logs <svc>|sweep}"; exit 1 ;;
esac
