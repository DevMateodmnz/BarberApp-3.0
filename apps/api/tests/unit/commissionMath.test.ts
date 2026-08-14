import { describe, expect, it } from 'vitest';
import { calculateCommissionCents } from '../../src/lib/commissionMath.js';

describe('commission exact arithmetic', () => {
  it.each([
    [10_000, 2_500, 2_500],
    [333, 1_500, 50],
    [1, 5_000, 1],
    [1, 4_999, 0],
    [9_999, 0, 0],
  ])('calculates %i cents at %i bps as %i cents', (gross, rate, expected) => {
    expect(calculateCommissionCents(gross, rate)).toBe(expected);
  });

  it.each([[-1, 100], [100, -1], [100, 10_001], [1.2, 100]])(
    'rejects invalid inputs',
    (gross, rate) => expect(() => calculateCommissionCents(gross, rate)).toThrow()
  );
});
