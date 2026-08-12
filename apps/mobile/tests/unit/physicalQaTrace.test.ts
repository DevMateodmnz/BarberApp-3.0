import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/lib/api.js';
import {
  MobileMutationError,
  classifyMobileMutationError,
  createMobileQaTraceContext,
  isMobilePhysicalQaTraceEnabled,
  traceMobileQaEvent,
} from '../../src/lib/physicalQaTrace.js';

describe('development-only mobile physical-QA tracing', () => {
  const originalDev = globalThis.__DEV__;
  const originalFlag = process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE;

  beforeEach(() => {
    globalThis.__DEV__ = true;
    process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE = 'true';
  });

  afterEach(() => {
    globalThis.__DEV__ = originalDev;
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE;
    } else {
      process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE = originalFlag;
    }
    vi.restoreAllMocks();
  });

  it('emits one bounded structured line without credentials or raw payloads', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const context = createMobileQaTraceContext(
      'loyalty-program-save',
      'promotions-loyalty',
    );

    traceMobileQaEvent({
      ...context,
      stage: 'mutation_started',
      visitsRequired: 2,
      templateSelected: true,
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toMatch(/^qa\.mobile\.event \{/u);
    expect(line).toContain('"visitsRequired":2');
    expect(line).toContain('"templateSelected":true');
    expect(line).not.toMatch(/token|phone|rewardCode|barbershopId/iu);
  });

  it('is disabled outside development even when the explicit flag is set', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    globalThis.__DEV__ = false;

    expect(isMobilePhysicalQaTraceEnabled()).toBe(false);
    traceMobileQaEvent({
      ...createMobileQaTraceContext(
        'loyalty-program-save',
        'promotions-loyalty',
      ),
      stage: 'press_received',
    });
    expect(info).not.toHaveBeenCalled();
  });

  it('classifies authentication, config, network, abort, timeout, and API failures safely', () => {
    expect(classifyMobileMutationError(
      new MobileMutationError('session missing', 'AUTH_TOKEN_UNAVAILABLE'),
    )).toBe('AUTH_TOKEN_UNAVAILABLE');
    expect(classifyMobileMutationError(
      Object.assign(new Error('bad config'), {
        name: 'PublicRuntimeConfigError',
      }),
    )).toBe('CONFIG_ERROR');
    expect(classifyMobileMutationError({
      isAxiosError: true,
      message: 'private network detail',
    })).toBe('NETWORK_ERROR');
    expect(classifyMobileMutationError({ code: 'ERR_CANCELED' })).toBe('ABORTED');
    expect(classifyMobileMutationError({ code: 'ECONNABORTED' })).toBe('TIMEOUT');
    expect(classifyMobileMutationError(new ApiError('bad request', 'BAD', 400)))
      .toBe('API_400');
    expect(classifyMobileMutationError(new ApiError('unauthorized', 'AUTH', 401)))
      .toBe('API_401');
    expect(classifyMobileMutationError(new ApiError('forbidden', 'AUTH', 403)))
      .toBe('API_403');
    expect(classifyMobileMutationError(new ApiError('server', 'ERR', 500)))
      .toBe('API_500');
  });
});
