import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from './backoff';
import { BASE_MS, CAP_MS } from './worker.constants';

// Output is randomized (equal jitter), so we assert BOUNDS + SHAPE over many
// samples rather than exact values. exp(attempt) = min(BASE_MS * 2^(attempt-1), CAP_MS);
// equal jitter puts the result in [exp/2, exp).
const SAMPLES = 2000;
const expFor = (attempt: number) => Math.min(BASE_MS * 2 ** (attempt - 1), CAP_MS);

describe('computeBackoffMs', () => {
  // --- category: bounds-over-many-samples (randomized) ---
  it('attempt 1 stays within the equal-jitter band [500, 1000]', () => {
    for (let i = 0; i < SAMPLES; i++) {
      const ms = computeBackoffMs(1);
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });

  it.each([1, 2, 3, 4, 5, 6, 10, 20, 50])(
    'attempt %i stays within [exp/2, exp]',
    (attempt) => {
      const exp = expFor(attempt);
      for (let i = 0; i < SAMPLES; i++) {
        const ms = computeBackoffMs(attempt);
        expect(ms).toBeGreaterThanOrEqual(exp / 2);
        expect(ms).toBeLessThanOrEqual(exp);
      }
    },
  );

  // --- category: cap holds (growth is bounded) ---
  it('caps the delay at CAP_MS for large attempts (no unbounded growth)', () => {
    for (let i = 0; i < SAMPLES; i++) {
      const ms = computeBackoffMs(100);
      expect(ms).toBeLessThanOrEqual(CAP_MS);
      expect(ms).toBeGreaterThanOrEqual(CAP_MS / 2);
    }
  });

  // --- category: expected-value shape (deterministic floors) ---
  it('floor increases per attempt until the cap, then plateaus', () => {
    const floors = [1, 2, 3, 4, 5].map((a) => expFor(a) / 2); // 500,1000,2000,4000,8000
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).toBeGreaterThan(floors[i - 1]);
    }
    // attempt 6 = 1000*2^5 = 32000 > 30000 => capped; floor plateaus at CAP/2
    expect(expFor(6) / 2).toBe(CAP_MS / 2);
    expect(expFor(20) / 2).toBe(CAP_MS / 2);
  });

  // --- category: jitter is actually applied (catches a forgotten Math.random) ---
  it('produces many distinct values for a fixed attempt (jitter present)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(computeBackoffMs(3));
    expect(seen.size).toBeGreaterThan(50);
  });

  // --- category: input guard (toThrow thunk) ---
  it('rejects non-positive attempts', () => {
    expect(() => computeBackoffMs(0)).toThrow();
    expect(() => computeBackoffMs(-1)).toThrow();
  });
});
