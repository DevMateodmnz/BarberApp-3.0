import i18next, { type i18n as I18nInstance } from 'i18next';
import { getLocales } from 'expo-localization';

import {
  DEFAULT_LOCALE,
  SYSTEM_LOCALE_PREFERENCE,
  TRANSLATION_RESOURCES,
  type LocalePreference,
} from './catalog.js';
import { getDeviceLocalesSnapshot, resolveLocaleState, type DeviceLocaleInput, type ResolvedLocaleState } from './locale.js';
import { readLocalePreference, secureStorePreferenceStorage, writeLocalePreference, type LocalePreferenceStorageAdapter } from './storage.js';

export interface LocalizationRuntimeSnapshot extends ResolvedLocaleState {
  ready: boolean;
}

export interface LocalizationRuntimeOptions {
  getDeviceLocales?: () => readonly DeviceLocaleInput[];
  storage?: LocalePreferenceStorageAdapter;
}

export interface LocalizationRuntime {
  bootstrap(): Promise<LocalizationRuntimeSnapshot>;
  getSnapshot(): LocalizationRuntimeSnapshot;
  i18n: I18nInstance;
  refreshFromDevice(): Promise<LocalizationRuntimeSnapshot>;
  setPreference(preference: LocalePreference): Promise<LocalizationRuntimeSnapshot>;
  subscribe(listener: (snapshot: LocalizationRuntimeSnapshot) => void): () => void;
}

function createI18nInstance() {
  const instance = i18next.createInstance();
  void instance.init({
    compatibilityJSON: 'v4',
    defaultNS: 'translation',
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false,
    },
    lng: DEFAULT_LOCALE,
    resources: TRANSLATION_RESOURCES,
    returnEmptyString: false,
    returnNull: false,
    react: {
      useSuspense: false,
    },
    saveMissing: false,
  });

  return instance;
}

export function createLocalizationRuntime(
  options: LocalizationRuntimeOptions = {},
): LocalizationRuntime {
  const i18n = createI18nInstance();
  const storage = options.storage ?? secureStorePreferenceStorage;
  const getDeviceLocales = options.getDeviceLocales ?? (() => getDeviceLocalesSnapshot(getLocales()));
  const listeners = new Set<(snapshot: LocalizationRuntimeSnapshot) => void>();

  let bootstrappingPromise: Promise<LocalizationRuntimeSnapshot> | null = null;
  let snapshot: LocalizationRuntimeSnapshot = {
    ready: false,
    preference: SYSTEM_LOCALE_PREFERENCE,
    locale: DEFAULT_LOCALE,
    source: 'system',
  };

  const emit = () => {
    listeners.forEach((listener) => listener(snapshot));
  };

  const applyState = async (state: ResolvedLocaleState, ready: boolean) => {
    if (i18n.language !== state.locale) {
      await i18n.changeLanguage(state.locale);
    }

    snapshot = {
      ...state,
      ready,
    };
    emit();
    return snapshot;
  };

  return {
    i18n,
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async bootstrap() {
      if (snapshot.ready) {
        return snapshot;
      }

      if (!bootstrappingPromise) {
        bootstrappingPromise = (async () => {
          const preference = await readLocalePreference(storage);
          const nextState = resolveLocaleState(getDeviceLocales(), preference);
          return applyState(nextState, true);
        })().finally(() => {
          bootstrappingPromise = null;
        });
      }

      return bootstrappingPromise;
    },
    async setPreference(preference) {
      const nextState = resolveLocaleState(getDeviceLocales(), preference);
      await applyState(nextState, true);
      await writeLocalePreference(preference, storage);
      return snapshot;
    },
    async refreshFromDevice() {
      if (snapshot.preference !== SYSTEM_LOCALE_PREFERENCE) {
        return snapshot;
      }

      const nextState = resolveLocaleState(getDeviceLocales(), snapshot.preference);
      return applyState(nextState, snapshot.ready);
    },
  };
}

export const mobileLocalizationRuntime = createLocalizationRuntime();
