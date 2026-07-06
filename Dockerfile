# Multi-stage slim build. One image, all roles (api/relay/worker/web/migrate) run
# it with a different command — but now as COMPILED JS, not ts-node.
#
#   builder  → install all deps, compile shared+api (tsc), build web (standalone)
#   runtime  → node:22-alpine + prod-only deps + compiled JS + Next standalone

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# compile @payments/shared and the api (main/relay/worker/migrate) → dist JS
RUN pnpm --filter @payments/shared build && pnpm --filter @apps/api build

# build the Next console as a standalone server; API base is baked at build time
# (ADR-013), so CD passes --build-arg NEXT_PUBLIC_API_BASE=<public api url>
ARG NEXT_PUBLIC_API_BASE=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
RUN pnpm --filter @apps/web build

# prune to a prod-only, symlink-free deploy of the api (drops ts-node, typescript,
# vitest, drizzle-kit, eslint, @types) — carries dist/, drizzle/ SQL, and the
# compiled @payments/shared in node_modules.
RUN pnpm --filter @apps/api deploy --prod --legacy /prod/api

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# api: compiled dist + prod node_modules + drizzle SQL
COPY --from=builder /prod/api ./apps/api
# web: standalone server (+ its traced node_modules at /app), static assets, public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# default; overridden per role in docker-compose.yml / k8s:
#   relay   → node apps/api/dist/relay.js
#   worker  → node apps/api/dist/worker.js
#   migrate → node apps/api/dist/migrate.js
#   web     → node apps/web/server.js   (PORT=3001)
CMD ["node", "apps/api/dist/main.js"]
