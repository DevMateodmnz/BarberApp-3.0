/**
 * Sign-in screen — Clerk email code (OTP) flow.
 *
 * Flow:
 * 1. User enters email → "Send Code" button
 * 2. Clerk sends a 6-digit code to the email
 * 3. User enters code → "Verify" button
 * 4. attemptFirstFactor → setActive({ session: createdSessionId })
 * 5. router.replace('/(tabs)') — explicit navigation after session activation.
 *    app/index.tsx only fires once at app start; it is NOT mounted after
 *    the initial redirect to sign-in, so it cannot trigger a second redirect.
 */
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { SignInScreenView } from '@/components/SignInScreenView.js';
import {
  validateEmail,
  validateCode,
  isEmailCodeFactor,
  extractErrorMessage,
  verifyEmailCode,
} from '../../src/lib/signInHelpers.js';

type ScreenState =
  | { phase: 'email' }
  | { phase: 'sending' }
  | { phase: 'code'; email: string }
  | { phase: 'verifying'; email: string };

export default function SignInScreen() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ phase: 'email' });

  const clearError = useCallback(() => setError(null), []);

  const handleSendCode = useCallback(async () => {
    clearError();

    if (!signIn) {
      setError(t('errors.authUnavailable'));
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setScreenState({ phase: 'sending' });

    try {
      const result = await signIn.create({ identifier: normalizedEmail });

      const emailFactor = isEmailCodeFactor(result.supportedFirstFactors);
      if (!emailFactor || !emailFactor.emailAddressId) {
        setError(t('errors.emailCodeUnavailable'));
        setScreenState({ phase: 'email' });
        return;
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      });

      setScreenState({ phase: 'code', email: normalizedEmail });
    } catch (err) {
      setError(extractErrorMessage(err));
      setScreenState({ phase: 'email' });
    }
  }, [clearError, email, signIn, t]);

  const handleVerify = useCallback(async () => {
    clearError();

    if (!signIn || !setActive) {
      setError(t('errors.authUnavailable'));
      return;
    }

    const codeError = validateCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }

    const trimmedCode = code.trim();
    let verificationSucceeded = false;

    setScreenState((prev) =>
      prev.phase === 'code' ? { phase: 'verifying', email: prev.email } : prev,
    );

    try {
      // Clerk's SignInResource has a stricter union type for attemptFirstFactor
      // than our helper's structural subset. The cast is safe: the runtime call
      // matches the email_code branch of Clerk's union.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await verifyEmailCode(signIn as any, setActive, trimmedCode);

      if (result.outcome === 'error') {
        setError(result.errorMessage!);
        // verificationSucceeded stays false → finally resets the loading state
        return;
      }

      verificationSucceeded = true;
      // Session activated — navigate to the protected tabs area.
      // app/index.tsx is NOT mounted at this point (it was replaced by the
      // initial redirect to sign-in), so we must navigate explicitly.
      router.replace('/(tabs)');
    } catch (err) {
      setError(extractErrorMessage(err));
      // verificationSucceeded stays false → finally resets the loading state
    } finally {
      if (!verificationSucceeded) {
        setScreenState((prev) =>
          prev.phase === 'verifying' ? { phase: 'code', email: prev.email } : prev,
        );
      }
    }
  }, [clearError, code, router, setActive, signIn, t]);

  const handleBackToEmail = useCallback(() => {
    setError(null);
    setCode('');
    setScreenState({ phase: 'email' });
  }, []);

  if (!isLoaded) {
    return (
      <SignInScreenView
        phase="loading"
        email={email}
        destinationEmail=""
        code={code}
        error={error}
        onEmailChange={(value) => {
          setError(null);
          setEmail(value);
        }}
        onCodeChange={(value) => {
          setError(null);
          const digits = value.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
        }}
        onSendCode={handleSendCode}
        onVerify={handleVerify}
        onBackToEmail={handleBackToEmail}
        onOpenLanguageSettings={() => router.push('/language')}
      />
    );
  }

  return (
    <SignInScreenView
      phase={screenState.phase}
      email={email}
      destinationEmail={
        screenState.phase === 'code' || screenState.phase === 'verifying'
          ? screenState.email
          : ''
      }
      code={code}
      error={error}
      onEmailChange={(value) => {
        setError(null);
        setEmail(value);
      }}
      onCodeChange={(value) => {
        setError(null);
        // Only allow digits, max 6
        const digits = value.replace(/\D/g, '').slice(0, 6);
        setCode(digits);
      }}
      onSendCode={handleSendCode}
      onVerify={handleVerify}
      onBackToEmail={handleBackToEmail}
      onOpenLanguageSettings={() => router.push('/language')}
    />
  );
}
