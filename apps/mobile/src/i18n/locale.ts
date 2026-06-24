import type { Locale } from 'expo-localization';

import {
  DEFAULT_LOCALE,
  SYSTEM_LOCALE_PREFERENCE,
  isLocalePreference,
  isSupportedLocale,
  type LocalePreference,
  type SupportedLocale,
} from './catalog.js';

const DIRECT_LOCALE_ALIASES: Record<string, SupportedLocale> = {
  es: 'es',
  en: 'en',
  de: 'de',
  fr: 'fr',
  it: 'it',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-hans-cn': 'zh-Hans',
  'zh-hans-sg': 'zh-Hans',
};

export interface DeviceLocaleInput {
  languageTag?: string | null;
  languageCode?: string | null;
  languageScriptCode?: string | null;
  regionCode?: string | null;
}

export interface ResolvedLocaleState {
  preference: LocalePreference;
  locale: SupportedLocale;
  source: 'system' | 'stored';
}

export function normalizeStoredLocalePreference(value: string | null | undefined): LocalePreference {
  if (!value) {
    return SYSTEM_LOCALE_PREFERENCE;
  }

  const trimmed = value.trim();
  return isLocalePreference(trimmed) ? trimmed : SYSTEM_LOCALE_PREFERENCE;
}

export function resolveSupportedLocaleFromTag(tag: string | null | undefined): SupportedLocale | null {
  if (!tag) {
    return null;
  }

  const trimmed = tag.trim();
  if (trimmed === '') {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (DIRECT_LOCALE_ALIASES[lowered]) {
    return DIRECT_LOCALE_ALIASES[lowered];
  }

  const [canonical] = typeof Intl !== 'undefined' && typeof Intl.getCanonicalLocales === 'function'
    ? Intl.getCanonicalLocales(trimmed)
    : [trimmed];
  const normalizedCanonical = canonical?.toLowerCase();

  if (normalizedCanonical && DIRECT_LOCALE_ALIASES[normalizedCanonical]) {
    return DIRECT_LOCALE_ALIASES[normalizedCanonical];
  }

  const baseLanguage = normalizedCanonical?.split('-')[0];
  if (baseLanguage && isSupportedLocale(baseLanguage)) {
    return baseLanguage;
  }

  return null;
}

export function resolveSupportedLocaleFromDeviceLocale(
  locale: DeviceLocaleInput | null | undefined,
): SupportedLocale | null {
  if (!locale) {
    return null;
  }

  const localeCandidates = [
    locale.languageTag,
    buildLocaleFromParts(locale.languageCode, locale.languageScriptCode, locale.regionCode),
    locale.languageCode,
  ];

  for (const candidate of localeCandidates) {
    const resolved = resolveSupportedLocaleFromTag(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function resolveDeviceLocale(locales: readonly DeviceLocaleInput[]): SupportedLocale {
  for (const locale of locales) {
    const resolved = resolveSupportedLocaleFromDeviceLocale(locale);
    if (resolved) {
      return resolved;
    }
  }

  return DEFAULT_LOCALE;
}

export function resolveLocaleState(
  deviceLocales: readonly DeviceLocaleInput[],
  storedPreference: string | null | undefined,
): ResolvedLocaleState {
  const preference = normalizeStoredLocalePreference(storedPreference);
  if (preference === SYSTEM_LOCALE_PREFERENCE) {
    return {
      preference,
      locale: resolveDeviceLocale(deviceLocales),
      source: 'system',
    };
  }

  return {
    preference,
    locale: preference,
    source: 'stored',
  };
}

export function buildLocaleFromParts(
  languageCode?: string | null,
  scriptCode?: string | null,
  regionCode?: string | null,
): string | null {
  if (!languageCode) {
    return null;
  }

  return [languageCode, scriptCode, regionCode].filter(Boolean).join('-') || null;
}

export function getDeviceLocalesSnapshot(locales: readonly Locale[]): DeviceLocaleInput[] {
  return locales.map((locale) => ({
    languageTag: locale.languageTag,
    languageCode: locale.languageCode,
    languageScriptCode: locale.languageScriptCode,
    regionCode: locale.regionCode,
  }));
}
