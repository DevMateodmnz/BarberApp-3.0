import i18next from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  SYSTEM_LOCALE_PREFERENCE,
  TRANSLATION_RESOURCES,
  flattenTranslationKeys,
} from '../../src/i18n/catalog.js';
import {
  formatCurrencyMinorUnits,
  formatLocalizedDate,
  formatLocalizedTime,
  getAppointmentStatusLabel,
  getPaymentMethodLabel,
  getRoleLabel,
} from '../../src/i18n/index.js';
import {
  buildLocaleFromParts,
  normalizeStoredLocalePreference,
  resolveLocaleState,
  resolveSupportedLocaleFromDeviceLocale,
  resolveSupportedLocaleFromTag,
} from '../../src/i18n/locale.js';
import { localizeApiError, localizeUnknownError } from '../../src/i18n/errors.js';
import { mobileLocalizationRuntime, createLocalizationRuntime } from '../../src/i18n/runtime.js';
import {
  LOCALE_PREFERENCE_STORAGE_KEY,
  readLocalePreference,
  writeLocalePreference,
  type LocalePreferenceStorageAdapter,
} from '../../src/i18n/storage.js';
import { ApiError } from '../../src/lib/api.js';

function createMemoryStorage(initialValue: string | null = null): LocalePreferenceStorageAdapter {
  let currentValue = initialValue;

  return {
    async getItem(key) {
      expect(key).toBe(LOCALE_PREFERENCE_STORAGE_KEY);
      return currentValue;
    },
    async setItem(key, value) {
      expect(key).toBe(LOCALE_PREFERENCE_STORAGE_KEY);
      currentValue = value;
    },
    async deleteItem(key) {
      expect(key).toBe(LOCALE_PREFERENCE_STORAGE_KEY);
      currentValue = null;
    },
  };
}

describe('mobile i18n foundation', () => {
  beforeEach(async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it('supports the expected six locales only', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en', 'de', 'fr', 'it', 'zh-Hans']);
  });

  it('maps regional aliases and Simplified Chinese variants to supported locales', () => {
    expect(resolveSupportedLocaleFromTag('es-AR')).toBe('es');
    expect(resolveSupportedLocaleFromTag('en-US')).toBe('en');
    expect(resolveSupportedLocaleFromTag('de-DE')).toBe('de');
    expect(resolveSupportedLocaleFromTag('fr-FR')).toBe('fr');
    expect(resolveSupportedLocaleFromTag('it-IT')).toBe('it');
    expect(resolveSupportedLocaleFromTag('zh-CN')).toBe('zh-Hans');
    expect(resolveSupportedLocaleFromTag('zh-Hans-CN')).toBe('zh-Hans');
    expect(
      resolveSupportedLocaleFromDeviceLocale({
        languageTag: 'zh-SG',
        languageCode: 'zh',
        languageScriptCode: 'Hans',
        regionCode: 'SG',
      }),
    ).toBe('zh-Hans');
  });

  it('falls back to Spanish for unsupported device locales', () => {
    expect(resolveSupportedLocaleFromTag('pt-BR')).toBeNull();
    expect(
      resolveLocaleState(
        [{ languageTag: 'pt-BR', languageCode: 'pt', languageScriptCode: null, regionCode: 'BR' }],
        SYSTEM_LOCALE_PREFERENCE,
      ),
    ).toEqual({
      preference: SYSTEM_LOCALE_PREFERENCE,
      locale: 'es',
      source: 'system',
    });
  });

  it('supports automatic/system mode, explicit saved preference, and invalid stored fallbacks', () => {
    expect(normalizeStoredLocalePreference(undefined)).toBe(SYSTEM_LOCALE_PREFERENCE);
    expect(normalizeStoredLocalePreference('de')).toBe('de');
    expect(normalizeStoredLocalePreference('pt-BR')).toBe(SYSTEM_LOCALE_PREFERENCE);

    expect(
      resolveLocaleState(
        [{ languageTag: 'en-US', languageCode: 'en', languageScriptCode: null, regionCode: 'US' }],
        'it',
      ),
    ).toEqual({
      preference: 'it',
      locale: 'it',
      source: 'stored',
    });
  });

  it('builds locale tags from Expo locale parts safely', () => {
    expect(buildLocaleFromParts('zh', 'Hans', 'CN')).toBe('zh-Hans-CN');
    expect(buildLocaleFromParts('es', null, 'AR')).toBe('es-AR');
    expect(buildLocaleFromParts(undefined, 'Hans', 'CN')).toBeNull();
  });

  it('handles storage read/write failures without crashing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failingStorage: LocalePreferenceStorageAdapter = {
      async getItem() {
        throw new Error('read failed');
      },
      async setItem() {
        throw new Error('write failed');
      },
      async deleteItem() {
        throw new Error('delete failed');
      },
    };

    await expect(readLocalePreference(failingStorage)).resolves.toBe(SYSTEM_LOCALE_PREFERENCE);
    await expect(writeLocalePreference('en', failingStorage)).resolves.toBe(false);
    await expect(writeLocalePreference(SYSTEM_LOCALE_PREFERENCE, failingStorage)).resolves.toBe(false);
    warnSpy.mockRestore();
  });

  it('bootstraps from the device locale when no stored preference exists', async () => {
    const runtime = createLocalizationRuntime({
      getDeviceLocales: () => [
        { languageTag: 'de-DE', languageCode: 'de', languageScriptCode: null, regionCode: 'DE' },
      ],
      storage: createMemoryStorage(null),
    });

    await expect(runtime.bootstrap()).resolves.toEqual({
      ready: true,
      preference: SYSTEM_LOCALE_PREFERENCE,
      locale: 'de',
      source: 'system',
    });
    expect(runtime.i18n.language).toBe('de');
  });

  it('prefers an explicit saved locale over the device locale', async () => {
    const runtime = createLocalizationRuntime({
      getDeviceLocales: () => [
        { languageTag: 'de-DE', languageCode: 'de', languageScriptCode: null, regionCode: 'DE' },
      ],
      storage: createMemoryStorage('en'),
    });

    const snapshot = await runtime.bootstrap();
    expect(snapshot.preference).toBe('en');
    expect(snapshot.locale).toBe('en');
    expect(snapshot.source).toBe('stored');
  });

  it('treats invalid saved values as automatic mode and recovers from storage failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invalidStoredRuntime = createLocalizationRuntime({
      getDeviceLocales: () => [
        { languageTag: 'fr-FR', languageCode: 'fr', languageScriptCode: null, regionCode: 'FR' },
      ],
      storage: createMemoryStorage('pt-BR'),
    });
    const readFailureRuntime = createLocalizationRuntime({
      getDeviceLocales: () => [
        { languageTag: 'it-IT', languageCode: 'it', languageScriptCode: null, regionCode: 'IT' },
      ],
      storage: {
        ...createMemoryStorage(null),
        async getItem() {
          throw new Error('boom');
        },
      },
    });

    expect((await invalidStoredRuntime.bootstrap()).locale).toBe('fr');
    expect((await readFailureRuntime.bootstrap()).locale).toBe('it');
    warnSpy.mockRestore();
  });

  it('changes language at runtime and can switch back to device mode without restarting', async () => {
    let deviceLocales = [
      { languageTag: 'en-US', languageCode: 'en', languageScriptCode: null, regionCode: 'US' },
    ];

    const runtime = createLocalizationRuntime({
      getDeviceLocales: () => deviceLocales,
      storage: createMemoryStorage(null),
    });

    await runtime.bootstrap();
    expect(runtime.getSnapshot().locale).toBe('en');

    await runtime.setPreference('de');
    expect(runtime.getSnapshot().locale).toBe('de');
    expect(runtime.i18n.language).toBe('de');

    deviceLocales = [
      { languageTag: 'zh-CN', languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'CN' },
    ];
    await runtime.setPreference(SYSTEM_LOCALE_PREFERENCE);
    expect(runtime.getSnapshot()).toEqual({
      ready: true,
      preference: SYSTEM_LOCALE_PREFERENCE,
      locale: 'zh-Hans',
      source: 'system',
    });
  });

  it('keeps translation keys in parity across all six catalogs', () => {
    const referenceKeys = flattenTranslationKeys(TRANSLATION_RESOURCES.es.translation);

    for (const locale of SUPPORTED_LOCALES) {
      expect(flattenTranslationKeys(TRANSLATION_RESOURCES[locale].translation)).toEqual(referenceKeys);
    }
  });

  it('supports interpolation and pluralization', async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage('en');

    expect(mobileLocalizationRuntime.i18n.t('formatting.recordsCount', { count: 1 })).toBe('1 record');
    expect(mobileLocalizationRuntime.i18n.t('formatting.recordsCount', { count: 2 })).toBe('2 records');
    expect(
      mobileLocalizationRuntime.i18n.t('formatting.recordsWithRevenue', {
        countLabel: '2 records',
        amount: 'ARS 20.00',
      }),
    ).toBe('2 records · ARS 20.00');
  });

  it('falls back to Spanish when a selected locale is missing a translation key', async () => {
    const customResources = {
      ...TRANSLATION_RESOURCES,
      en: {
        translation: {
          ...TRANSLATION_RESOURCES.en.translation,
          runtime: {},
        },
      },
    };

    const instance = i18next.createInstance();
    await instance.init({
      compatibilityJSON: 'v4',
      defaultNS: 'translation',
      fallbackLng: 'es',
      interpolation: { escapeValue: false },
      lng: 'en',
      resources: customResources,
      returnEmptyString: false,
      returnNull: false,
    });

    expect(instance.t('runtime.configurationErrorTitle')).toBe(
      TRANSLATION_RESOURCES.es.translation.runtime.configurationErrorTitle,
    );
  });

  it('formats dates and times by locale while keeping the business timezone separate', () => {
    const value = '2026-01-15T18:30:00.000Z';
    const timeZone = 'America/Argentina/Buenos_Aires';

    const dateInSpanish = formatLocalizedDate(value, { locale: 'es', month: 'long', day: 'numeric', year: 'numeric' });
    const dateInEnglish = formatLocalizedDate(value, { locale: 'en', month: 'long', day: 'numeric', year: 'numeric' });
    const timeInSpanish = formatLocalizedTime(value, {
      locale: 'es',
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const timeInEnglish = formatLocalizedTime(value, {
      locale: 'en',
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    expect(dateInSpanish).toBeTruthy();
    expect(dateInEnglish).toBeTruthy();
    expect(dateInSpanish).not.toBe(dateInEnglish);
    expect(timeInSpanish).toContain('15:30');
    expect(timeInEnglish).toContain('15:30');
  });

  it('formats money by locale while retaining the configured currency', () => {
    const amountInSpanish = formatCurrencyMinorUnits(123450, { locale: 'es', currency: 'ARS' });
    const amountInEnglish = formatCurrencyMinorUnits(123450, { locale: 'en', currency: 'ARS' });

    expect(amountInSpanish).toMatch(/1\.234/);
    expect(amountInEnglish).toMatch(/1,234/);
  });

  it('returns stable localized role, payment, and appointment-status labels', async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage('de');
    expect(getRoleLabel('OWNER')).toBe('Inhaber');
    expect(getPaymentMethodLabel('CARD')).toBe('Karte');
    expect(getAppointmentStatusLabel('NO_SHOW')).toBe('Nicht erschienen');

    await mobileLocalizationRuntime.i18n.changeLanguage('zh-Hans');
    expect(getRoleLabel('CLIENT')).toBe('顾客');
    expect(getPaymentMethodLabel('TRANSFER')).toBe('转账');
    expect(getAppointmentStatusLabel('COMPLETED')).toBe('已完成');
  });

  it('maps stable API error codes and legacy employee messages to localized copy', async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage('en');

    expect(localizeApiError(new ApiError('anything', 'NOT_FOUND', 404))).toBe(
      'No account found with this email or ID. Make sure the person has logged in at least once.',
    );
    expect(localizeApiError(new ApiError('anything', 'CONFLICT', 409))).toBe(
      'This person is already an employee of this barbershop.',
    );
    expect(localizeApiError('User not found')).toBe(
      'No account found with this email or ID. Make sure the person has logged in at least once.',
    );
  });

  it('uses a localized generic fallback for unknown server errors and keeps diagnostics in development', async () => {
    await mobileLocalizationRuntime.i18n.changeLanguage('en');

    expect(localizeUnknownError('Socket hang up')).toBe(
      'Something went wrong. Please try again. [Socket hang up]',
    );
    expect(localizeApiError(new ApiError('Database exploded', undefined, 500))).toBe(
      'Something went wrong. Please try again. [Database exploded]',
    );
  });

  it('keeps translation resources free of secret-like values', () => {
    const joinedCatalogText = SUPPORTED_LOCALES
      .map((locale) => JSON.stringify(TRANSLATION_RESOURCES[locale].translation))
      .join('\n');

    expect(joinedCatalogText).not.toMatch(/sk_(live|test)_/i);
    expect(joinedCatalogText).not.toMatch(/EXPO_PUBLIC_/);
    expect(joinedCatalogText).not.toMatch(/CLERK_SECRET/i);
    expect(joinedCatalogText).not.toMatch(/DATABASE_URL/i);
  });
});
