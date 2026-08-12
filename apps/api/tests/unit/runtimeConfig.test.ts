import { describe, expect, it } from 'vitest';
import {
  readApiRuntimeConfig,
  resolveCorsOrigin,
} from '../../src/config/runtime.js';

function createProductionEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/barberapp',
    CLERK_SECRET_KEY: 'sk_live_test',
    CLERK_WEBHOOK_SECRET: 'whsec_test',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    ...overrides,
  };
}

function createEnabledPaymentProductionEnv(): NodeJS.ProcessEnv {
  return createProductionEnv({
    PAYMENTS_ENABLED: 'true',
    PAYMENT_CREDENTIAL_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    PUBLIC_WEB_BASE_URL: 'https://bookings.example.com',
    PAYMENT_WEBHOOK_PUBLIC_URL: 'https://api.example.com/api/v1/webhooks/mercado-pago',
    MERCADO_PAGO_CLIENT_ID: 'client-id',
    MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
    MERCADO_PAGO_REDIRECT_URI: 'https://api.example.com/api/v1/payments/mercado-pago/oauth/callback',
    MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
  });
}

describe('readApiRuntimeConfig', () => {
  it('keeps payments disabled by default without requiring payment secrets', () => {
    const config = readApiRuntimeConfig(createProductionEnv());

    expect(config.payments.enabled).toBe(false);
    expect(config.payments.encryptionKey).toBeUndefined();
  });

  it('rejects invalid payment feature flag values', () => {
    expect(() => readApiRuntimeConfig(createProductionEnv({
      PAYMENTS_ENABLED: 'yes',
    }))).toThrow('PAYMENTS_ENABLED must be "true" or "false"');
  });

  it('fails startup when payments are enabled without complete global configuration', () => {
    const requiredNames = [
      'PAYMENT_CREDENTIAL_ENCRYPTION_KEY',
      'PUBLIC_WEB_BASE_URL',
      'PAYMENT_WEBHOOK_PUBLIC_URL',
      'MERCADO_PAGO_CLIENT_ID',
      'MERCADO_PAGO_CLIENT_SECRET',
      'MERCADO_PAGO_REDIRECT_URI',
      'MERCADO_PAGO_WEBHOOK_SECRET',
    ];

    for (const name of requiredNames) {
      const env = createEnabledPaymentProductionEnv();
      delete env[name];
      expect(() => readApiRuntimeConfig(env)).toThrow(
        `${name} is required when PAYMENTS_ENABLED=true`
      );
    }
  });

  it('accepts complete enabled payment configuration', () => {
    const config = readApiRuntimeConfig(createEnabledPaymentProductionEnv());

    expect(config.payments.enabled).toBe(true);
    expect(config.payments.encryptionKey).toHaveLength(32);
  });

  it('keeps production locked down when no browser allowlist is configured', () => {
    const env = createProductionEnv();
    delete env.CORS_ALLOWED_ORIGINS;

    const config = readApiRuntimeConfig(env);

    expect(config.corsPolicy.mode).toBe('deny-browser-origins');
    expect(config.corsPolicy.allowedOrigins).toEqual([]);
  });

  it('rejects production with an empty CORS_ALLOWED_ORIGINS', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ CORS_ALLOWED_ORIGINS: '   ' })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS cannot be empty');
  });

  it('rejects wildcard CORS_ALLOWED_ORIGINS in production', () => {
    expect(() =>
      readApiRuntimeConfig(createProductionEnv({ CORS_ALLOWED_ORIGINS: '*' }))
    ).toThrow(
      'CORS_ALLOWED_ORIGINS must not contain "*" when credentials are enabled'
    );
  });

  it('rejects malformed origins in production', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ CORS_ALLOWED_ORIGINS: 'not-a-valid-origin' })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS contains an invalid origin');
  });

  it('rejects non-http origins in production', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({
          CORS_ALLOWED_ORIGINS: 'ftp://app.example.com',
        })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS only supports http:// or https:// origins');
  });

  it('rejects configured origins that include a path, query, or fragment', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({
          CORS_ALLOWED_ORIGINS: 'https://app.example.com/path',
        })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS origins must not include a path');

    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({
          CORS_ALLOWED_ORIGINS: 'https://app.example.com?x=1',
        })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS origins must not include a query string');

    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({
          CORS_ALLOWED_ORIGINS: 'https://app.example.com#frag',
        })
      )
    ).toThrow('CORS_ALLOWED_ORIGINS origins must not include a fragment');
  });

  it('accepts one valid HTTPS origin in production', () => {
    const config = readApiRuntimeConfig(createProductionEnv());

    expect(config.corsPolicy.mode).toBe('explicit-allowlist');
    expect(config.corsPolicy.allowedOrigins).toEqual([
      'https://app.example.com',
    ]);
  });

  it('accepts multiple valid origins in production', () => {
    const config = readApiRuntimeConfig(
      createProductionEnv({
        CORS_ALLOWED_ORIGINS:
          'https://app.example.com, https://admin.example.com',
      })
    );

    expect(config.corsPolicy.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('deduplicates origins deterministically', () => {
    const config = readApiRuntimeConfig(
      createProductionEnv({
        CORS_ALLOWED_ORIGINS:
          'https://app.example.com, https://admin.example.com, https://app.example.com/',
      })
    );

    expect(config.corsPolicy.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('keeps development locked down without an explicit allowlist', () => {
    const config = readApiRuntimeConfig({ NODE_ENV: 'development' });

    expect(config.corsPolicy.mode).toBe('deny-browser-origins');
    expect(
      resolveCorsOrigin(config.corsPolicy, 'http://localhost:8081')
    ).toBe(false);
    expect(config.physicalQaRequestTracing).toBe(false);
    expect(config.physicalQa).toBeUndefined();
  });

  it('loads a complete physical-QA identity only in development', () => {
    const env = {
      NODE_ENV: 'development',
      PHYSICAL_QA_MODE: 'true',
      BARBERAPP_QA_RUNTIME_ID: 'a'.repeat(32),
      BARBERAPP_QA_RUNTIME_FINGERPRINT: 'AAAAAAAA',
      BARBERAPP_QA_RUNTIME_HEAD: 'b'.repeat(40),
      BARBERAPP_QA_RUNTIME_STARTED_AT: '2026-07-24T10:00:00.000Z',
      BARBERAPP_QA_MOBILE_EVENTS_PATH: '/tmp/runtime.ndjson',
    };

    expect(readApiRuntimeConfig(env).physicalQa).toEqual({
      runtimeId: 'a'.repeat(32),
      fingerprint: 'AAAAAAAA',
      repositoryHead: 'b'.repeat(40),
      apiStartedAt: '2026-07-24T10:00:00.000Z',
      mobileEventsPath: '/tmp/runtime.ndjson',
    });
    expect(readApiRuntimeConfig({
      ...createProductionEnv(),
      ...env,
      NODE_ENV: 'production',
    }).physicalQa).toBeUndefined();
  });

  it('rejects incomplete or inconsistent physical-QA identity', () => {
    expect(() => readApiRuntimeConfig({
      NODE_ENV: 'development',
      PHYSICAL_QA_MODE: 'true',
    })).toThrow('BARBERAPP_QA_RUNTIME_ID');

    expect(() => readApiRuntimeConfig({
      NODE_ENV: 'development',
      PHYSICAL_QA_MODE: 'true',
      BARBERAPP_QA_RUNTIME_ID: 'a'.repeat(32),
      BARBERAPP_QA_RUNTIME_FINGERPRINT: 'BBBBBBBB',
      BARBERAPP_QA_RUNTIME_HEAD: 'b'.repeat(40),
      BARBERAPP_QA_RUNTIME_STARTED_AT: '2026-07-24T10:00:00.000Z',
      BARBERAPP_QA_MOBILE_EVENTS_PATH: '/tmp/runtime.ndjson',
    })).toThrow('must match the runtime ID prefix');
  });

  it('enables physical-QA request tracing only in development with an explicit flag', () => {
    expect(readApiRuntimeConfig({
      NODE_ENV: 'development',
      PHYSICAL_QA_REQUEST_TRACE: 'true',
    }).physicalQaRequestTracing).toBe(true);
    expect(readApiRuntimeConfig({
      NODE_ENV: 'test',
      PHYSICAL_QA_REQUEST_TRACE: 'true',
    }).physicalQaRequestTracing).toBe(false);
    expect(readApiRuntimeConfig(createProductionEnv({
      PHYSICAL_QA_REQUEST_TRACE: 'true',
    })).physicalQaRequestTracing).toBe(false);
  });

  it('honors an explicit non-production allowlist when provided', () => {
    const config = readApiRuntimeConfig({
      NODE_ENV: 'development',
      CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
    });

    expect(config.corsPolicy.mode).toBe('explicit-allowlist');
    expect(
      resolveCorsOrigin(config.corsPolicy, 'http://localhost:8081')
    ).toBe('http://localhost:8081');
    expect(
      resolveCorsOrigin(config.corsPolicy, 'http://127.0.0.1:8081')
    ).toBe(false);
  });

  it('keeps test environment deterministic', () => {
    const config = readApiRuntimeConfig({ NODE_ENV: 'test' });

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.rateLimit.enabled).toBe(false);
    expect(resolveCorsOrigin(config.corsPolicy, undefined)).toBe(false);
  });
});
