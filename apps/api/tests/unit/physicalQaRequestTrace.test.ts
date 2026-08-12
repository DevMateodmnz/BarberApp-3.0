import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  createPhysicalQaRequestTrace,
  normalizePhysicalQaRoute,
} from '../../src/middleware/physicalQaRequestTrace.js';

describe('physical-QA API request tracing', () => {
  it('normalizes private path values and drops query strings', () => {
    expect(normalizePhysicalQaRoute(
      '/api/v1/barbershops/cly-private-shop-id/loyalty-program?phone=%2B543811234567',
    )).toBe('/api/v1/barbershops/:value/loyalty-program');
    expect(normalizePhysicalQaRoute(
      '/api/v1/public/barbershops/private-shop-slug/services',
    )).toBe('/api/v1/public/barbershops/:value/services');
  });

  it('logs a bounded method, normalized route, status, duration, and correlation ID', async () => {
    const logger = vi.fn();
    const times = [100, 112];
    const app = express();
    app.use(createPhysicalQaRequestTrace({
      enabled: true,
      logger,
      now: () => times.shift() ?? 112,
      randomId: () => 'generated-request-id',
    }));
    app.put('/api/v1/barbershops/:barbershopId/loyalty-program', (_req, res) => {
      res.status(200).json({ success: true });
    });

    const response = await request(app)
      .put('/api/v1/barbershops/private-shop-id/loyalty-program?secret=no')
      .set('X-Request-Id', 'qa-attempt-123')
      .send({ visitsRequired: 2 });

    expect(response.headers['x-request-id']).toBe('qa-attempt-123');
    expect(logger).toHaveBeenCalledTimes(1);
    const line = String(logger.mock.calls[0]?.[0]);
    expect(line).toMatch(/^qa\.api\.request \{/u);
    expect(JSON.parse(line.slice('qa.api.request '.length))).toMatchObject({
      method: 'PUT',
      route: '/api/v1/barbershops/:value/loyalty-program',
      status: 200,
      durationMs: 12,
      correlationId: 'qa-attempt-123',
    });
    expect(line).not.toMatch(/private-shop-id|secret|visitsRequired/iu);
  });

  it('does not log when disabled', async () => {
    const logger = vi.fn();
    const app = express();
    app.use(createPhysicalQaRequestTrace({ enabled: false, logger }));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));

    await request(app).get('/health');

    expect(logger).not.toHaveBeenCalled();
  });
});
