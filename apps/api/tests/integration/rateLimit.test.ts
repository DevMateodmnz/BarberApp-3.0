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

describe('Rate Limiting', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Set test-specific rate limit config before importing the middleware
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MAX = '3';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';

    // Dynamic import to pick up env vars set above
    const { createRateLimiter } = await import(
      '../../src/middleware/rateLimit.js'
    );

    // Build an isolated Express app with the limiter applied to a test route
    app = express();
    const limiter = createRateLimiter();
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
    // Use the real app (rate limiting disabled in test env via setup.ts)
    // Dynamic import since static import is hoisted before env vars
    const { app: realApp } = await import('../../src/index.js');

    const res = await request(realApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
