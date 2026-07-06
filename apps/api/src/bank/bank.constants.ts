import { config } from '../config';

// DI tokens (identifiers — stay hardcoded).
export const BANK = 'BANK';
export const BREAKER = 'BREAKER';

// Tuning aliases sourced from the single config (ADR-013); tune via env.
export const BANK_TIMEOUT_MS = config.bank.timeoutMs;
export const FAILURE_THRESHOLD = config.bank.breakerThreshold;
export const OPEN_MS = config.bank.breakerOpenMs;
