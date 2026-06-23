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
    EXPO_PUBLIC_CLERK_SECRET_KEY?: string;
    EXPO_PUBLIC_CLERK_WEBHOOK_SECRET?: string;
  }
}
