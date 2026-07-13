import { describe, expect, it } from 'vitest';
import {
  CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
  getPublicBookingConsent,
} from '../../src/lib/publicBookingConsent.js';

describe('publicBookingConsent', () => {
  it('returns a stable versioned consent payload for the public flow', () => {
    const consent = getPublicBookingConsent();

    expect(consent.version).toBe(CURRENT_PUBLIC_BOOKING_CONSENT_VERSION);
    expect(consent.text).toContain('turno');
    expect(consent.text).toContain('datos');
    expect(consent.text.length).toBeGreaterThan(20);
  });
});
