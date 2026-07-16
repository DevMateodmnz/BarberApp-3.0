import { describe, expect, it } from 'vitest';
import { calculateDepositAmountCents } from '../../src/lib/payments/policy.js';

describe('calculateDepositAmountCents', () => {
  it('returns the fixed deposit and snapshots the fixed value', () => {
    expect(
      calculateDepositAmountCents({
        mode: 'FIXED',
        fixedAmountCents: 2500,
        percentageBasisPoints: null,
        servicePriceCents: 8000,
      })
    ).toEqual({
      amountCents: 2500,
      valueSnapshot: 2500,
    });
  });

  it('rounds percentage deposits deterministically with half-up integer math', () => {
    expect(
      calculateDepositAmountCents({
        mode: 'PERCENTAGE',
        fixedAmountCents: null,
        percentageBasisPoints: 3333,
        servicePriceCents: 1000,
      })
    ).toEqual({
      amountCents: 333,
      valueSnapshot: 3333,
    });

    expect(
      calculateDepositAmountCents({
        mode: 'PERCENTAGE',
        fixedAmountCents: null,
        percentageBasisPoints: 1667,
        servicePriceCents: 3,
      })
    ).toEqual({
      amountCents: 1,
      valueSnapshot: 1667,
    });
  });

  it('rejects fixed deposits that exceed the service price', () => {
    expect(() =>
      calculateDepositAmountCents({
        mode: 'FIXED',
        fixedAmountCents: 9000,
        percentageBasisPoints: null,
        servicePriceCents: 8000,
      })
    ).toThrow(/cannot exceed service price/i);
  });

  it('rejects invalid percentage bounds', () => {
    expect(() =>
      calculateDepositAmountCents({
        mode: 'PERCENTAGE',
        fixedAmountCents: null,
        percentageBasisPoints: 0,
        servicePriceCents: 8000,
      })
    ).toThrow(/between 1 and 10000 basis points/i);

    expect(() =>
      calculateDepositAmountCents({
        mode: 'PERCENTAGE',
        fixedAmountCents: null,
        percentageBasisPoints: 10001,
        servicePriceCents: 8000,
      })
    ).toThrow(/between 1 and 10000 basis points/i);
  });
});
