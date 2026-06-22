import { describe, expect, it } from 'vitest';

import {
  assertSafeLocalDatabaseUrl,
  DEFAULT_QA_BARBER_EMAIL,
  DEFAULT_QA_BARBERSHOP_NAME,
  DEFAULT_QA_OWNER_EMAIL,
  formatMaskedSummary,
  isPlaceholderValue,
  isValidClerkUserId,
  maskClerkUserId,
  maskEmail,
  readQaBootstrapConfig,
  resolveCandidate,
} from '../../src/lib/qaBootstrap.js';

describe('qa bootstrap config', () => {
  it('parses the minimum valid configuration', () => {
    const config = readQaBootstrapConfig({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/barberapp',
      QA_OWNER_CLERK_USER_ID: 'user_OWNER123',
      QA_BARBER_CLERK_USER_ID: 'user_BARBER456',
    });

    expect(config.qaBarbershopName).toBe(DEFAULT_QA_BARBERSHOP_NAME);
    expect(config.owner.managedEmail).toBe(DEFAULT_QA_OWNER_EMAIL);
    expect(config.barber.managedEmail).toBe(DEFAULT_QA_BARBER_EMAIL);
  });

  it('rejects placeholder Clerk IDs', () => {
    expect(() => readQaBootstrapConfig({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/barberapp',
      QA_OWNER_CLERK_USER_ID: 'user_OWNER_CLERK_ID',
      QA_BARBER_CLERK_USER_ID: 'user_BARBER456',
    })).toThrow(/QA_OWNER_CLERK_USER_ID/);
  });

  it('rejects invalid Clerk ID format', () => {
    expect(() => readQaBootstrapConfig({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/barberapp',
      QA_OWNER_CLERK_USER_ID: 'owner_123',
      QA_BARBER_CLERK_USER_ID: 'user_BARBER456',
    })).toThrow(/must match the Clerk user ID format/);
  });

  it('detects placeholder fragments', () => {
    expect(isPlaceholderValue('user_OWNER_CLERK_ID')).toBe(true);
    expect(isPlaceholderValue('changeMe')).toBe(true);
    expect(isPlaceholderValue('user_real123')).toBe(false);
  });

  it('validates Clerk user IDs', () => {
    expect(isValidClerkUserId('user_abc123XYZ')).toBe(true);
    expect(isValidClerkUserId('invalid-user')).toBe(false);
  });
});

describe('qa bootstrap safety guard', () => {
  it('allows loopback databases', () => {
    expect(() => assertSafeLocalDatabaseUrl(
      'postgresql://postgres:postgres@localhost:5432/barberapp',
      false,
    )).not.toThrow();
  });

  it('rejects remote databases by default', () => {
    expect(() => assertSafeLocalDatabaseUrl(
      'postgresql://postgres:postgres@db.example.com:5432/barberapp',
      false,
    )).toThrow(/refuses non-local database host/i);
  });

  it('rejects production-looking database names', () => {
    expect(() => assertSafeLocalDatabaseUrl(
      'postgresql://postgres:postgres@localhost:5432/barberapp_production',
      false,
    )).toThrow(/production-like/i);
  });

  it('rejects execution when NODE_ENV is production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      expect(() => assertSafeLocalDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5432/barberapp',
        false,
      )).toThrow(/NODE_ENV=production/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe('qa bootstrap candidate resolution', () => {
  it('reuses a single matching candidate deterministically', () => {
    const resolved = resolveCandidate({
      clerkIdMatches: ['user-1'],
      managedEmailMatches: ['user-1'],
    });

    expect(resolved).toEqual({ action: 'reuse', candidateId: 'user-1' });
  });

  it('requests creation when nothing matches', () => {
    expect(resolveCandidate({})).toEqual({ action: 'create' });
  });

  it('rejects ambiguous matches', () => {
    expect(() => resolveCandidate({
      clerkIdMatches: ['user-1'],
      managedEmailMatches: ['user-2'],
    })).toThrow(/Ambiguous QA entity selection/);
  });
});

describe('qa bootstrap masked output', () => {
  it('masks Clerk IDs and emails', () => {
    expect(maskClerkUserId('user_TestOwner123456789')).toMatch(/^user_Test/i);
    expect(maskEmail('owner.qa@example.com')).toBe('ow***@ex***.com');
  });

  it('formats a masked summary without raw identifiers', () => {
    const summary = formatMaskedSummary({
      qaBarbershopName: 'QA Barbershop',
      ownerClerkUserId: maskClerkUserId('user_OWNER123456'),
      ownerEmail: maskEmail('owner@example.com'),
      barberClerkUserId: maskClerkUserId('user_BARBER123456'),
      barberEmail: maskEmail('barber@example.com'),
    });

    expect(summary).toContain('QA barbershop: QA Barbershop');
    expect(summary).not.toContain('owner@example.com');
    expect(summary).not.toContain('barber@example.com');
  });
});
