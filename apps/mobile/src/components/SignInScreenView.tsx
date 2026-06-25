import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, Screen } from '@/components/ui/index.js';
import { KeyboardAwareScreenContext } from '@/components/ui/Screen.js';
import { APP_NAME } from '@/lib/constants.js';
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
  onOpenLanguageSettings?: () => void;
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
  onOpenLanguageSettings,
}: SignInScreenViewProps) {
  const { t } = useTranslation();

  if (phase === 'loading') {
    return (
      <Screen>
        <View style={styles.centeredState}>
          <AppCard style={styles.stateCard}>
            <ActivityIndicator testID="sign-in-loading" size="large" color={tokens.colors.primary} />
            <Text style={styles.stateTitle}>{t('auth.loadingTitle')}</Text>
            <Text style={styles.stateMessage}>
              {t('auth.loadingMessage')}
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
    <Screen
      scrollable
      keyboardAware
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.content}>
        {onOpenLanguageSettings && (
          <View style={styles.headerAction}>
            <AppButton
              testID="sign-in-language-settings"
              title={t('languageSelector.openFromSignIn')}
              variant="ghost"
              size="sm"
              onPress={onOpenLanguageSettings}
              accessibilityLabel={t('accessibility.languageSettings')}
            />
          </View>
        )}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{APP_NAME}</Text>
          <Text style={styles.heroTitle}>{t('auth.welcomeTitle')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('auth.welcomeSubtitle')}
          </Text>
        </View>

        <AppCard variant="elevated" style={styles.formCard}>
          <Text style={styles.cardTitle}>
            {isEmailPhase ? t('auth.emailPhaseTitle') : t('auth.codePhaseTitle')}
          </Text>
          <Text style={styles.cardSubtitle}>
            {isEmailPhase
              ? t('auth.emailPhaseSubtitle')
              : t('auth.codePhaseSubtitle', { email: destinationEmail })}
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {isEmailPhase && (
            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>{t('common.labels.emailAddress')}</Text>
              <KeyboardAwareScreenContext.Consumer>
                {(keyboardAwareContext) => (
                  <TextInput
                    testID="email-input"
                    style={styles.input}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={tokens.colors.textMuted}
                    value={email}
                    onChangeText={onEmailChange}
                    onFocus={(event) => {
                      keyboardAwareContext?.onInputFocus(
                        typeof event.target === 'number' ? event.target : null,
                      );
                    }}
                    onBlur={(event) => {
                      keyboardAwareContext?.onInputBlur(
                        typeof event.target === 'number' ? event.target : null,
                      );
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSending}
                  />
                )}
              </KeyboardAwareScreenContext.Consumer>

              <AppButton
                testID="sign-in-send-code"
                title={t('common.actions.sendCode')}
                loading={isSending}
                loadingText={t('auth.sending')}
                onPress={onSendCode}
              />
            </View>
          )}

          {isCodePhase && (
            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>{t('common.labels.verificationCode')}</Text>
              <KeyboardAwareScreenContext.Consumer>
                {(keyboardAwareContext) => (
                  <TextInput
                    testID="code-input"
                    style={[styles.input, styles.codeInput]}
                    placeholder={t('auth.codePlaceholder')}
                    placeholderTextColor={tokens.colors.textMuted}
                    value={code}
                    onChangeText={onCodeChange}
                    onFocus={(event) => {
                      keyboardAwareContext?.onInputFocus(
                        typeof event.target === 'number' ? event.target : null,
                      );
                    }}
                    onBlur={(event) => {
                      keyboardAwareContext?.onInputBlur(
                        typeof event.target === 'number' ? event.target : null,
                      );
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!isVerifying}
                  />
                )}
              </KeyboardAwareScreenContext.Consumer>

              <AppButton
                testID="sign-in-verify"
                title={t('common.actions.verify')}
                loading={isVerifying}
                loadingText={t('auth.verifying')}
                onPress={onVerify}
              />
              <AppButton
                testID="sign-in-back"
                title={t('common.actions.changeEmail')}
                variant="ghost"
                onPress={onBackToEmail}
                disabled={isVerifying}
              />
            </View>
          )}
        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  screenContent: {
    justifyContent: 'center',
  },
  content: {
    gap: tokens.spacing[6],
  },
  headerAction: {
    alignItems: 'flex-end',
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
