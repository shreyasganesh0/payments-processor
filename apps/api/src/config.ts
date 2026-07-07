// Single source of truth for ALL runtime configuration (ADR-013).
// Read once from the environment with local-dev defaults, grouped by concern
// with env-var names mirroring the group (config.worker.maxRetries ←
// WORKER_MAX_RETRIES). Behavioral tuning knobs live here too, not scattered as
// hardcoded constants. Validation is collected and thrown ONCE at module load
// (fail-fast, all problems at once); since every entrypoint and drizzle.config.ts
// import this file, the checks run in every process automatically.

const problems: string[] = [];

// String var. Required (throws) either when opts.required is set, or — preserving
// the original ADR-013 rule — in production when a localhost dev default would
// otherwise be used silently. `oneOf` constrains to an allowed set.
function env(
    name: string,
    fallback: string,
    opts: { required?: boolean; oneOf?: readonly string[] } = {},
): string {
    const raw = process.env[name];
    const isProd = process.env.NODE_ENV === 'production';
    const required = opts.required ?? (isProd && fallback.includes('localhost'));
    if (raw === undefined && required) {
        problems.push(`Missing required env var: ${name}`);
        return fallback;
    }
    const value = raw ?? fallback;
    if (opts.oneOf && !opts.oneOf.includes(value)) {
        problems.push(`Invalid ${name}="${value}" (expected one of: ${opts.oneOf.join(', ')})`);
    }
    return value;
}

function num(
    name: string,
    fallback: number,
    opts: { min?: number; max?: number } = {},
): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        problems.push(`${name}="${raw}" is not a number`);
        return fallback;
    }
    if (opts.min !== undefined && n < opts.min) problems.push(`${name}=${n} is below min ${opts.min}`);
    if (opts.max !== undefined && n > opts.max) problems.push(`${name}=${n} is above max ${opts.max}`);
    return n;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function bool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    problems.push(`${name}="${raw}" is not a boolean (true|false|1|0)`);
    return fallback;
}

// Registered bank adapters — the keys `BANK_ADAPTER` may select (see
// bank.module.ts). Adding a real adapter = add its key here + one registry line.
export const BANK_ADAPTERS = ['simulated'] as const;
export type BankAdapterKey = (typeof BANK_ADAPTERS)[number];

export const config = {
    env: env('NODE_ENV', 'development'),

    // ── datastores & network ──
    databaseUrl: env('DATABASE_URL', 'postgres://payments:payments@localhost:5432/payments'),
    redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
    apiPort: num('PORT', 3000, { min: 1, max: 65535 }),
    // Allowlist (comma-separated). enableCors reflects whichever entry matches the
    // request Origin, so the browser gets its own origin echoed back — localhost AND
    // 127.0.0.1 both work locally (they load different Chrome origins but reach the
    // same API). Must include every public web origin per environment.
    corsOrigins: env('CORS_ORIGIN', 'http://localhost:3001,http://127.0.0.1:3001')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    metricsPort: num('METRICS_PORT', 9101, { min: 1, max: 65535 }),

    // ── worker: retry/backoff (also drives webhook retries via computeBackoffMs) ──
    worker: {
        baseBackoffMs: num('WORKER_BASE_BACKOFF_MS', 1000, { min: 0 }),
        capBackoffMs: num('WORKER_CAP_BACKOFF_MS', 30_000, { min: 0 }),
        maxRetries: num('WORKER_MAX_RETRIES', 5, { min: 0 }),
    },

    // ── bank adapter + circuit breaker + chaos-config poll ──
    bank: {
        adapter: env('BANK_ADAPTER', 'simulated', { oneOf: BANK_ADAPTERS }) as BankAdapterKey,
        timeoutMs: num('BANK_TIMEOUT_MS', 2000, { min: 0 }),
        breakerThreshold: num('BANK_BREAKER_THRESHOLD', 5, { min: 1 }),
        breakerOpenMs: num('BANK_BREAKER_OPEN_MS', 10_000, { min: 0 }),
        syncMs: num('BANK_SYNC_MS', 2000, { min: 100 }),
    },

    // ── relay + reaper poll loops ──
    relay: {
        pollMs: num('RELAY_POLL_MS', 5000, { min: 100 }),
        reaperIntervalMs: num('REAPER_INTERVAL_MS', 10_000, { min: 100 }),
        reaperDeadlineMs: num('REAPER_DEADLINE_MS', 60_000, { min: 0 }),
    },

    // ── webhook delivery ──
    webhooks: {
        maxAttempts: num('WEBHOOK_MAX_ATTEMPTS', 5, { min: 1 }),
        httpTimeoutMs: num('WEBHOOK_HTTP_TIMEOUT_MS', 5000, { min: 0 }),
        pollMs: num('WEBHOOK_POLL_MS', 5000, { min: 100 }),
        reaperIntervalMs: num('WEBHOOK_REAPER_INTERVAL_MS', 30_000, { min: 100 }),
        reaperDeadlineMs: num('WEBHOOK_REAPER_DEADLINE_MS', 60_000, { min: 0 }),
    },
} as const;

if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
}
