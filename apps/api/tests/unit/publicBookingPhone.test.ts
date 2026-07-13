import { describe, expect, it } from 'vitest';
import { normalizePublicBookingPhone } from '../../src/lib/publicBookingPhone.js';

describe('publicBookingPhone', () => {
  it('accepts a trimmed canonical E.164-compatible phone number', () => {
    expect(normalizePublicBookingPhone('  +543811234567  ')).toBe(
      '+543811234567'
    );
  });

  it('rejects blank or noncanonical phone formats', () => {
    expect(() => normalizePublicBookingPhone('')).toThrow(/phone/i);
    expect(() => normalizePublicBookingPhone('3811234567')).toThrow(/E\.164/i);
    expect(() => normalizePublicBookingPhone('+54 381 123 4567')).toThrow(
      /E\.164/i
    );
    expect(() => normalizePublicBookingPhone('+01')).toThrow(/phone/i);
  });
});
