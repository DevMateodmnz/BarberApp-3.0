import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, AppCard, Screen } from '@/components/ui/index.js';
import { tokens } from '@/theme/index.js';

type SignInPhase = 'loading' | 'email' | 'sending' | 'code' | 'verifying';

export interface SignInScreenViewProps {
  phase: SignInPhase;
  email: string;
  destinationEmail: string;
  code: string;
  error: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
  onVerify: () => void;
  onBackToEmail: () => void;
}

export function SignInScreenView({
  phase,
  email,
  destinationEmail,
  code,
  error,
  onEmailChange,
  onCodeChange,
  onSendCode,
  onVerify,
  onBackToEmail,
}: SignInScreenViewProps) {
  if (phase === 'loading') {
    return (
      <Screen>
        <View style={styles.centeredState}>
          <AppCard style={styles.stateCard}>
            <ActivityIndicator testID="sign-in-loading" size="large" color={tokens.colors.primary} />
            <Text style={styles.stateTitle}>Loading sign-in</Text>
            <Text style={styles.stateMessage}>
              Preparing secure email-code authentication…
            </Text>
          </AppCard>
        </View>
      </Screen>
    );
  }

  const isEmailPhase = phase === 'email' || phase === 'sending';
  const isCodePhase = phase === 'code' || phase === 'verifying';
  const isSending = phase === 'sending';
  const isVerifying = phase === 'verifying';

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>BarberApp</Text>
            <Text style={styles.heroTitle}>Welcome back</Text>
            <Text style={styles.heroSubtitle}>
              Sign in with the email code we send to your inbox.
            </Text>
          </View>

          <AppCard variant="elevated" style={styles.formCard}>
            <Text style={styles.cardTitle}>
              {isEmailPhase ? 'Enter your email' : 'Check your email'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {isEmailPhase
                ? 'We will send a 6-digit code so you can continue securely.'
                : `Enter the 6-digit code sent to ${destinationEmail}.`}
            </Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            {isEmailPhase && (
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Email address</Text>
                <TextInput
                  testID="email-input"
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor={tokens.colors.textMuted}
                  value={email}
                  onChangeText={onEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSending}
                />

                <AppButton
                  testID="sign-in-send-code"
                  title="Send Code"
                  loading={isSending}
                  loadingText="Sending…"
                  onPress={onSendCode}
                />
              </View>
            )}

            {isCodePhase && (
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Verification code</Text>
                <TextInput
                  testID="code-input"
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor={tokens.colors.textMuted}
                  value={code}
                  onChangeText={onCodeChange}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isVerifying}
                />

                <AppButton
                  testID="sign-in-verify"
                  title="Verify"
                  loading={isVerifying}
                  loadingText="Verifying…"
                  onPress={onVerify}
                />
                <AppButton
                  testID="sign-in-back"
                  title="Back"
                  variant="ghost"
                  onPress={onBackToEmail}
                  disabled={isVerifying}
                />
              </View>
            )}
          </AppCard>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing[4],
  },
  stateCard: {
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingVertical: tokens.spacing[8],
  },
  stateTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  stateMessage: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing[4],
    gap: tokens.spacing[6],
  },
  hero: {
    gap: tokens.spacing[2],
  },
  eyebrow: {
    ...tokens.typography.variant.label,
    color: tokens.colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    ...tokens.typography.variant.title,
    color: tokens.colors.textPrimary,
  },
  heroSubtitle: {
    ...tokens.typography.variant.body,
    color: tokens.colors.textSecondary,
    maxWidth: 420,
  },
  formCard: {
    gap: tokens.spacing[4],
  },
  cardTitle: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
  },
  cardSubtitle: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
  },
  errorText: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.error,
  },
  formSection: {
    gap: tokens.spacing[4],
  },
  inputLabel: {
    ...tokens.typography.variant.label,
    color: tokens.colors.textSecondary,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceVariant,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    ...tokens.typography.variant.body,
    color: tokens.colors.textPrimary,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: tokens.typography.size['2xl'],
    lineHeight: tokens.typography.lineHeight['2xl'],
    letterSpacing: 8,
  },
});
