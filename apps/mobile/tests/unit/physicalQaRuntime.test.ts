import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyPhysicalQaHeaders } from '../../src/lib/api.js';
import {
  PHYSICAL_QA_HEARTBEAT_INTERVAL_MS,
  PhysicalQaRuntimeController,
  createEphemeralAppSessionId,
  type PhysicalQaRuntimeTransport,
} from '../../src/lib/physicalQaRuntime.js';

const runtimeId = 'a'.repeat(32);
const head = 'b'.repeat(40);
const runtime = {
  appEnv: 'development' as const,
  apiBaseUrl: 'http://192.168.1.25:3000/api/v1',
  clerkPublishableKey: 'pk_test_mobiledev123',
  physicalQa: {
    runtimeId,
    fingerprint: 'AAAAAAAA',
    repositoryHead: head,
    startedAt: '2026-07-24T10:00:00.000Z',
    traceEnabled: true as const,
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile physical-QA runtime', () => {
  it('injects runtime identity into the common API client only in QA mode', () => {
    const config = {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    applyPhysicalQaHeaders(config, runtime.physicalQa);
    expect(config.headers['X-BarberApp-QA-Client']).toBe('mobile');
    expect(config.headers['X-BarberApp-QA-Head']).toBe(head);
    expect(config.headers['X-BarberApp-QA-Runtime']).toBe(runtimeId);

    const productionConfig = {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig;
    applyPhysicalQaHeaders(productionConfig);
    expect(productionConfig.headers['X-BarberApp-QA-Runtime']).toBeUndefined();
  });

  it('creates a non-persistent bounded app-session identifier', () => {
    expect(createEphemeralAppSessionId(1_000, 0.5)).toMatch(
      /^app-rs-[a-z0-9]{10}$/u,
    );
    expect(createEphemeralAppSessionId(1_000, 0.5)).toBe(
      createEphemeralAppSessionId(1_000, 0.5),
    );
    expect(createEphemeralAppSessionId(1_001, 0.5)).not.toBe(
      createEphemeralAppSessionId(1_000, 0.5),
    );
  });

  it('requires handshake plus persisted heartbeat before becoming ready', async () => {
    vi.useFakeTimers();
    const events: Array<Record<string, unknown>> = [];
    const transport: PhysicalQaRuntimeTransport = {
      readRuntime: vi.fn(async () => ({
        success: true,
        data: {
          runtimeId,
          runtimeFingerprint: 'AAAAAAAA',
          repositoryHead: head,
          apiStartedAt: '2026-07-24T10:00:00.000Z',
          physicalQaMode: true,
          traceVersion: 1,
        },
      })),
      sendEvent: vi.fn(async (_api, _runtime, event) => {
        events.push(event);
      }),
    };
    const controller = new PhysicalQaRuntimeController({
      runtime,
      transport,
      now: () => new Date('2026-07-24T10:00:01.000Z'),
      createSessionId: () => 'app-session-1',
    });

    await controller.start();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      fingerprint: 'AAAAAAAA',
      appHead: head,
      apiHead: head,
      appSessionId: 'app-session-1',
      lastHeartbeatAt: '2026-07-24T10:00:01.000Z',
      traceEnabled: true,
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'app_started',
      'runtime_handshake_started',
      'runtime_handshake_succeeded',
      'heartbeat',
    ]);

    await vi.advanceTimersByTimeAsync(PHYSICAL_QA_HEARTBEAT_INTERVAL_MS);
    expect(events.filter((event) => event.eventType === 'heartbeat')).toHaveLength(2);

    controller.setAppState('background');
    await vi.advanceTimersByTimeAsync(PHYSICAL_QA_HEARTBEAT_INTERVAL_MS * 2);
    expect(events.filter((event) => event.eventType === 'heartbeat')).toHaveLength(2);
    controller.stop();
  });

  it('emits an immediate heartbeat after returning to foreground', async () => {
    const events: Array<Record<string, unknown>> = [];
    const transport: PhysicalQaRuntimeTransport = {
      readRuntime: vi.fn(async () => ({
        success: true,
        data: {
          runtimeId,
          runtimeFingerprint: 'AAAAAAAA',
          repositoryHead: head,
          apiStartedAt: '2026-07-24T10:00:00.000Z',
          physicalQaMode: true,
          traceVersion: 1,
        },
      })),
      sendEvent: vi.fn(async (_api, _runtime, event) => {
        events.push(event);
      }),
    };
    const controller = new PhysicalQaRuntimeController({
      runtime,
      transport,
      createSessionId: () => 'app-session-1',
    });
    await controller.start();
    controller.setAppState('background');
    const before = events.filter((event) => event.eventType === 'heartbeat').length;
    controller.setAppState('active');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      events.filter((event) => event.eventType === 'heartbeat').length,
    ).toBeGreaterThan(before);
    controller.stop();
  });

  it('fails closed for runtime, HEAD, and trace-transport failures', async () => {
    const createTransport = (
      overrides: Partial<PhysicalQaRuntimeTransport>,
    ): PhysicalQaRuntimeTransport => ({
      readRuntime: vi.fn(async () => ({
        success: true,
        data: {
          runtimeId,
          runtimeFingerprint: 'AAAAAAAA',
          repositoryHead: head,
          apiStartedAt: '2026-07-24T10:00:00.000Z',
          physicalQaMode: true,
          traceVersion: 1,
        },
      })),
      sendEvent: vi.fn(async () => undefined),
      ...overrides,
    });

    const runtimeMismatch = new PhysicalQaRuntimeController({
      runtime,
      transport: createTransport({
        readRuntime: vi.fn(async () => ({
          success: true,
          data: {
            runtimeId: 'c'.repeat(32),
            runtimeFingerprint: 'CCCCCCCC',
            repositoryHead: head,
            apiStartedAt: '2026-07-24T10:00:00.000Z',
            physicalQaMode: true,
            traceVersion: 1,
          },
        })),
      }),
    });
    await runtimeMismatch.start();
    expect(runtimeMismatch.getSnapshot()).toMatchObject({
      status: 'mismatch',
      safeErrorCategory: 'RUNTIME_MISMATCH',
    });

    const headMismatch = new PhysicalQaRuntimeController({
      runtime,
      transport: createTransport({
        readRuntime: vi.fn(async () => ({
          success: true,
          data: {
            runtimeId,
            runtimeFingerprint: 'AAAAAAAA',
            repositoryHead: 'd'.repeat(40),
            apiStartedAt: '2026-07-24T10:00:00.000Z',
            physicalQaMode: true,
            traceVersion: 1,
          },
        })),
      }),
    });
    await headMismatch.start();
    expect(headMismatch.getSnapshot()).toMatchObject({
      status: 'mismatch',
      safeErrorCategory: 'HEAD_MISMATCH',
    });

    const traceFailure = new PhysicalQaRuntimeController({
      runtime,
      transport: createTransport({
        sendEvent: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
    });
    await traceFailure.start();
    expect(traceFailure.getSnapshot()).toMatchObject({
      status: 'failed',
      safeErrorCategory: 'TRACE_TRANSPORT',
    });
  });
});
