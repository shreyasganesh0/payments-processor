import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';
import { FAILURE_THRESHOLD, OPEN_MS } from './bank.constants';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // control the cooldown clock (breaker reads new Date())
    cb = new CircuitBreaker();
  });
  afterEach(() => vi.useRealTimers());

  const fail = (n: number) => { for (let i = 0; i < n; i++) cb.record(false); };

  it('starts closed and allows calls', () => {
    expect(cb.allow()).toBe(true);
  });

  it('stays closed below the failure threshold', () => {
    fail(FAILURE_THRESHOLD - 1);
    expect(cb.allow()).toBe(true);
  });

  it('opens after FAILURE_THRESHOLD consecutive failures and short-circuits', () => {
    fail(FAILURE_THRESHOLD);
    expect(cb.allow()).toBe(false);
  });

  it('counts CONSECUTIVE failures — a success resets the count', () => {
    fail(FAILURE_THRESHOLD - 1);
    cb.record(true);              // reset
    fail(FAILURE_THRESHOLD - 1);  // one short again
    expect(cb.allow()).toBe(true); // never tripped
  });

  it('allows exactly one probe after OPEN_MS, blocking concurrent calls (half-open)', () => {
    fail(FAILURE_THRESHOLD);
    expect(cb.allow()).toBe(false);   // open, within cooldown
    vi.setSystemTime(OPEN_MS);        // cooldown elapsed
    expect(cb.allow()).toBe(true);    // the probe
    expect(cb.allow()).toBe(false);   // second call blocked while probing
  });

  it('probe success closes the breaker', () => {
    fail(FAILURE_THRESHOLD);
    vi.setSystemTime(OPEN_MS);
    expect(cb.allow()).toBe(true);    // half-open probe
    cb.record(true);                  // probe succeeds
    expect(cb.allow()).toBe(true);    // closed
  });

  it('probe failure re-opens the breaker for another full cooldown', () => {
    fail(FAILURE_THRESHOLD);
    vi.setSystemTime(OPEN_MS);
    expect(cb.allow()).toBe(true);    // half-open probe
    cb.record(false);                 // probe fails
    expect(cb.allow()).toBe(false);   // re-opened, within new cooldown
    vi.setSystemTime(OPEN_MS * 2 + 1); // wait out the new cooldown
    expect(cb.allow()).toBe(true);    // probe again
  });
});
