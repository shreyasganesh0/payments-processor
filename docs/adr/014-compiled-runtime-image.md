# ADR-014: Compiled, multi-stage runtime image

## Context
The original image was a single stage: `COPY . . && pnpm install` (all dev deps)
with every role running `ts-node src/main.ts` at runtime. It was **1.44 GB** and
each process carried the TS compiler (~250 MB RSS), which OOM'd a 2 GB cloud box.
`ts-node` and the full dev toolchain (typescript, vitest, eslint, drizzle-kit,
tailwind, `@types/*`) were shipping into production.

## Options
- Keep `ts-node` at runtime (simplest, but fat + memory-hungry).
- Compile TS→JS in a multi-stage build and ship prod-only deps.
- Split into separate api and web images.

## Decision
A **multi-stage build** (`builder` → `runtime`), still **one image, N commands**:
- Compile `@payments/shared` and the api (`tsc`) to `dist`; run roles as
  `node apps/api/dist/{main,relay,worker,migrate}.js`. `emitDecoratorMetadata`
  stays on (NestJS DI).
- Next.js `output: 'standalone'` (+ `outputFileTracingRoot`) for the web.
- Replace the `drizzle-kit migrate` CLI with a compiled entrypoint using
  drizzle-orm's own migrator (`apps/api/src/migrate.ts`) — drops drizzle-kit,
  esbuild, and the TS config from the runtime.
- `pnpm deploy --prod --legacy` prunes to runtime-only dependencies.

## Consequences
- Image **1.44 GB → 388 MB**; per-process RSS **~250 MB → ~90 MB**; the full
  stack runs in **~150 MB** — it now fits a 2 GB (or even 1 GB) box comfortably.
- **Local dev is unchanged** — `scripts/pipeline.sh` still runs `ts-node` for fast
  iteration; only the container path compiles.
- `@payments/shared` now resolves to its compiled `dist` (uniform across tsc,
  vitest, node), so the tiny build is wired into `pipeline.sh up` and CI before
  typecheck/test.
- `drizzle-kit` is no longer a runtime dependency (still used in dev for
  generating migrations).
