/**
 * Unit tests for format helpers — PR-028A
 *
 * Tests formatCents and getTodayDateString for deterministic,
 * locale-safe behavior.
 */
import { describe, it, expect } from 'vitest';

// These will be implemented in src/lib/format.ts
// Importing here to confirm the module exists and exports correctly.
// Until implemented, these imports will fail (RED phase).

describe('formatCents', () => {
  it('formats zero cents', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(formatCents(0)).toBe('$0');
  });

  it('formats round thousands with dot separator', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(formatCents(2500)).toBe('$2.500');
  });

  it('formats single-digit cents', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(formatCents(5)).toBe('$5');
  });

  it('formats non-round amounts without decimals', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(formatCents(2501)).toBe('$2.501');
  });

  it('formats large values with dots as thousands separator', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(formatCents(150000)).toBe('$150.000');
  });

  it('throws on negative input', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(() => formatCents(-1)).toThrow('cents must be non-negative');
  });

  it('throws on non-integer input', async () => {
    const { formatCents } = await import('../../src/lib/format.js');
    expect(() => formatCents(2.5 as unknown as number)).toThrow('cents must be an integer');
  });
});



describe('parseCurrencyInputToCents', () => {
  it('parses whole amounts as cents', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('5000')).toBe(500000);
  });

  it('parses dot decimals', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('5000.50')).toBe(500050);
  });

  it('parses comma decimals', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('5000,50')).toBe(500050);
  });

  it('parses zero', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('0')).toBe(0);
  });

  it('parses cents-only decimals', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('0.99')).toBe(99);
  });

  it('fails on empty input', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('')).toBeNull();
  });

  it('fails on non-numeric input', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('abc')).toBeNull();
  });

  it('fails on negative input', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('-1')).toBeNull();
  });

  it('fails on more than two decimal places with dot', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('10.999')).toBeNull();
  });

  it('fails on more than two decimal places with comma', async () => {
    const { parseCurrencyInputToCents } = await import('../../src/lib/format.js');
    expect(parseCurrencyInputToCents('10,999')).toBeNull();
  });
});

describe('formatCentsForInput', () => {
  it('formats round amounts without decimals', async () => {
    const { formatCentsForInput } = await import('../../src/lib/format.js');
    expect(formatCentsForInput(500000)).toBe('5000');
  });

  it('formats non-round amounts with two decimals', async () => {
    const { formatCentsForInput } = await import('../../src/lib/format.js');
    expect(formatCentsForInput(500050)).toBe('5000.50');
  });

  it('formats sub-unit amounts with leading zero', async () => {
    const { formatCentsForInput } = await import('../../src/lib/format.js');
    expect(formatCentsForInput(99)).toBe('0.99');
  });
});

describe('formatPaymentMethodLabel', () => {
  it('maps CASH to Cash', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel('CASH')).toBe('Cash');
  });

  it('maps CARD to Card', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel('CARD')).toBe('Card');
  });

  it('maps TRANSFER to Transfer', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel('TRANSFER')).toBe('Transfer');
  });

  it('maps OTHER to Other', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel('OTHER')).toBe('Other');
  });

  it('maps null to Unspecified', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel(null)).toBe('Unspecified');
  });

  it('maps undefined to Unspecified', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel(undefined)).toBe('Unspecified');
  });

  it('maps unknown strings to Unspecified', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(formatPaymentMethodLabel('CRYPTO')).toBe('Unspecified');
  });

  it('does not throw on unexpected input', async () => {
    const { formatPaymentMethodLabel } = await import('../../src/lib/format.js');
    expect(() => formatPaymentMethodLabel({ method: 'CASH' })).not.toThrow();
    expect(formatPaymentMethodLabel({ method: 'CASH' })).toBe('Unspecified');
  });
});

describe('getTodayDateString', () => {
  it('returns YYYY-MM-DD format for current date', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    const result = getTodayDateString();
    // Must match YYYY-MM-DD pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns local date for a Date constructed with local time fields', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // new Date(2026, 0, 15) creates Jan 15, 2026 in LOCAL time at midnight.
    // This should always return '2026-01-15' regardless of timezone
    // because we're using local calendar fields, not UTC.
    const result = getTodayDateString(new Date(2026, 0, 15));
    expect(result).toBe('2026-01-15');
  });

  it('returns correct date for end-of-month local time', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // Dec 31, 2026 at 23:59 local — should always be '2026-12-31'
    const result = getTodayDateString(new Date(2026, 11, 31, 23, 59, 59));
    expect(result).toBe('2026-12-31');
  });

  it('returns correct date for leap year February 29 local time', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // Feb 29, 2024 local time — should always be '2024-02-29'
    const result = getTodayDateString(new Date(2024, 1, 29, 12, 0, 0));
    expect(result).toBe('2024-02-29');
  });

  it('uses local date fields, not UTC (regression test)', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // Create a date that is Jan 16 02:00 UTC.
    // In UTC-3 (Argentina), this is Jan 15 23:00 local.
    // A UTC-based implementation would return '2026-01-16'.
    // A correct local-date implementation should return '2026-01-15'
    // when the local calendar says January 15.
    //
    // We can't easily control the test runner's timezone,
    // so we test the implementation's approach: verify that
    // getFullYear/getMonth/getDate are used (local) not
    // getUTCFullYear/getUTCMonth/getUTCDate.
    //
    // Instead, we verify local constructor dates are preserved:
    const localDate = new Date(2026, 0, 15, 23, 30, 0);
    expect(getTodayDateString(localDate)).toBe('2026-01-15');
  });

  it('pads single-digit month and day with leading zeros', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // Jan 5 local — month 1, day 5 should be zero-padded
    const result = getTodayDateString(new Date(2026, 0, 5));
    expect(result).toBe('2026-01-05');
  });
});

// ============================================================================
// addDaysToDateString — MS-001
// Tests for the new date arithmetic helper.
// These functions do NOT exist yet — RED phase.
// ============================================================================

describe('addDaysToDateString', () => {
  // S1: Previous day within same month
  it('subtracts one day within same month (S1)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-01-15', -1)).toBe('2026-01-14');
  });

  // S2: Next day crossing month boundary
  it('adds one day crossing month boundary (S2)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-01-31', 1)).toBe('2026-02-01');
  });

  // S3: Previous day crossing month boundary (non-leap year)
  it('subtracts one day crossing month boundary in non-leap year (S3)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28');
  });

  // S4: Previous day crossing month boundary in leap year
  it('subtracts one day crossing month boundary in leap year (S4)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2028-03-01', -1)).toBe('2028-02-29');
  });

  // S5: Zero-day offset (identity)
  it('returns same date for zero offset (S5)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-01-01', 0)).toBe('2026-01-01');
  });

  // S6: Next day crossing year boundary
  it('adds one day crossing year boundary (S6)', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
  });

  // Edge: multi-day offset forward
  it('adds multiple days forward', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-06-01', 7)).toBe('2026-06-08');
  });

  // Edge: multi-day offset backward
  it('subtracts multiple days backward across months', async () => {
    const { addDaysToDateString } = await import('../../src/lib/format.js');
    expect(addDaysToDateString('2026-03-10', -15)).toBe('2026-02-23');
  });
});

// ============================================================================
// isTodayDateString — MS-002
// ============================================================================

describe('isTodayDateString', () => {
  it('returns true for today\'s date', async () => {
    const { getTodayDateString, isTodayDateString } = await import('../../src/lib/format.js');
    const today = getTodayDateString();
    expect(isTodayDateString(today)).toBe(true);
  });

  it('returns false for a past date', async () => {
    const { isTodayDateString } = await import('../../src/lib/format.js');
    expect(isTodayDateString('2020-01-01')).toBe(false);
  });

  it('returns false for a future date', async () => {
    const { isTodayDateString } = await import('../../src/lib/format.js');
    expect(isTodayDateString('2030-12-31')).toBe(false);
  });
});
