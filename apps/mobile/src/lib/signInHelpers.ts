/**
 * Pure helper functions for the Clerk email code sign-in flow.
 *
 * Extracted for testability — no React or Clerk imports.
 * All Clerk types are represented as minimal interfaces so this module
 * stays framework-agnostic.
 */

// ---- Minimal Clerk interfaces (no runtime dependency) ----

/** Subset of Clerk's SignIn resource needed for verification. */
export interface ClerkSignInLike {
  attemptFirstFactor(params: {
    strategy: string;
    code: string;
  }): Promise<{
    status: string;
    createdSessionId?: string | null;
  }>;
}

/** Subset of Clerk's setActive function signature. */
export type ClerkSetActiveFn = (params: { session: string }) => Promise<void>;

/** Basic email format validation. */
export function validateEmail(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return translate('validation.emailRequired');
  }
  // Simple regex: something@something.something
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(trimmed)) {
    return translate('validation.emailInvalid');
  }
  return null;
}

/** Validate a 6-digit code: must be exactly 6 numeric digits. */
export function validateCode(input: string): string | null {
  if (!input || input.length === 0) {
    return translate('validation.codeRequired');
  }
  if (!/^\d{6}$/.test(input)) {
    return translate('validation.codeInvalid');
  }
  return null;
}

/** Supported factor shape we care about. */
interface EmailCodeFactorLike {
  strategy: string;
  emailAddressId?: string;
  safeIdentifier?: string;
}

/**
 * Find the email_code factor in the first factors list.
 * Returns it if found, undefined otherwise.
 */
export function isEmailCodeFactor(
  factors: ReadonlyArray<EmailCodeFactorLike> | null | undefined,
): EmailCodeFactorLike | undefined {
  if (!factors) return undefined;
  return factors.find((f) => f.strategy === 'email_code');
}

/**
 * Extract a human-readable error message from a caught error.
 * Handles Clerk API errors (`err.errors[0].message`), plain Error objects,
 * and unknown types. Never returns undefined.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const clerkErr = error as Error & { errors?: Array<{ message: string }> };
    if (clerkErr.errors && clerkErr.errors.length > 0 && clerkErr.errors[0]) {
      if (process.env.NODE_ENV !== 'production') {
        return `${translate('errors.signInGeneric')} [${clerkErr.errors[0].message}]`;
      }
      return translate('errors.signInGeneric');
    }
    if (process.env.NODE_ENV !== 'production') {
      return `${translate('errors.signInGeneric')} [${error.message}]`;
    }
    return translate('errors.signInGeneric');
  }
  return translate('errors.signInGeneric');
}

/** Result of an email-code verification attempt. */
export interface VerifyCodeResult {
  outcome: 'success' | 'error';
  errorMessage?: string;
}

/**
 * Call Clerk's attemptFirstFactor with email_code and activate the session on success.
 *
 * This function isolates the core verification + session-activation logic
 * so it can be tested independently of React.
 */
export async function verifyEmailCode(
  signIn: ClerkSignInLike,
  setActive: ClerkSetActiveFn,
  code: string,
): Promise<VerifyCodeResult> {
  const result = await signIn.attemptFirstFactor({
    strategy: 'email_code',
    code,
  });

  if (result.status !== 'complete') {
    return {
      outcome: 'error',
      errorMessage:
        process.env.NODE_ENV !== 'production'
          ? `${translate('errors.verificationUnexpectedStatus')} [${result.status}]`
          : translate('errors.verificationUnexpectedStatus'),
    };
  }

  if (!result.createdSessionId) {
    return {
      outcome: 'error',
      errorMessage: translate('errors.verificationMissingSession'),
    };
  }

  await setActive({ session: result.createdSessionId });
  return { outcome: 'success' };
}
import { translate } from '@/i18n/helpers.js';
