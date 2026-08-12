import { describe, expect, it } from 'vitest';
import {
  calculatePromotionDiscountCents,
  normalizePromotionCode,
} from '../../src/services/promotionService.js';

describe('promotionService money rules', () => {
  it('normalizes codes safely', () => {
    expect(normalizePromotionCode(' bienvenida 10 ')).toBe('BIENVENIDA10');
  });

  it('caps fixed discounts at the service price', () => {
    expect(
      calculatePromotionDiscountCents({
        discountType: 'FIXED',
        fixedDiscountCents: 5_000,
        percentageBasisPoints: null,
        servicePriceCents: 3_200,
      })
    ).toEqual({
      servicePriceCents: 3_200,
      discountCents: 3_200,
      finalPriceCents: 0,
    });
  });

  it('rounds percentage discounts deterministically with integer cents', () => {
    expect(
      calculatePromotionDiscountCents({
        discountType: 'PERCENTAGE',
        fixedDiscountCents: null,
        percentageBasisPoints: 2_500,
        servicePriceCents: 3_333,
      })
    ).toEqual({
      servicePriceCents: 3_333,
      discountCents: 833,
      finalPriceCents: 2_500,
    });
  });

  it('supports one-basis-point boundaries without floating point drift', () => {
    expect(
      calculatePromotionDiscountCents({
        discountType: 'PERCENTAGE',
        fixedDiscountCents: null,
        percentageBasisPoints: 1,
        servicePriceCents: 1,
      })
    ).toEqual({
      servicePriceCents: 1,
      discountCents: 0,
      finalPriceCents: 1,
    });
  });
});
