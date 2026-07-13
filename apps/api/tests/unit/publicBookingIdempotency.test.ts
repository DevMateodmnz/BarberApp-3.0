import { describe, expect, it } from 'vitest';
import {
  PUBLIC_BOOKING_CREATE_OPERATION,
  fingerprintPublicBookingRequest,
  validatePublicBookingIdempotencyKey,
} from '../../src/lib/publicBookingIdempotency.js';

describe('publicBookingIdempotency', () => {
  it('accepts conservative idempotency keys for public booking create', () => {
    expect(validatePublicBookingIdempotencyKey('ABCD1234_-token')).toBe(
      'ABCD1234_-token'
    );
    expect(PUBLIC_BOOKING_CREATE_OPERATION).toBe('public-booking-create');
  });

  it('rejects missing or unsafe idempotency keys', () => {
    expect(() => validatePublicBookingIdempotencyKey('')).toThrow(
      /Idempotency-Key/i
    );
    expect(() => validatePublicBookingIdempotencyKey('short')).toThrow(
      /Idempotency-Key/i
    );
    expect(() => validatePublicBookingIdempotencyKey('bad key with spaces')).toThrow(
      /Idempotency-Key/i
    );
  });

  it('fingerprints normalized public booking payloads deterministically', () => {
    const base = {
      barbershopId: 'shop_123',
      serviceId: 'svc_123',
      barberId: 'barber_123',
      startAt: '2026-07-20T12:00:00.000Z',
      clientName: 'Mateo Domínguez',
      clientPhone: '+543811234567',
      notes: null,
      consentVersion: 'public-booking-v1',
    };

    const a = fingerprintPublicBookingRequest(base);
    const b = fingerprintPublicBookingRequest({
      ...base,
      clientName: 'Mateo Domínguez',
      notes: null,
    });
    const c = fingerprintPublicBookingRequest({
      ...base,
      notes: 'Prefiere tijera',
    });

    expect(a).toMatch(/^[a-f0-9]{64}$/u);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});
