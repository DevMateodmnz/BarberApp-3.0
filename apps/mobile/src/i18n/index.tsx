import { AppState, ActivityIndicator, StyleSheet, View } from 'react-native';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { tokens } from '@/theme/index.js';

import {
  SUPPORTED_LOCALES,
  SYSTEM_LOCALE_PREFERENCE,
  type LocalePreference,
  type SupportedLocale,
} from './catalog.js';
import {
  formatCurrencyMinorUnits,
  formatCurrencyUnits,
  formatDecimal,
  formatInteger,
  formatLocalizedDate,
  formatLocalizedTime,
  formatLocalizedWeekday,
  formatPercent,
} from './formatters.js';
import { localizeApiError, localizeUnknownError } from './errors.js';
import { mobileLocalizationRuntime, type LocalizationRuntimeSnapshot } from './runtime.js';

interface LocalizationContextValue extends LocalizationRuntimeSnapshot {
  setPreference: (preference: LocalePreference) => Promise<LocalizationRuntimeSnapshot>;
  supportedLocales: readonly SupportedLocale[];
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LocalizationRuntimeSnapshot>(
    mobileLocalizationRuntime.getSnapshot(),
  );

  useEffect(() => mobileLocalizationRuntime.subscribe(setSnapshot), []);

  useEffect(() => {
    void mobileLocalizationRuntime.bootstrap();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void mobileLocalizationRuntime.refreshFromDevice();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const value = useMemo<LocalizationContextValue>(
    () => ({
      ...snapshot,
      setPreference: (preference) => mobileLocalizationRuntime.setPreference(preference),
      supportedLocales: SUPPORTED_LOCALES,
    }),
    [snapshot],
  );

  if (!snapshot.ready) {
    return (
      <View style={styles.bootstrapScreen}>
        <ActivityIndicator color={tokens.colors.primary} size="small" />
      </View>
    );
  }

  return (
    <LocalizationContext.Provider value={value}>
      <I18nextProvider i18n={mobileLocalizationRuntime.i18n}>
        {children}
      </I18nextProvider>
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  const value = useContext(LocalizationContext);
  if (!value) {
    throw new Error('useLocalization must be used within LocalizationProvider');
  }

  return value;
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'OWNER':
    case 'BARBER':
    case 'CLIENT':
      return mobileLocalizationRuntime.i18n.t(`roles.${role}`);
    default:
      return mobileLocalizationRuntime.i18n.t('roles.UNKNOWN');
  }
}

export function getPaymentMethodLabel(paymentMethod: unknown): string {
  if (typeof paymentMethod !== 'string') {
    return mobileLocalizationRuntime.i18n.t('paymentMethods.UNSPECIFIED');
  }

  const normalized = paymentMethod.trim().toUpperCase();
  switch (normalized) {
    case 'CASH':
    case 'CARD':
    case 'TRANSFER':
    case 'OTHER':
      return mobileLocalizationRuntime.i18n.t(`paymentMethods.${normalized}`);
    default:
      return mobileLocalizationRuntime.i18n.t('paymentMethods.UNSPECIFIED');
  }
}

export function getAppointmentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
    case 'CONFIRMED':
    case 'IN_PROGRESS':
    case 'COMPLETED':
    case 'CANCELLED':
    case 'NO_SHOW':
      return mobileLocalizationRuntime.i18n.t(`appointmentStatuses.${status}`);
    default:
      return status;
  }
}

export function getAppointmentTransitionLabel(status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'CANCELLED':
    case 'IN_PROGRESS':
    case 'COMPLETED':
    case 'NO_SHOW':
      return mobileLocalizationRuntime.i18n.t(`appointmentActions.${status}`);
    default:
      return status;
  }
}

export function getLocalizedLanguageLabel(locale: LocalePreference): string {
  if (locale === SYSTEM_LOCALE_PREFERENCE) {
    return mobileLocalizationRuntime.i18n.t('languages.system');
  }

  return mobileLocalizationRuntime.i18n.t(`languages.${locale}`);
}

export function getNavigationLabel(
  route: 'home' | 'recordService' | 'services' | 'employees' | 'workingHours' | 'appointments',
): string {
  return mobileLocalizationRuntime.i18n.t(`navigation.${route}`);
}

export function getSystemLocalePreferenceValue(): LocalePreference {
  return SYSTEM_LOCALE_PREFERENCE;
}

export {
  SUPPORTED_LOCALES,
  SYSTEM_LOCALE_PREFERENCE,
  formatCurrencyMinorUnits,
  formatCurrencyUnits,
  formatDecimal,
  formatInteger,
  formatLocalizedDate,
  formatLocalizedTime,
  formatLocalizedWeekday,
  formatPercent,
  localizeApiError,
  localizeUnknownError,
  mobileLocalizationRuntime,
};
export type { LocalePreference, SupportedLocale } from './catalog.js';
export {
  DEFAULT_LOCALE,
  flattenTranslationKeys,
  TRANSLATION_RESOURCES,
} from './catalog.js';
export {
  buildLocaleFromParts,
  normalizeStoredLocalePreference,
  resolveDeviceLocale,
  resolveLocaleState,
  resolveSupportedLocaleFromDeviceLocale,
  resolveSupportedLocaleFromTag,
} from './locale.js';
export { LOCALE_PREFERENCE_STORAGE_KEY } from './storage.js';

const styles = StyleSheet.create({
  bootstrapScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.background,
  },
});
