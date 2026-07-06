// ONLY IMPORT FROM WORKER CODE NOT API
import { Counter, Gauge } from 'prom-client';

export const bankAttempts = new Counter({
    name: 'payment_bank_attempts_total',
    help: 'Bank authorize attempts by outcome',
    labelNames: ['outcome'],
});

export const breakerState = new Gauge({
    name: 'bank_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
});
