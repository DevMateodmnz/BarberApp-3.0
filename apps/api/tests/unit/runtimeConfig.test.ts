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
    ALLOWED_ORIGIN: 'https://app.example.com',
    ...overrides,
  };
}

describe('readApiRuntimeConfig', () => {
  it('rejects production without ALLOWED_ORIGIN', () => {
    const env = createProductionEnv();
    delete env.ALLOWED_ORIGIN;

    expect(() => readApiRuntimeConfig(env)).toThrow(
      'ALLOWED_ORIGIN is required in production'
    );
  });

  it('rejects production with an empty ALLOWED_ORIGIN', () => {
    expect(() =>
      readApiRuntimeConfig(createProductionEnv({ ALLOWED_ORIGIN: '   ' }))
    ).toThrow('ALLOWED_ORIGIN cannot be empty');
  });

  it('rejects wildcard ALLOWED_ORIGIN in production', () => {
    expect(() =>
      readApiRuntimeConfig(createProductionEnv({ ALLOWED_ORIGIN: '*' }))
    ).toThrow('ALLOWED_ORIGIN must not contain "*" when credentials are enabled');
  });

  it('rejects malformed origins in production', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ ALLOWED_ORIGIN: 'not-a-valid-origin' })
      )
    ).toThrow('ALLOWED_ORIGIN contains an invalid origin');
  });

  it('rejects non-http origins in production', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ ALLOWED_ORIGIN: 'ftp://app.example.com' })
      )
    ).toThrow('ALLOWED_ORIGIN only supports http:// or https:// origins');
  });

  it('rejects configured origins that include a path, query, or fragment', () => {
    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ ALLOWED_ORIGIN: 'https://app.example.com/path' })
      )
    ).toThrow('ALLOWED_ORIGIN origins must not include a path');

    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ ALLOWED_ORIGIN: 'https://app.example.com?x=1' })
      )
    ).toThrow('ALLOWED_ORIGIN origins must not include a query string');

    expect(() =>
      readApiRuntimeConfig(
        createProductionEnv({ ALLOWED_ORIGIN: 'https://app.example.com#frag' })
      )
    ).toThrow('ALLOWED_ORIGIN origins must not include a fragment');
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
        ALLOWED_ORIGIN: 'https://app.example.com, https://admin.example.com',
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
        ALLOWED_ORIGIN:
          'https://app.example.com, https://admin.example.com, https://app.example.com/',
      })
    );

    expect(config.corsPolicy.allowedOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('keeps development usable without an explicit allowlist', () => {
    const config = readApiRuntimeConfig({ NODE_ENV: 'development' });

    expect(config.corsPolicy.mode).toBe('reflect-request-origin');
    expect(
      resolveCorsOrigin(config.corsPolicy, 'http://localhost:8081')
    ).toBe('http://localhost:8081');
  });

  it('honors an explicit non-production allowlist when provided', () => {
    const config = readApiRuntimeConfig({
      NODE_ENV: 'development',
      ALLOWED_ORIGIN: 'http://localhost:8081',
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
