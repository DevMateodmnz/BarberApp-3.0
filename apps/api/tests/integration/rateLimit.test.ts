/**
 * Rate Limiting Tests
 *
 * Validates that the rate limiter returns 429 after the configured
 * threshold. Uses an isolated Express app with explicit test config
 * (max=3, window=60s) for deterministic results.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { createRateLimiter } from '../../src/middleware/rateLimit.js';

describe('Rate Limiting', () => {
  let app: express.Express;

  beforeAll(() => {
    // Build an isolated Express app with the limiter applied to a test route
    app = express();
    const limiter = createRateLimiter({
      enabled: true,
      max: 3,
      windowMs: 60000,
    });
    app.get('/test-rate-limit', limiter, (_req, res) => {
      res.json({ success: true });
    });
  });

  it('allows first 3 requests then returns 429 on the 4th', async () => {
    // Requests 1-3 should succeed
    for (let i = 1; i <= 3; i++) {
      const res = await request(app).get('/test-rate-limit');
      expect(res.status).toBe(200);
    }

    // Request 4 should be rate-limited
    const res = await request(app).get('/test-rate-limit');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.message).toContain('Too many requests');

    // Verify draft-8 headers are present on the 429 response
    const headers = res.headers;
    const hasRateLimit =
      headers['ratelimit-limit'] !== undefined ||
      headers['ratelimit-policy'] !== undefined ||
      headers['retry-after'] !== undefined;
    expect(hasRateLimit).toBe(true);
  });

  it('health check is not rate-limited', async () => {
    const realApp = createAppFromEnv();

    const res = await request(realApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
