import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { applyProxyConfig } from '../../src/config/proxy.js';

function buildApp(nodeEnv: 'development' | 'test' | 'production') {
  const app = express();
  applyProxyConfig(app, nodeEnv);

  app.get('/request-meta', (req, res) => {
    res.json({
      ip: req.ip,
      protocol: req.protocol,
    });
  });

  return app;
}

describe('applyProxyConfig', () => {
  it('trusts exactly one proxy hop in production', async () => {
    const app = buildApp('production');

    const response = await request(app)
      .get('/request-meta')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.body.ip).toBe('203.0.113.10');
    expect(response.body.protocol).toBe('https');
  });

  it('does not trust forwarded headers outside production', async () => {
    const app = buildApp('development');

    const response = await request(app)
      .get('/request-meta')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.body.ip).not.toBe('203.0.113.10');
    expect(response.body.protocol).toBe('http');
  });
});
