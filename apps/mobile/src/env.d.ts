/**
 * Global type declarations for BarberApp Mobile public environment variables.
 *
 * These values are intentionally optional at type level because the runtime
 * validation layer provides the authoritative error handling.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_APP_ENV?: 'development' | 'preview' | 'production';
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_PHYSICAL_QA_MODE?: 'true' | 'false';
    EXPO_PUBLIC_PHYSICAL_QA_TRACE?: 'true' | 'false';
    EXPO_PUBLIC_QA_RUNTIME_ID?: string;
    EXPO_PUBLIC_QA_RUNTIME_FINGERPRINT?: string;
    EXPO_PUBLIC_QA_RUNTIME_HEAD?: string;
    EXPO_PUBLIC_QA_RUNTIME_STARTED_AT?: string;
    EXPO_PUBLIC_CLERK_SECRET_KEY?: string;
    EXPO_PUBLIC_CLERK_WEBHOOK_SECRET?: string;
  }
}
