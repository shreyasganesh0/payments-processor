#!/usr/bin/env bash
# Run the whole stack on a LOCAL Kubernetes cluster (kind or minikube), using the
# self-contained base manifests: k8s/ bundles in-cluster Postgres + Valkey, so no
# AWS / managed services are needed. Access is via port-forward to localhost, so
# the default image (NEXT_PUBLIC_API_BASE=http://localhost:3000) works with no
# ingress or DNS setup.
#
#   scripts/local-k8s.sh up     # cluster + build + load + deploy + port-forward
#   scripts/local-k8s.sh down   # stop port-forwards + delete the cluster
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"; mkdir -p "$RUN_DIR"
NVM_NODE="$HOME/.nvm/versions/node/v22.22.3/bin"; [ -d "$NVM_NODE" ] && export PATH="$NVM_NODE:$PATH"
export PATH="$HOME/.local/bin:$PATH"
CLUSTER=payments NS=payments IMG=payments-processor-app:latest

if command -v kind >/dev/null 2>&1; then TOOL=kind
elif command -v minikube >/dev/null 2>&1; then TOOL=minikube
else echo "Install kind (recommended: reuses Docker) or minikube first."; exit 1; fi

stop_pf() {
  for f in "$RUN_DIR"/pf-*.pid; do [ -f "$f" ] && { kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; }; done
  pkill -f "port-forward svc/api 3000" 2>/dev/null || true
  pkill -f "port-forward svc/web 3001" 2>/dev/null || true
}

case "${1:-}" in
up)
  echo "== [$TOOL] ensure cluster =="
  if [ "$TOOL" = kind ]; then
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER"
    kubectl config use-context "kind-$CLUSTER" >/dev/null
  else
    minikube status -p "$CLUSTER" >/dev/null 2>&1 || minikube start -p "$CLUSTER" --driver=docker
    kubectl config use-context "$CLUSTER" >/dev/null
  fi

  echo "== build image (localhost API base) =="
  docker build --build-arg NEXT_PUBLIC_API_BASE=http://localhost:3000 -t "$IMG" "$ROOT_DIR"

  echo "== load image into the cluster =="
  if [ "$TOOL" = kind ]; then kind load docker-image "$IMG" --name "$CLUSTER"; else minikube -p "$CLUSTER" image load "$IMG"; fi

  echo "== apply base manifests (namespace, datastores, migrate, workloads) =="
  kubectl apply -f "$ROOT_DIR/k8s/"
  echo "== wait for migrate + rollout =="
  kubectl -n "$NS" wait --for=condition=complete job/migrate --timeout=240s
  kubectl -n "$NS" rollout status deploy/api --timeout=180s
  kubectl -n "$NS" rollout status deploy/web --timeout=180s

  echo "== port-forward api:3000 + web:3001 → localhost =="
  stop_pf
  nohup kubectl -n "$NS" port-forward svc/api 3000:3000 >"$RUN_DIR/pf-api.log" 2>&1 & echo $! >"$RUN_DIR/pf-api.pid"
  nohup kubectl -n "$NS" port-forward svc/web 3001:3001 >"$RUN_DIR/pf-web.log" 2>&1 & echo $! >"$RUN_DIR/pf-web.pid"
  sleep 3
  cat <<MSG

  ── LOCAL K8S UP ────────────────────────────────────────────
   console   http://localhost:3001
   api       http://localhost:3000   (health: /health/ready)
   pods      kubectl -n payments get pods
   logs      kubectl -n payments logs -f deploy/worker
   down      scripts/local-k8s.sh down   (or: make kube-down)
  ────────────────────────────────────────────────────────────
MSG
  ;;
down)
  stop_pf
  if [ "$TOOL" = kind ]; then kind delete cluster --name "$CLUSTER"; else minikube delete -p "$CLUSTER"; fi
  echo "  local cluster + port-forwards removed"
  ;;
*) echo "usage: local-k8s.sh {up|down}"; exit 1 ;;
esac
