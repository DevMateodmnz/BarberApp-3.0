/**
 * Unit tests for context store bootstrap + context loading.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUserContext } from '../../src/lib/types.js';

const mockFetchCurrentUserContext = vi.fn();
const mockReconcileEmployeeInvitationOnboarding = vi.fn();

vi.mock('../../src/lib/context.js', () => ({
  fetchCurrentUserContext: (...args: unknown[]) => mockFetchCurrentUserContext(...args),
}));

vi.mock('../../src/lib/employeeInvitations.js', () => ({
  reconcileEmployeeInvitationOnboarding: (...args: unknown[]) =>
    mockReconcileEmployeeInvitationOnboarding(...args),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      defaults: {},
    })),
  },
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function makeContext(
  overrides: Partial<CurrentUserContext> = {},
): CurrentUserContext {
  return {
    userId: 'user-1',
    role: 'OWNER',
    barbershopId: 'shop-1',
    barbershopName: 'Main Shop',
    employeeId: null,
    employeeName: null,
    ...overrides,
  };
}

async function importStore() {
  return import('../../src/lib/store.js');
}

describe('useContextStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('has the expected initial state', async () => {
    const { useContextStore } = await importStore();
    expect(useContextStore.getState()).toMatchObject({
      context: null,
      isLoading: false,
      error: null,
      bootstrapStatus: 'idle',
      bootstrapErrorKey: null,
      activeClerkUserId: null,
      lastBootstrapOutcome: null,
    });
  });

  it('loadContext sets context on success', async () => {
    const { useContextStore } = await importStore();
    mockFetchCurrentUserContext.mockResolvedValueOnce(makeContext());

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    expect(mockFetchCurrentUserContext).toHaveBeenCalledWith(getToken);
    expect(useContextStore.getState()).toMatchObject({
      context: makeContext(),
      isLoading: false,
      error: null,
      bootstrapStatus: 'ready',
    });
  });

  it('loadContext sets retryable error state on failure', async () => {
    const { useContextStore } = await importStore();
    mockFetchCurrentUserContext.mockRejectedValueOnce(new Error('Network Error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    expect(useContextStore.getState()).toMatchObject({
      context: null,
      error: 'Network Error',
      isLoading: false,
      bootstrapStatus: 'retryable_error',
      bootstrapErrorKey: 'networkError',
    });
  });

  it('recovers from stale loading state but does not break a real bootstrap reconciliation', async () => {
    const { useContextStore } = await importStore();
    const pendingContext = deferred<CurrentUserContext>();

    useContextStore.setState({
      isLoading: true,
      context: null,
      error: null,
      bootstrapStatus: 'idle',
    });
    mockFetchCurrentUserContext.mockReturnValueOnce(pendingContext.promise);

    const getToken = vi.fn().mockResolvedValue('token');
    const loadPromise = useContextStore.getState().loadContext(getToken);
    expect(useContextStore.getState().isLoading).toBe(true);

    pendingContext.resolve(makeContext({ barbershopName: 'Recovered Shop' }));
    await loadPromise;
    expect(useContextStore.getState().context?.barbershopName).toBe('Recovered Shop');

    useContextStore.setState({
      isLoading: true,
      context: null,
      error: null,
      bootstrapStatus: 'reconciling',
    });
    await useContextStore.getState().loadContext(getToken);
    expect(mockFetchCurrentUserContext).toHaveBeenCalledTimes(1);
  });

  it('clearContext resets bootstrap and context state', async () => {
    const { useContextStore } = await importStore();
    useContextStore.setState({
      context: makeContext(),
      isLoading: true,
      error: 'oops',
      bootstrapStatus: 'terminal_error',
      bootstrapErrorKey: 'userRoleNotEligible',
      activeClerkUserId: 'clerk-user-1',
      lastBootstrapOutcome: 'reconciled',
    });

    useContextStore.getState().clearContext();
    expect(useContextStore.getState()).toMatchObject({
      context: null,
      isLoading: false,
      error: null,
      bootstrapStatus: 'idle',
      bootstrapErrorKey: null,
      activeClerkUserId: null,
      lastBootstrapOutcome: null,
    });
  });

  it('reconciles before loading /me/context for existing users', async () => {
    const { useContextStore } = await importStore();
    mockReconcileEmployeeInvitationOnboarding.mockResolvedValueOnce({
      outcome: 'ready',
      userId: 'user-1',
      employeeId: 'emp-1',
      barbershopId: 'shop-1',
    });
    mockFetchCurrentUserContext.mockResolvedValueOnce(makeContext());

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });

    expect(mockReconcileEmployeeInvitationOnboarding).toHaveBeenCalledTimes(1);
    expect(mockFetchCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(
      mockReconcileEmployeeInvitationOnboarding.mock.invocationCallOrder[0],
    ).toBeLessThan(mockFetchCurrentUserContext.mock.invocationCallOrder[0]);
    expect(useContextStore.getState()).toMatchObject({
      context: makeContext(),
      bootstrapStatus: 'ready',
      activeClerkUserId: 'clerk-user-1',
      lastBootstrapOutcome: 'ready',
    });
  });

  it('treats reconciled and already_reconciled as successful bootstrap outcomes', async () => {
    const { useContextStore } = await importStore();

    mockReconcileEmployeeInvitationOnboarding.mockResolvedValueOnce({
      outcome: 'reconciled',
      userId: 'user-2',
      employeeId: 'emp-2',
      barbershopId: 'shop-2',
    });
    mockFetchCurrentUserContext.mockResolvedValueOnce(
      makeContext({
        userId: 'user-2',
        role: 'BARBER',
        employeeId: 'emp-2',
        employeeName: 'Invited Barber',
      }),
    );

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-2',
      getToken,
    });
    expect(useContextStore.getState().lastBootstrapOutcome).toBe('reconciled');

    useContextStore.getState().clearContext();
    mockReconcileEmployeeInvitationOnboarding.mockResolvedValueOnce({
      outcome: 'already_reconciled',
      userId: 'user-3',
      employeeId: 'emp-3',
      barbershopId: 'shop-3',
    });
    mockFetchCurrentUserContext.mockResolvedValueOnce(
      makeContext({ userId: 'user-3', employeeId: 'emp-3' }),
    );
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-3',
      getToken,
    });

    expect(useContextStore.getState().lastBootstrapOutcome).toBe('already_reconciled');
    expect(mockFetchCurrentUserContext).toHaveBeenCalledTimes(2);
  });

  it('does not call /me/context after onboarding-required or role-ineligible reconcile failures', async () => {
    const { useContextStore } = await importStore();
    const { ApiError } = await import('../../src/lib/api.js');
    const getToken = vi.fn().mockResolvedValue('token');

    mockReconcileEmployeeInvitationOnboarding.mockRejectedValueOnce(
      new ApiError('Need invitation', 'ONBOARDING_INVITATION_REQUIRED', 409),
    );
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });
    expect(useContextStore.getState()).toMatchObject({
      bootstrapStatus: 'onboarding_required',
      bootstrapErrorKey: 'onboardingInvitationRequired',
      context: null,
    });
    expect(mockFetchCurrentUserContext).not.toHaveBeenCalled();

    useContextStore.getState().clearContext();
    mockReconcileEmployeeInvitationOnboarding.mockRejectedValueOnce(
      new ApiError('Wrong role', 'USER_ROLE_NOT_ELIGIBLE', 409),
    );
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-2',
      getToken,
    });
    expect(useContextStore.getState()).toMatchObject({
      bootstrapStatus: 'terminal_error',
      bootstrapErrorKey: 'userRoleNotEligible',
      context: null,
    });
    expect(mockFetchCurrentUserContext).not.toHaveBeenCalled();
  });

  it('allows retry after a retryable reconciliation failure', async () => {
    const { useContextStore } = await importStore();
    const { ApiError } = await import('../../src/lib/api.js');

    mockReconcileEmployeeInvitationOnboarding.mockRejectedValueOnce(
      new ApiError('rate limited', 'EMPLOYEE_INVITATION_RATE_LIMITED', 429),
    );
    mockReconcileEmployeeInvitationOnboarding.mockResolvedValueOnce({
      outcome: 'ready',
      userId: 'user-1',
      employeeId: 'emp-1',
      barbershopId: 'shop-1',
    });
    mockFetchCurrentUserContext.mockResolvedValueOnce(makeContext());

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });
    expect(useContextStore.getState().bootstrapStatus).toBe('retryable_error');

    await useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });
    expect(useContextStore.getState()).toMatchObject({
      bootstrapStatus: 'ready',
      context: makeContext(),
    });
    expect(mockReconcileEmployeeInvitationOnboarding).toHaveBeenCalledTimes(2);
  });

  it('deduplicates simultaneous bootstrap calls for the same Clerk identity', async () => {
    const { useContextStore } = await importStore();
    const pendingReconcile = deferred<{
      outcome: 'ready';
      userId: string;
      employeeId: string;
      barbershopId: string;
    }>();

    mockReconcileEmployeeInvitationOnboarding.mockReturnValueOnce(pendingReconcile.promise);
    mockFetchCurrentUserContext.mockResolvedValueOnce(makeContext());

    const getToken = vi.fn().mockResolvedValue('token');
    const first = useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });
    const second = useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });

    pendingReconcile.resolve({
      outcome: 'ready',
      userId: 'user-1',
      employeeId: 'emp-1',
      barbershopId: 'shop-1',
    });
    await Promise.all([first, second]);

    expect(mockReconcileEmployeeInvitationOnboarding).toHaveBeenCalledTimes(1);
    expect(mockFetchCurrentUserContext).toHaveBeenCalledTimes(1);
  });

  it('ignores stale prior-user results after sign-out and Clerk identity change', async () => {
    const { useContextStore } = await importStore();
    const firstReconcile = deferred<{
      outcome: 'ready';
      userId: string;
      employeeId: string;
      barbershopId: string;
    }>();
    const secondReconcile = deferred<{
      outcome: 'reconciled';
      userId: string;
      employeeId: string;
      barbershopId: string;
    }>();
    const firstContext = deferred<CurrentUserContext>();
    const secondContext = deferred<CurrentUserContext>();

    mockReconcileEmployeeInvitationOnboarding
      .mockReturnValueOnce(firstReconcile.promise)
      .mockReturnValueOnce(secondReconcile.promise);
    mockFetchCurrentUserContext
      .mockReturnValueOnce(firstContext.promise)
      .mockReturnValueOnce(secondContext.promise);

    const getToken = vi.fn().mockResolvedValue('token');
    const firstBootstrap = useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-1',
      getToken,
    });
    firstReconcile.resolve({
      outcome: 'ready',
      userId: 'user-1',
      employeeId: 'emp-1',
      barbershopId: 'shop-1',
    });
    await flushMicrotasks();
    expect(mockFetchCurrentUserContext).toHaveBeenCalledTimes(1);
    useContextStore.getState().clearContext();
    const secondBootstrap = useContextStore.getState().bootstrapAuthenticatedContext({
      clerkUserId: 'clerk-user-2',
      getToken,
    });

    secondReconcile.resolve({
      outcome: 'reconciled',
      userId: 'user-2',
      employeeId: 'emp-2',
      barbershopId: 'shop-2',
    });
    firstContext.resolve(makeContext({ userId: 'user-1', barbershopName: 'Old Shop' }));
    secondContext.resolve(makeContext({ userId: 'user-2', barbershopName: 'Current Shop' }));

    await Promise.all([firstBootstrap, secondBootstrap]);

    expect(useContextStore.getState()).toMatchObject({
      context: makeContext({ userId: 'user-2', barbershopName: 'Current Shop' }),
      activeClerkUserId: 'clerk-user-2',
      lastBootstrapOutcome: 'reconciled',
    });
  });
});
