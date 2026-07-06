# Single image for every Node role (api / relay / worker / web).
# Each compose service runs it with a different working_dir + command.
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

# install all workspace deps (lockfile-frozen)
COPY . .
RUN pnpm install --frozen-lockfile

# pre-build the Next.js console; the API base is baked in at build time and
# must be reachable from the browser (host), hence localhost:3000.
ENV NEXT_PUBLIC_API_BASE=http://localhost:3000
RUN pnpm --filter @apps/web build

# default; overridden per service in docker-compose.yml
WORKDIR /app/apps/api
CMD ["pnpm", "start:api"]
