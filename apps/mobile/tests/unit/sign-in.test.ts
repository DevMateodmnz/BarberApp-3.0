/**
 * Unit tests for SignIn helpers (email validation, code validation, error extraction,
 * and email-code verification logic).
 *
 * Pure logic tests — no React rendering. Matches the repo's existing test pattern.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateEmail,
  validateCode,
  extractErrorMessage,
  isEmailCodeFactor,
  verifyEmailCode,
  type ClerkSignInLike,
  type ClerkSetActiveFn,
} from '../../src/lib/signInHelpers';

describe('validateEmail', () => {
  it('rejects empty string', () => {
    expect(validateEmail('')).toBe('Please enter your email address.');
    expect(validateEmail('   ')).toBe('Please enter your email address.');
  });

  it('rejects invalid formats', () => {
    expect(validateEmail('notanemail')).toBe('Please enter a valid email address.');
    expect(validateEmail('missing@')).toBe('Please enter a valid email address.');
    expect(validateEmail('@nodomain')).toBe('Please enter a valid email address.');
  });

  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBeNull();
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('test.user+tag@domain.org')).toBeNull();
  });

  it('normalizes whitespace before validation', () => {
    expect(validateEmail('  user@example.com  ')).toBeNull();
    expect(validateEmail('  ')).toBe('Please enter your email address.');
  });
});

describe('validateCode', () => {
  it('rejects empty code', () => {
    expect(validateCode('')).toBe('Please enter the 6-digit code.');
  });

  it('rejects non-numeric code', () => {
    expect(validateCode('abcdef')).toBe('Please enter a valid 6-digit code.');
    expect(validateCode('12345a')).toBe('Please enter a valid 6-digit code.');
  });

  it('rejects short code', () => {
    expect(validateCode('123')).toBe('Please enter a valid 6-digit code.');
    expect(validateCode('12345')).toBe('Please enter a valid 6-digit code.');
  });

  it('rejects long code', () => {
    expect(validateCode('1234567')).toBe('Please enter a valid 6-digit code.');
  });

  it('accepts valid 6-digit code', () => {
    expect(validateCode('123456')).toBeNull();
    expect(validateCode('000000')).toBeNull();
    expect(validateCode('999999')).toBeNull();
  });
});

describe('isEmailCodeFactor', () => {
  it('finds email_code factor in supported factors', () => {
    const factors = [
      { strategy: 'password' as const },
      { strategy: 'email_code' as const, emailAddressId: 'eml_1', safeIdentifier: 'u@e.com' },
    ];
    const result = isEmailCodeFactor(factors);
    expect(result).toEqual({
      strategy: 'email_code',
      emailAddressId: 'eml_1',
      safeIdentifier: 'u@e.com',
    });
  });

  it('returns undefined when no email_code factor', () => {
    expect(isEmailCodeFactor([{ strategy: 'password' as const }])).toBeUndefined();
    expect(isEmailCodeFactor([])).toBeUndefined();
    expect(isEmailCodeFactor(null)).toBeUndefined();
  });
});

describe('extractErrorMessage', () => {
  it('extracts message from Clerk API error', () => {
    const error = new Error('Clerk error');
    (error as Record<string, unknown>).errors = [
      { message: 'No account found with this email.' },
    ];
    expect(extractErrorMessage(error)).toBe(
      'We could not sign you in. Please try again. [No account found with this email.]',
    );
  });

  it('uses first error message when multiple', () => {
    const error = new Error('Clerk error');
    (error as Record<string, unknown>).errors = [
      { message: 'First error' },
      { message: 'Second error' },
    ];
    expect(extractErrorMessage(error)).toBe(
      'We could not sign you in. Please try again. [First error]',
    );
  });

  it('uses Error.message as fallback', () => {
    const error = new Error('Network failure');
    expect(extractErrorMessage(error)).toBe(
      'We could not sign you in. Please try again. [Network failure]',
    );
  });

  it('returns default message for non-Error objects', () => {
    expect(extractErrorMessage('string error')).toBe('We could not sign you in. Please try again.');
    expect(extractErrorMessage(null)).toBe('We could not sign you in. Please try again.');
    expect(extractErrorMessage(undefined)).toBe('We could not sign you in. Please try again.');
  });
});

// ---- verifyEmailCode tests ----

function mockSignIn(overrides?: {
  status?: string;
  createdSessionId?: string | null;
}): ClerkSignInLike {
  // Use explicit property check instead of ?? so we can pass null/undefined.
  const explicitCreatedSessionId =
    overrides && 'createdSessionId' in overrides;
  return {
    attemptFirstFactor: vi.fn().mockResolvedValue({
      status: overrides?.status ?? 'complete',
      createdSessionId: explicitCreatedSessionId
        ? overrides!.createdSessionId
        : 'sess_abc123',
    }),
  };
}

function mockSetActive(): ClerkSetActiveFn {
  return vi.fn(async (_params: { session: string }) => {
    // no-op; tests inspect call count/args
  }) as unknown as ClerkSetActiveFn;
}

describe('verifyEmailCode', () => {
  it('calls setActive with the createdSessionId on success', async () => {
    const signIn = mockSignIn({ status: 'complete', createdSessionId: 'sess_test123' });
    const setActive = mockSetActive();

    const result = await verifyEmailCode(signIn, setActive, '123456');

    expect(result.outcome).toBe('success');
    expect(result.errorMessage).toBeUndefined();
    expect(signIn.attemptFirstFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      code: '123456',
    });
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_test123' });
    expect(setActive).toHaveBeenCalledTimes(1);
  });

  it('returns error when createdSessionId is null', async () => {
    const signIn = mockSignIn({ status: 'complete', createdSessionId: null });
    const setActive = mockSetActive();

    const result = await verifyEmailCode(signIn, setActive, '654321');

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toBe(
      'Verification completed, but no session was created. Please try again.',
    );
    expect(setActive).not.toHaveBeenCalled();
  });

  it('returns error when createdSessionId is missing (undefined)', async () => {
    const signIn = mockSignIn({ status: 'complete', createdSessionId: undefined });
    const setActive = mockSetActive();

    const result = await verifyEmailCode(signIn, setActive, '000000');

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toContain('no session was created');
    expect(setActive).not.toHaveBeenCalled();
  });

  it('returns error when status is not "complete"', async () => {
    const signIn = mockSignIn({ status: 'needs_second_factor', createdSessionId: 'sess_999' });
    const setActive = mockSetActive();

    const result = await verifyEmailCode(signIn, setActive, '111111');

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toBe(
      'The sign-in status was unexpected. Please try again. [needs_second_factor]',
    );
    expect(setActive).not.toHaveBeenCalled();
  });

  it('returns error for unknown non-complete status', async () => {
    const signIn = mockSignIn({ status: 'abandoned', createdSessionId: null });
    const setActive = mockSetActive();

    const result = await verifyEmailCode(signIn, setActive, '222222');

    expect(result.outcome).toBe('error');
    expect(result.errorMessage).toContain('[abandoned]');
    expect(setActive).not.toHaveBeenCalled();
  });

  it('propagates exceptions from attemptFirstFactor', async () => {
    const networkError = new Error('Network failure');
    const signIn: ClerkSignInLike = {
      attemptFirstFactor: vi.fn().mockRejectedValue(networkError),
    };
    const setActive = mockSetActive();

    await expect(verifyEmailCode(signIn, setActive, '333333')).rejects.toThrow('Network failure');
    expect(setActive).not.toHaveBeenCalled();
  });

  it('propagates exceptions from setActive (session activation failure)', async () => {
    const signIn = mockSignIn({ status: 'complete', createdSessionId: 'sess_bad' });
    const activationError = new Error('Failed to activate session');
    const setActive = vi.fn().mockRejectedValue(activationError) as unknown as ClerkSetActiveFn;

    await expect(verifyEmailCode(signIn, setActive, '444444')).rejects.toThrow(
      'Failed to activate session',
    );
    expect(signIn.attemptFirstFactor).toHaveBeenCalledTimes(1);
  });
});
