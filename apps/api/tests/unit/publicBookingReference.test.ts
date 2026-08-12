import { describe, expect, it } from 'vitest';
import {
  generatePublicBookingReference,
  isPublicBookingReference,
  PUBLIC_BOOKING_REFERENCE_ENTROPY_BYTES,
} from '../../src/lib/publicBookingReference.js';

const ENTROPY_BITS = PUBLIC_BOOKING_REFERENCE_ENTROPY_BYTES * 8;

describe('publicBookingReference', () => {
  it('exposes at least 96 bits of CSPRNG entropy', () => {
    // Hard guarantee: a bearer credential for a public endpoint must
    // be unguessable. 96 bits is the documented security floor; if
    // anyone ever reduces this, the assertion fires immediately.
    expect(ENTROPY_BITS).toBeGreaterThanOrEqual(96);
  });

  it('generates opaque prefixed references with strong uniqueness characteristics', () => {
    const references = new Set(
      Array.from({ length: 250 }, () => generatePublicBookingReference())
    );

    // 250 random samples, 0 collisions expected at 96 bits.
    expect(references.size).toBe(250);

    for (const reference of references) {
      expect(reference).toMatch(/^pb_[A-Z2-7]{20}$/u);
      expect(isPublicBookingReference(reference)).toBe(true);
    }
  });

  it('rejects malformed references', () => {
    expect(isPublicBookingReference('')).toBe(false);
    expect(isPublicBookingReference('pb_123')).toBe(false);
    expect(isPublicBookingReference('pb_abc123abc123abcd')).toBe(false);
    // 16-char legacy references are no longer accepted.
    expect(isPublicBookingReference('pb_AAAAAAAAAAAAAAAA')).toBe(false);
    // Lowercase is rejected (alphabet is uppercase + 2-7).
    expect(isPublicBookingReference('pb_aaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isPublicBookingReference('apt_ABCDEFGHJKLMNPQRSTUVW')).toBe(false);
  });

  it('does not embed sequential or guessable substrings', () => {
    // Sample a batch and check that the post-prefix body does not
    // look like an incrementing counter. A real CSPRNG output has
    // no monotonic relationship between consecutive samples.
    const samples = Array.from({ length: 50 }, () =>
      generatePublicBookingReference().slice(3)
    );
    // Two samples should not share a long prefix. (Probability of
    // any 6-char prefix collision across 50 samples is tiny.)
    const sixPrefixes = new Set(samples.map((s) => s.slice(0, 6)));
    expect(sixPrefixes.size).toBeGreaterThan(45);
  });
});
