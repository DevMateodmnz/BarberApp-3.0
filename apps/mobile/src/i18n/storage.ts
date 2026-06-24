import * as SecureStore from 'expo-secure-store';

import { SYSTEM_LOCALE_PREFERENCE, type LocalePreference } from './catalog.js';
import { normalizeStoredLocalePreference } from './locale.js';

export const LOCALE_PREFERENCE_STORAGE_KEY = 'barberapp.mobile.locale-preference';

export interface LocalePreferenceStorageAdapter {
  deleteItem(key: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const secureStorePreferenceStorage: LocalePreferenceStorageAdapter = {
  async getItem(key) {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key) {
    await SecureStore.deleteItemAsync(key);
  },
};

export async function readLocalePreference(
  storage: LocalePreferenceStorageAdapter = secureStorePreferenceStorage,
): Promise<LocalePreference> {
  try {
    const value = await storage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
    return normalizeStoredLocalePreference(value);
  } catch (error) {
    warnInDevelopment('Failed to read locale preference from storage.', error);
    return SYSTEM_LOCALE_PREFERENCE;
  }
}

export async function writeLocalePreference(
  preference: LocalePreference,
  storage: LocalePreferenceStorageAdapter = secureStorePreferenceStorage,
): Promise<boolean> {
  try {
    if (preference === SYSTEM_LOCALE_PREFERENCE) {
      await storage.deleteItem(LOCALE_PREFERENCE_STORAGE_KEY);
    } else {
      await storage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference);
    }

    return true;
  } catch (error) {
    warnInDevelopment('Failed to persist locale preference.', error);
    return false;
  }
}

function warnInDevelopment(message: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (error instanceof Error) {
    console.warn(message, error.message);
    return;
  }

  console.warn(message, error);
}
