# Kubernetes manifests

Deploys the payment pipeline to a cluster: `api` / `relay` / `worker` / `web`
(all one image, different commands — same pattern as compose), a migration `Job`,
in-cluster Postgres + Valkey, an Ingress, and an HPA that scales the worker on
queue depth. Config comes from a ConfigMap + Secret that map 1:1 onto the
`config.ts` env vars (ADR-013).

- `00-namespace-config.yaml` — namespace, ConfigMap (non-secret), Secret (DB URL + password)
- `10-datastores.yaml` — Postgres + Valkey (delete in prod; use managed services)
- `20-migrate-job.yaml` — runs `drizzle-kit migrate`
- `30-workloads.yaml` — api/relay/worker/web Deployments + Services
- `40-ingress.yaml` — public entry for web + api
- `50-hpa.yaml` — worker autoscaling on `payments_queue_depth`

## Deploy (local: kind / minikube)

```bash
# 1. build the app image and load it into the cluster
docker build -t payments-processor-app:latest .
kind load docker-image payments-processor-app:latest      # or: minikube image load ...

# 2. apply (files are numbered so `kubectl apply -f k8s/` orders them)
kubectl apply -f k8s/
kubectl -n payments wait --for=condition=complete job/migrate --timeout=120s

# 3. reach it — map the ingress hosts to the controller IP
echo "127.0.0.1 payments.local api.payments.local" | sudo tee -a /etc/hosts
# open http://payments.local
```

Scale a role: `kubectl -n payments scale deploy/worker --replicas=4` (safe — see
NOTES.md "Horizontal scaling"), or let the HPA do it.

## What changes for production

- **Datastores** → delete `10-datastores.yaml`; point `DATABASE_URL` / `REDIS_URL`
  at managed services (RDS/Cloud SQL, ElastiCache/Memorystore) over TLS. Move the
  Secret into a real secret manager (External Secrets / SOPS), not plaintext.
- **Image** → push `payments-processor-app` to a registry and set an immutable
  tag + `imagePullPolicy: Always`.
- **Web API base** → the console inlines `NEXT_PUBLIC_API_BASE` at **build time**,
  so build the web image with the public API URL (`http://api.payments.local`
  here). A runtime env var will not change it (ADR-013).
- **HPA** → install Prometheus + the Prometheus Adapter and expose
  `payments_queue_depth` as an external metric (sample rule in `50-hpa.yaml`).
  Without it the worker stays at `minReplicas` and everything else still runs.
- **Ingress** → set real hosts + TLS (cert-manager) and your controller's
  annotations.
