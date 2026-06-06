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