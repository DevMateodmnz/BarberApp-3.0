import { describe, expect, it } from 'vitest';

import {
  getDefaultDevelopmentApiUrl,
  normalizeApiBaseUrl,
  readMobileAppEnvironment,
  readMobilePublicRuntime,
} from '../../src/config/publicRuntime.js';

function createEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    EXPO_PUBLIC_APP_ENV: 'development',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_mobiledev123',
    ...overrides,
  };
}

describe('readMobileAppEnvironment', () => {
  it('defaults to development when EXPO_PUBLIC_APP_ENV is absent', () => {
    expect(readMobileAppEnvironment(createEnv({ EXPO_PUBLIC_APP_ENV: undefined }))).toBe(
      'development',
    );
  });

  it('rejects unknown environments', () => {
    expect(() =>
      readMobileAppEnvironment(createEnv({ EXPO_PUBLIC_APP_ENV: 'qa' })),
    ).toThrow('EXPO_PUBLIC_APP_ENV must be development, preview, or production.');
  });
});

describe('readMobilePublicRuntime', () => {
  it('uses the explicit development fallback when EXPO_PUBLIC_API_URL is absent', () => {
    const runtime = readMobilePublicRuntime(
      createEnv({ EXPO_PUBLIC_API_URL: undefined }),
    );

    expect(runtime).toEqual({
      appEnv: 'development',
      apiBaseUrl: getDefaultDevelopmentApiUrl(),
      clerkPublishableKey: 'pk_test_mobiledev123',
    });
  });

  it('uses an explicit development API URL when provided', () => {
    const runtime = readMobilePublicRuntime(
      createEnv({ EXPO_PUBLIC_API_URL: ' http://192.168.1.25:3000/api/v1/ ' }),
    );

    expect(runtime.apiBaseUrl).toBe('http://192.168.1.25:3000/api/v1');
  });

  it('fails preview when EXPO_PUBLIC_API_URL is missing', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: undefined,
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL is required for preview builds.');
  });

  it('fails production when EXPO_PUBLIC_API_URL is missing', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: undefined,
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_mobileprod123',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL is required for production builds.');
  });

  it('rejects production HTTP URLs', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: 'http://api.example.com/api/v1',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_mobileprod123',
        }),
      ),
    ).toThrow('Production builds require EXPO_PUBLIC_API_URL to use https://.');
  });

  it('rejects localhost in production', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: 'https://localhost/api/v1',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_mobileprod123',
        }),
      ),
    ).toThrow('production builds require a non-local EXPO_PUBLIC_API_URL host.');
  });

  it('rejects loopback IPs in preview', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://127.0.0.1/api/v1',
        }),
      ),
    ).toThrow('preview builds require a non-local EXPO_PUBLIC_API_URL host.');
  });

  it('rejects private LAN IPs in preview', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://192.168.1.25/api/v1',
        }),
      ),
    ).toThrow('preview builds require a non-local EXPO_PUBLIC_API_URL host.');
  });

  it('rejects malformed API URLs', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'not-a-url',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL must be a valid absolute URL ending in /api/v1.');
  });

  it('rejects credentials in API URLs', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://user:pass@api.example.com/api/v1',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL must not include credentials.');
  });

  it('rejects query strings and fragments in API URLs', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1?foo=bar#frag',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL must not include query strings or fragments.');
  });

  it('normalizes trailing slashes without duplicating /api/v1', () => {
    const runtime = readMobilePublicRuntime(
      createEnv({
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1///',
      }),
    );

    expect(runtime.apiBaseUrl).toBe('https://api.example.com/api/v1');
  });

  it('rejects bare hosts or unexpected API paths', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://api.example.com',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL must point to the API base path /api/v1 exactly.');

    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'preview',
          EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1/api/v1',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_API_URL must point to the API base path /api/v1 exactly.');
  });

  it('requires a publishable Clerk key', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: ' ' }),
      ),
    ).toThrow('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required before the app can start.');
  });

  it('rejects malformed Clerk publishable keys', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'sk_test_not_public' }),
      ),
    ).toThrow('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a valid Clerk publishable key.');
  });

  it('requires live Clerk keys in production', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_mobileprod123',
        }),
      ),
    ).toThrow('Production builds must use a live Clerk publishable key (pk_live_...).');
  });

  it('rejects public Clerk secret variables', () => {
    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_CLERK_SECRET_KEY: 'sk_test_should_not_ship',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_CLERK_SECRET_KEY must never be set in the mobile app environment.');

    expect(() =>
      readMobilePublicRuntime(
        createEnv({
          EXPO_PUBLIC_CLERK_WEBHOOK_SECRET: 'whsec_should_not_ship',
        }),
      ),
    ).toThrow('EXPO_PUBLIC_CLERK_WEBHOOK_SECRET must never be set in the mobile app environment.');
  });

  it('accepts valid placeholder preview and production values', () => {
    const previewRuntime = readMobilePublicRuntime(
      createEnv({
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_API_URL: 'https://preview.example.com/api/v1',
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_preview123',
      }),
    );

    const productionRuntime = readMobilePublicRuntime(
      createEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_API_URL: 'https://api.example.com/api/v1',
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_production123',
      }),
    );

    expect(previewRuntime.apiBaseUrl).toBe('https://preview.example.com/api/v1');
    expect(productionRuntime.apiBaseUrl).toBe('https://api.example.com/api/v1');
  });
});

describe('normalizeApiBaseUrl', () => {
  it('keeps exactly one /api/v1 path segment', () => {
    expect(normalizeApiBaseUrl('https://api.example.com/api/v1/', 'production')).toBe(
      'https://api.example.com/api/v1',
    );
  });
});
