import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';

import {
  AppButton,
  AppCard,
  ListItem,
  Screen,
  ScreenHeader,
} from '@/components/ui/index.js';
import {
  getLocalizedLanguageLabel,
  getSystemLocalePreferenceValue,
  useLocalization,
} from '@/i18n/index.js';
import { tokens } from '@/theme/index.js';

export default function LanguageScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const {
    locale,
    preference,
    setPreference,
    supportedLocales,
  } = useLocalization();

  const systemPreference = getSystemLocalePreferenceValue();

  return (
    <Screen scrollable keyboardAware>
      <ScreenHeader
        title={t('languageSelector.title')}
        subtitle={t('languageSelector.subtitle')}
        onBack={() => router.back()}
      />

      <AppCard variant="outlined" style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{t('languageSelector.currentSelection')}</Text>
        <Text style={styles.summaryValue}>{getLocalizedLanguageLabel(preference)}</Text>
        {preference === systemPreference && (
          <Text style={styles.summaryHint}>
            {t('languageSelector.resolvedLanguage', {
              language: getLocalizedLanguageLabel(locale),
            })}
          </Text>
        )}
      </AppCard>

      <AppCard style={styles.optionCard}>
        <ListItem
          testID="language-option-system"
          title={t('languageSelector.systemOption')}
          subtitle={t('languageSelector.systemDescription')}
          trailing={(
            <Text style={styles.selectionText}>
              {preference === systemPreference ? t('languageSelector.selectedState') : ''}
            </Text>
          )}
          onPress={() => void setPreference(systemPreference)}
          accessibilityRole="button"
          accessibilityState={{ selected: preference === systemPreference }}
        />
      </AppCard>

      <AppCard style={styles.optionCard}>
        <View style={styles.optionList}>
          {supportedLocales.map((supportedLocale) => (
            <ListItem
              key={supportedLocale}
              testID={`language-option-${supportedLocale}`}
              title={getLocalizedLanguageLabel(supportedLocale)}
              subtitle={supportedLocale === locale ? t('languageSelector.resolvedLanguage', {
                language: getLocalizedLanguageLabel(supportedLocale),
              }) : undefined}
              trailing={(
                <Text style={styles.selectionText}>
                  {preference === supportedLocale ? t('languageSelector.selectedState') : ''}
                </Text>
              )}
              onPress={() => void setPreference(supportedLocale)}
              accessibilityRole="button"
              accessibilityState={{ selected: preference === supportedLocale }}
              accessibilityLabel={t('accessibility.selectedLanguage', {
                language: getLocalizedLanguageLabel(supportedLocale),
              })}
            />
          ))}
        </View>
      </AppCard>

      <AppButton
        testID="language-close"
        title={isSignedIn ? t('common.actions.back') : t('common.actions.close')}
        variant="ghost"
        onPress={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    marginBottom: tokens.spacing[4],
  },
  summaryLabel: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: {
    ...tokens.typography.variant.subheading,
    color: tokens.colors.textPrimary,
    marginTop: tokens.spacing[2],
  },
  summaryHint: {
    ...tokens.typography.variant.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: tokens.spacing[2],
  },
  optionCard: {
    marginBottom: tokens.spacing[3],
  },
  optionList: {
    gap: tokens.spacing[2],
  },
  selectionText: {
    ...tokens.typography.variant.caption,
    color: tokens.colors.primaryLight,
    textAlign: 'right',
    minWidth: 84,
  },
});
