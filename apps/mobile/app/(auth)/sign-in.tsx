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
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
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
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ phase: 'email' });

  const clearError = useCallback(() => setError(null), []);

  const handleSendCode = useCallback(async () => {
    clearError();

    if (!signIn) {
      setError('Sign-in is not available. Please try again later.');
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
        setError('Email code sign-in is not available. Please contact support.');
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
  }, [email, signIn, clearError]);

  const handleVerify = useCallback(async () => {
    clearError();

    if (!signIn || !setActive) {
      setError('Sign-in is not available. Please try again later.');
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
  }, [code, signIn, setActive, clearError, router]);

  const handleBackToEmail = useCallback(() => {
    setError(null);
    setCode('');
    setScreenState({ phase: 'email' });
  }, []);

  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="sign-in-loading" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>BarberApp</Text>

        {screenState.phase === 'email' || screenState.phase === 'sending' ? (
          <>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={(text) => {
                setError(null);
                setEmail(text);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={screenState.phase !== 'sending'}
              testID="email-input"
            />

            {screenState.phase === 'sending' ? (
              <ActivityIndicator style={styles.loading} size="small" />
            ) : (
              <Pressable style={styles.button} onPress={handleSendCode}>
                <Text style={styles.buttonText}>Send Code</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter the code sent to {screenState.email}
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor="#999"
              value={code}
              onChangeText={(text) => {
                setError(null);
                // Only allow digits, max 6
                const digits = text.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
              }}
              keyboardType="number-pad"
              maxLength={6}
              editable={screenState.phase !== 'verifying'}
              testID="code-input"
            />

            {screenState.phase === 'verifying' ? (
              <ActivityIndicator style={styles.loading} size="small" />
            ) : (
              <View style={styles.codeButtons}>
                <Pressable style={styles.button} onPress={handleVerify}>
                  <Text style={styles.buttonText}>Verify</Text>
                </Pressable>
                <Pressable style={styles.linkButton} onPress={handleBackToEmail}>
                  <Text style={styles.linkText}>Back</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  error: {
    color: '#D32F2F',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: 300,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  codeInput: {
    width: 160,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loading: {
    marginTop: 8,
  },
  codeButtons: {
    alignItems: 'center',
    gap: 12,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },
});
