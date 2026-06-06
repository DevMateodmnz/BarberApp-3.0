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

  it('returns deterministic date for a given Date input', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    // January 15, 2026 at noon UTC
    const result = getTodayDateString(new Date('2026-01-15T12:00:00.000Z'));
    expect(result).toBe('2026-01-15');
  });

  it('returns correct date for end-of-month', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    const result = getTodayDateString(new Date('2026-12-31T23:59:59.999Z'));
    expect(result).toBe('2026-12-31');
  });

  it('returns correct date for leap year February 29', async () => {
    const { getTodayDateString } = await import('../../src/lib/format.js');
    const result = getTodayDateString(new Date('2024-02-29T12:00:00.000Z'));
    expect(result).toBe('2024-02-29');
  });
});