import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiPut = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api.js')>();
  return {
    ...actual,
    api: {
      put: apiPut,
    },
  };
});

import { ApiError } from '../../src/lib/api.js';
import { updateLoyaltyProgram } from '../../src/lib/promotions.js';
import { MobileMutationError } from '../../src/lib/physicalQaTrace.js';

const traceContext = {
  action: 'loyalty-program-save',
  attemptId: 'qa-attempt-1',
  screen: 'promotions-loyalty',
} as const;

const payload = {
  isEnabled: true,
  visitsRequired: 2,
  rewardPromotionId: 'promotion-1',
  rewardValidityDays: 30,
};

describe('loyalty update pre-request and request failures', () => {
  const originalDev = globalThis.__DEV__;
  const originalFlag = process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE;

  beforeEach(() => {
    apiPut.mockReset();
    globalThis.__DEV__ = true;
    process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE = 'true';
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
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

  it('stops before the request and classifies an unavailable Clerk token', async () => {
    await expect(updateLoyaltyProgram(
      async () => null,
      'shop-1',
      payload,
      traceContext,
    )).rejects.toMatchObject<Partial<MobileMutationError>>({
      safeCode: 'AUTH_TOKEN_UNAVAILABLE',
    });

    expect(apiPut).not.toHaveBeenCalled();
    expect(traceStages()).toEqual(['token_started']);
  });

  it('stops before the request and classifies a thrown Clerk token lookup', async () => {
    await expect(updateLoyaltyProgram(
      async () => {
        throw new Error('Clerk unavailable');
      },
      'shop-1',
      payload,
      traceContext,
    )).rejects.toMatchObject<Partial<MobileMutationError>>({
      safeCode: 'AUTH_TOKEN_ERROR',
    });

    expect(apiPut).not.toHaveBeenCalled();
    expect(traceStages()).toEqual(['token_started']);
  });

  it('correlates the request and records a successful response without logging the token', async () => {
    apiPut.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          id: 'program-1',
          ...payload,
          rewardPromotion: null,
        },
      },
    });

    await updateLoyaltyProgram(
      async () => 'private-owner-token',
      'shop-1',
      payload,
      traceContext,
    );

    expect(apiPut).toHaveBeenCalledWith(
      '/barbershops/shop-1/loyalty-program',
      payload,
      {
        headers: {
          Authorization: 'Bearer private-owner-token',
          'X-Request-Id': 'qa-attempt-1',
        },
      },
    );
    expect(traceStages()).toEqual([
      'token_started',
      'request_started',
      'response_received',
    ]);
    expect(traceLines().join('\n')).not.toContain('private-owner-token');
  });

  it.each([
    [400, 'API_400'],
    [401, 'API_401'],
    [403, 'API_403'],
    [500, 'API_500'],
  ] as const)('records a safe response classification for HTTP %s', async (
    status,
    safeErrorCode,
  ) => {
    apiPut.mockRejectedValueOnce(new ApiError('safe server message', 'ERROR', status));

    await expect(updateLoyaltyProgram(
      async () => 'private-owner-token',
      'shop-1',
      payload,
      traceContext,
    )).rejects.toBeInstanceOf(ApiError);

    const events = traceLines().map(parseTraceLine);
    expect(events.at(-1)).toMatchObject({
      stage: 'response_received',
      status,
      safeErrorCode,
    });
  });

  it.each([
    [{ isAxiosError: true }, 'network request'],
    [{ code: 'ERR_CANCELED' }, 'aborted request'],
    [{ code: 'ECONNABORTED' }, 'timed out request'],
  ])('leaves %s for the screen-level mutation failure classifier', async (
    rejection,
  ) => {
    apiPut.mockRejectedValueOnce(rejection);

    await expect(updateLoyaltyProgram(
      async () => 'private-owner-token',
      'shop-1',
      payload,
      traceContext,
    )).rejects.toBe(rejection);

    expect(traceStages()).toEqual(['token_started', 'request_started']);
  });
});

function traceLines(): string[] {
  // eslint-disable-next-line no-console
  return vi.mocked(console.info).mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith('qa.mobile.event '));
}

function parseTraceLine(line: string): Record<string, unknown> {
  return JSON.parse(line.slice('qa.mobile.event '.length)) as Record<string, unknown>;
}

function traceStages(): string[] {
  return traceLines().map((line) => String(parseTraceLine(line).stage));
}
