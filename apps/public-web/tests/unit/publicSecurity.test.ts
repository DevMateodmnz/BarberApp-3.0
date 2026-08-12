import { describe, expect, it } from 'vitest';
import { sanitizePublicApiPath } from '@/lib/api/sanitizePath';
// @ts-expect-error The runtime-only Next.js config helper intentionally has no TS declaration.
import { PUBLIC_SECURITY_HEADERS } from '../../lib/securityHeaders.mjs';

describe('public booking transport security', () => {
  it('redacts bearer booking references from path and query-shaped log values', () => {
    const reference = 'pb_ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, 23);
    const path = `/public/barbershops/demo/bookings/${reference}/payment?ref=${reference}`;

    const sanitized = sanitizePublicApiPath(path);

    expect(sanitized).not.toContain(reference);
    expect(sanitized).toBe(
      '/public/barbershops/demo/bookings/[public-reference]/payment?ref=[public-reference]'
    );
  });

  it('keeps non-sensitive route shape intact', () => {
    expect(sanitizePublicApiPath('/public/barbershops/demo/services?active=true')).toBe(
      '/public/barbershops/demo/services?active=true'
    );
  });

  it('sets a no-referrer policy and baseline browser hardening headers', () => {
    expect(PUBLIC_SECURITY_HEADERS).toEqual(expect.arrayContaining([
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]));
  });
});
