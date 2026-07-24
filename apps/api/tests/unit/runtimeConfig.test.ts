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

describe('readApiRuntimeConfig', () => {
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
