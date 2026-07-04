import { describe, it, expect } from 'vitest';
import { convAmountToUnits, convUnitsToAmount } from './index';

// Contract this suite assumes (align index.ts to it):
//   convAmountToUnits(amount: string): number  — exact integer cents, string-parsed, no float math
//   convUnitsToAmount(cents: number): string   — inverse, always 2 decimal places
// Accepts "D", "D.d", "D.dd" (optional decimal). Rejects negative, >2 decimals,
// non-numeric, empty, malformed, and over-length input (all throw).

describe('convAmountToUnits — valid inputs', () => {
  // ── WORKED EXAMPLE (plain assertion): expect(actual).toBe(expected) ──
  it('converts a two-decimal amount', () => {
    expect(convAmountToUnits('100.50')).toBe(10050);
  });

  // ── WORKED EXAMPLE (table-driven with it.each): one row per case, one shared assertion.
  //    %s / %d are printf-style placeholders filled from each row for the test name. ──
  it.each([
    ['0', 0],
    ['0.01', 1],
    ['00.03', 3], // leading zeros + cents-only
    ['100', 10000], // no decimal point
    ['100.5', 10050], // one decimal digit = tenths → pads to 50
    ['999999.99', 99999999],
  ])('converts %s → %d cents', (input, expected) => {
    expect(convAmountToUnits(input as string)).toBe(expected as number);
  });
});

describe('convAmountToUnits — the float trap', () => {
  // The reason we string-parse instead of parseFloat(x)*100: proves no trailing-cent loss.
  it('yields exactly 10050, never 10049', () => {
    expect(convAmountToUnits('100.50')).toBe(10050);
    expect(convAmountToUnits('100.50')).not.toBe(10049);
  });
});

describe('convAmountToUnits — rejects invalid input', () => {
  // ── WORKED EXAMPLE (toThrow): pass a THUNK `() => fn()`, not fn() itself,
  //    so expect can catch the throw instead of it blowing up the test. ──
  it('throws on negative amounts', () => {
    expect(() => convAmountToUnits('-1.00')).toThrow();
  });

  it.each([
    ['too many decimals', '1.234'],
    ['non-numeric', 'abc'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['no integer part', '.50'],
    ['trailing dot', '100.'],
    ['comma grouping', '1,000.00'],
    ['currency symbol', '$100.00'],
    ['over length bound', '1'.repeat(21)],
    ['above safe-integer range', '9'.repeat(16)], // 16-digit dollars × 100 > 2^53
  ])('throws on %s (%j)', (_label, input) => {
    expect(() => convAmountToUnits(input)).toThrow();
  });
});

describe('convUnitsToAmount', () => {
  it('formats cents to a 2-dp string', () => {
    expect(convUnitsToAmount(10050)).toBe('100.50');
  });

  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [10000, '100.00'],
    [99999999, '999999.99'],
  ])('formats %d → %s', (cents, expected) => {
    expect(convUnitsToAmount(cents as number)).toBe(expected as string);
  });

  it('throws on non-integer cents', () => {
    expect(() => convUnitsToAmount(10.5)).toThrow();
  });
});

describe('round-trip: format(parse(x)) === x', () => {
  // ── WORKED EXAMPLE (round-trip / property style): parse then format must return
  //    the original — only holds for already-canonical 2-dp strings. ──
  it.each(['0.00', '0.01', '100.00', '100.50', '999999.99'])(
    'round-trips %s',
    (amount) => {
      expect(convUnitsToAmount(convAmountToUnits(amount))).toBe(amount);
    },
  );
});
