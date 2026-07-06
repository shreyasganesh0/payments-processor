import { config } from '../config';

// Sourced from the single config (ADR-013); tune via WEBHOOK_MAX_ATTEMPTS.
export const MAX_WEBHOOK_ATTEMPTS = config.webhooks.maxAttempts;
