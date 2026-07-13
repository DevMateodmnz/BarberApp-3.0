import { describe, expect, it } from 'vitest';
import {
  generatePublicBookingReference,
  isPublicBookingReference,
} from '../../src/lib/publicBookingReference.js';

describe('publicBookingReference', () => {
  it('generates opaque prefixed references with strong uniqueness characteristics', () => {
    const references = new Set(
      Array.from({ length: 250 }, () => generatePublicBookingReference())
    );

    expect(references.size).toBe(250);

    for (const reference of references) {
      expect(reference).toMatch(/^pb_[A-Z2-7]{16}$/u);
      expect(isPublicBookingReference(reference)).toBe(true);
    }
  });

  it('rejects malformed references', () => {
    expect(isPublicBookingReference('')).toBe(false);
    expect(isPublicBookingReference('pb_123')).toBe(false);
    expect(isPublicBookingReference('pb_abc123abc123abcd')).toBe(false);
    expect(isPublicBookingReference('apt_ABCDEFGHJKLMNPQ')).toBe(false);
  });
});
