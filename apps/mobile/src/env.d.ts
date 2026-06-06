/**
 * Global type declarations for BarberApp Mobile
 */

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
    EXPO_PUBLIC_API_URL: string;
  }
}