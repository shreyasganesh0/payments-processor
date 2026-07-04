import { describe, it, expect } from 'vitest';
import { canTransition, type PaymentStatus } from './index';

const ALL: PaymentStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'];

// The only legal edges (encoded as "FROM>TO"). Everything else must be rejected.
const LEGAL = new Set<string>([
  'PENDING>PROCESSING',
  'PROCESSING>COMPLETED',
  'PROCESSING>FAILED',
  'PROCESSING>RETRYING',
  'RETRYING>PROCESSING',
]);

describe('canTransition — legal edges are allowed', () => {
  // ── WORKED EXAMPLE (plain assertion): one known-good edge ──
  it('PENDING → PROCESSING', () => {
    expect(canTransition('PENDING', 'PROCESSING')).toBe(true);
  });

  it.each([
    ['PROCESSING', 'COMPLETED'],
    ['PROCESSING', 'FAILED'],
    ['PROCESSING', 'RETRYING'],
    ['RETRYING', 'PROCESSING'],
  ])('%s → %s', (from, to) => {
    expect(canTransition(from as PaymentStatus, to as PaymentStatus)).toBe(true);
  });
});

describe('canTransition — every illegal edge is rejected', () => {
  // ── WORKED EXAMPLE (exhaustive matrix): generate all 25 (from,to) pairs,
  //    keep only the ones NOT in LEGAL, and assert each is false. This is the
  //    high-value test — it proves the negative space, not just the happy path. ──
  const illegalPairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(
    ([from, to]) => !LEGAL.has(`${from}>${to}`),
  );

  it.each(illegalPairs)('%s → %s is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('canTransition — terminal states have no exits', () => {
  it.each(['COMPLETED', 'FAILED'] as const)('%s cannot transition to anything', (terminal) => {
    for (const to of ALL) {
      expect(canTransition(terminal, to)).toBe(false);
    }
  });
});

describe('canTransition — no self-transitions', () => {
  it.each(ALL)('%s → %s is rejected', (state) => {
    expect(canTransition(state, state)).toBe(false);
  });
});
