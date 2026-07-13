import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';

function buildApp(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return createAppFromEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/barberapp_test',
    DATABASE_URL_TEST:
      process.env.DATABASE_URL_TEST ??
      'postgresql://postgres:postgres@localhost:5433/barberapp_test',
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_mock',
    CLERK_WEBHOOK_SECRET:
      process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock',
    ...overrides,
  });
}

describe('CORS behavior', () => {
  it('returns the exact allow-origin header for an allowed browser origin', async () => {
    const app = buildApp({
      CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });

    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://admin.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://admin.example.com'
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not return permissive CORS headers for a disallowed browser origin', async () => {
    const app = buildApp({
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });

    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('keeps requests with no Origin header functional', async () => {
    const app = buildApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not allow browser origins when no explicit allowlist is configured', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:8081');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('preserves preflight behavior for allowed origins with minimal methods and headers', async () => {
    const app = buildApp({
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });

    const res = await request(app)
      .options('/api/v1/ping')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization,content-type,idempotency-key'
      );

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://app.example.com'
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-methods']).toContain('PUT');
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
    expect(res.headers['access-control-allow-headers']).toContain('Accept');
    expect(res.headers['access-control-allow-headers']).toContain(
      'Authorization'
    );
    expect(res.headers['access-control-allow-headers']).toContain(
      'Content-Type'
    );
    expect(res.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key'
    );
  });

  it('keeps protected routes protected even for allowed origins', async () => {
    const app = buildApp({
      CORS_ALLOWED_ORIGINS: 'https://admin.example.com',
    });

    const res = await request(app)
      .get('/api/v1/appointments')
      .set('Origin', 'https://admin.example.com');

    expect(res.status).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://admin.example.com'
    );
  });

  it('permits explicit local browser development origins when configured', async () => {
    const app = buildApp({
      CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
    });

    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:8081');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:8081'
    );
  });
});
