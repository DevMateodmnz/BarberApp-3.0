import { de } from './locales/de.js';
import { en } from './locales/en.js';
import { es, type TranslationCatalog } from './locales/es.js';
import type { TranslationTree } from './schema.js';
import { fr } from './locales/fr.js';
import { it } from './locales/it.js';
import { zhHans } from './locales/zh-Hans.js';

export const SUPPORTED_LOCALES = ['es', 'en', 'de', 'fr', 'it', 'zh-Hans'] as const;
export const DEFAULT_LOCALE = 'es' as const;
export const SYSTEM_LOCALE_PREFERENCE = 'system' as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = SupportedLocale | typeof SYSTEM_LOCALE_PREFERENCE;

export const TRANSLATION_RESOURCES: Record<SupportedLocale, { translation: TranslationCatalog }> = {
  es: { translation: es },
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  'zh-Hans': { translation: zhHans },
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isLocalePreference(value: string): value is LocalePreference {
  return value === SYSTEM_LOCALE_PREFERENCE || isSupportedLocale(value);
}

export function flattenTranslationKeys(
  value: TranslationTree,
  prefix = '',
): string[] {
  const keys: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      keys.push(nextPrefix);
      continue;
    }

    keys.push(...flattenTranslationKeys(child, nextPrefix));
  }

  return keys.sort();
}
