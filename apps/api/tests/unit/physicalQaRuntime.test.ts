import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppFromEnv } from '../../src/app.js';
import type { PhysicalQaRuntimeConfig } from '../../src/config/runtime.js';
import {
  BoundedPhysicalQaEventStore,
  physicalQaMobileEventSchema,
} from '../../src/lib/physicalQaMobileEvents.js';
import { createPhysicalQaRuntimeGuard } from '../../src/middleware/physicalQaRuntime.js';
import { createPhysicalQaRouter } from '../../src/routes/physicalQa.js';

const runtimeId = 'a'.repeat(32);
const head = 'b'.repeat(40);
const config: PhysicalQaRuntimeConfig = {
  runtimeId,
  fingerprint: 'AAAAAAAA',
  repositoryHead: head,
  apiStartedAt: '2026-07-24T10:00:00.000Z',
  mobileEventsPath: '/tmp/not-used.ndjson',
};
const headers = {
  'X-BarberApp-QA-Client': 'mobile',
  'X-BarberApp-QA-Head': head,
  'X-BarberApp-QA-Runtime': runtimeId,
  'X-BarberApp-QA-Session': 'app-session-1',
};
const event = {
  runtimeId,
  runtimeFingerprint: 'AAAAAAAA',
  appSessionId: 'app-session-1',
  eventType: 'heartbeat',
  appHead: head,
  timestamp: '2026-07-24T10:00:01.000Z',
  traceVersion: 1,
  apiTarget: 'http://192.168.1.20:3000/api/v1',
  appState: 'active',
} as const;

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('physical-QA runtime API', () => {
  it('does not expose QA routes outside physical-QA mode', async () => {
    const app = createAppFromEnv({ NODE_ENV: 'test' });
    const response = await request(app).get('/api/v1/qa/runtime');

    expect(response.status).toBe(404);

    const productionApp = createAppFromEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost:5432/barberapp',
      CLERK_SECRET_KEY: 'sk_live_test',
      CLERK_WEBHOOK_SECRET: 'whsec_test',
      PHYSICAL_QA_MODE: 'true',
      BARBERAPP_QA_RUNTIME_ID: runtimeId,
      BARBERAPP_QA_RUNTIME_FINGERPRINT: 'AAAAAAAA',
      BARBERAPP_QA_RUNTIME_HEAD: head,
      BARBERAPP_QA_RUNTIME_STARTED_AT: config.apiStartedAt,
      BARBERAPP_QA_MOBILE_EVENTS_PATH: '/tmp/should-not-exist.ndjson',
    });
    const productionResponse = await request(productionApp)
      .get('/api/v1/qa/runtime')
      .set(headers);
    expect(productionResponse.status).toBe(404);
  });

  it('returns only safe runtime identity after matching headers', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/qa', createPhysicalQaRouter(config, {
      eventStore: { append: vi.fn() },
      rateLimiter: (_req, _res, next) => next(),
    }));

    const response = await request(app)
      .get('/api/v1/qa/runtime')
      .set(headers);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        runtimeId,
        runtimeFingerprint: 'AAAAAAAA',
        repositoryHead: head,
        apiStartedAt: config.apiStartedAt,
        physicalQaMode: true,
        traceVersion: 1,
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /DATABASE_URL|CLERK|TOKEN|SECRET|PASSWORD/iu,
    );
  });

  it('rejects runtime and HEAD mismatches with sanitized trace evidence', async () => {
    const logger = vi.fn();
    const app = express();
    app.use(createPhysicalQaRuntimeGuard(config, { logger }));
    app.get('/private', (_req, res) => res.json({ ok: true }));

    const runtimeMismatch = await request(app)
      .get('/private')
      .set({
        ...headers,
        'X-BarberApp-QA-Runtime': 'c'.repeat(32),
      });
    const headMismatch = await request(app)
      .get('/private')
      .set({
        ...headers,
        'X-BarberApp-QA-Head': 'd'.repeat(40),
      });

    expect(runtimeMismatch.status).toBe(409);
    expect(runtimeMismatch.body.error.code).toBe('QA_RUNTIME_MISMATCH');
    expect(headMismatch.status).toBe(409);
    expect(headMismatch.body.error.code).toBe('QA_HEAD_MISMATCH');
    expect(logger).toHaveBeenCalledTimes(2);
    const trace = logger.mock.calls.join('\n');
    expect(trace).toMatch(/qa\.runtime\.mismatch/u);
    expect(trace).toMatch(/CCCCCCCC|ddddddd/u);
    expect(trace).not.toContain('app-session-1');
  });

  it('accepts and persists one strict bounded mobile event', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'barberapp-qa-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'events.ndjson');
    const logger = vi.fn();
    const app = express();
    app.use(express.json());
    app.use('/api/v1/qa', createPhysicalQaRouter(
      { ...config, mobileEventsPath: filePath },
      {
        logger,
        now: () => new Date('2026-07-24T10:00:02.000Z'),
        rateLimiter: (_req, _res, next) => next(),
      },
    ));

    const response = await request(app)
      .post('/api/v1/qa/mobile-events')
      .set(headers)
      .send(event);

    expect(response.status).toBe(202);
    const persisted = JSON.parse(readFileSync(filePath, 'utf8').trim());
    expect(persisted).toEqual({
      ...event,
      receivedAt: '2026-07-24T10:00:02.000Z',
    });
    expect(logger).toHaveBeenCalledWith(
      expect.stringMatching(/^qa\.mobile\.event \{/u),
    );
  });

  it('rejects arbitrary metadata and private payload fields', async () => {
    expect(physicalQaMobileEventSchema.safeParse({
      ...event,
      metadata: { phone: '+543811234567', token: 'secret' },
    }).success).toBe(false);
    expect(physicalQaMobileEventSchema.safeParse({
      ...event,
      rewardCode: 'PRIVATE-CODE',
    }).success).toBe(false);
  });

  it('rotates persisted NDJSON within its byte bound', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'barberapp-qa-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'events.ndjson');
    const store = new BoundedPhysicalQaEventStore(filePath, 1_200);

    for (let index = 0; index < 30; index += 1) {
      store.append({
        ...event,
        receivedAt: `2026-07-24T10:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    const source = readFileSync(filePath, 'utf8');
    expect(Buffer.byteLength(source)).toBeLessThanOrEqual(1_200);
    expect(source).toContain('2026-07-24T10:00:29.000Z');
    expect(source.split('\n').filter(Boolean).length).toBeLessThan(30);
  });

  it('rate limits excessive mobile evidence without accepting unbounded events', async () => {
    const append = vi.fn();
    const app = express();
    app.use(express.json());
    app.use('/api/v1/qa', createPhysicalQaRouter(config, {
      eventStore: { append },
      logger: vi.fn(),
    }));

    for (let index = 0; index < 120; index += 1) {
      const response = await request(app)
        .post('/api/v1/qa/mobile-events')
        .set(headers)
        .send({
          ...event,
          timestamp: `2026-07-24T10:${String(
            Math.floor(index / 60),
          ).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
        });
      expect(response.status).toBe(202);
    }

    const limited = await request(app)
      .post('/api/v1/qa/mobile-events')
      .set(headers)
      .send(event);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('QA_EVENT_RATE_LIMITED');
    expect(append).toHaveBeenCalledTimes(120);
  });
});
