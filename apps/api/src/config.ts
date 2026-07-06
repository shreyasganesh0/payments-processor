// Single source of truth for runtime configuration (ADR-013).
// Read once from the environment with local-dev defaults. In production the
// datastore URLs are required rather than silently falling back to localhost.

function env(name: string, fallback: string): string {
    if (
        process.env.NODE_ENV === 'production' &&
        process.env[name] === undefined &&
        fallback.includes('localhost')
    ) {
        throw new Error(`Missing required env var in production: ${name}`);
    }
    return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
    return process.env[name] ? Number(process.env[name]) : fallback;
}

export const config = {
    databaseUrl: env('DATABASE_URL', 'postgres://payments:payments@localhost:5432/payments'),
    redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
    apiPort: num('PORT', 3000),
    corsOrigin: env('CORS_ORIGIN', 'http://localhost:3001'),
    metricsPort: num('METRICS_PORT', 9101),
} as const;
