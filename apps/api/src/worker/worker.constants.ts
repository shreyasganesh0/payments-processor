import { config } from '../config';

// Named aliases sourced from the single config (ADR-013); tune via env, not here.
export const BASE_MS = config.worker.baseBackoffMs;
export const CAP_MS = config.worker.capBackoffMs;
export const MAX_RETRIES = config.worker.maxRetries;
export const WORKER_METRICS_PORT = config.metricsPort;
