/**
 * Unit tests for context store — PR-028C
 *
 * Tests Zustand store behavior: loadContext, clearContext,
 * loading states, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the context fetcher before importing store
vi.mock('../../src/lib/context.js', () => ({
  fetchCurrentUserContext: vi.fn(),
}));

// Mock axios so api.ts doesn't fail
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

describe('useContextStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has correct initial state', async () => {
    const { useContextStore } = await import('../../src/lib/store.js');
    const state = useContextStore.getState();
    expect(state.context).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('loadContext sets context on success', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    const fakeContext = {
      userId: 'user-1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    vi.mocked(fetchCurrentUserContext).mockResolvedValueOnce(fakeContext);

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    expect(state.context).toEqual(fakeContext);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('loadContext sets error on failure', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    vi.mocked(fetchCurrentUserContext).mockRejectedValueOnce(new Error('Network Error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    expect(state.context).toBeNull();
    expect(state.error).toBe('Network Error');
    expect(state.isLoading).toBe(false);
  });

  it('loadContext sets isLoading during fetch', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    let resolvePromise!: (value: unknown) => void;
    const pending = new Promise((resolve) => { resolvePromise = resolve; });
    vi.mocked(fetchCurrentUserContext).mockReturnValueOnce(pending as any);

    const getToken = vi.fn().mockResolvedValue('token');
    const loadPromise = useContextStore.getState().loadContext(getToken);

    // While loading, isLoading should be true
    expect(useContextStore.getState().isLoading).toBe(true);

    resolvePromise({
      userId: 'u1', role: 'CLIENT', barbershopId: null,
      barbershopName: null, employeeId: null, employeeName: null,
    });

    await loadPromise;

    expect(useContextStore.getState().isLoading).toBe(false);
  });

  it('clearContext resets store state', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    const fakeContext = {
      userId: 'user-1', role: 'OWNER' as const,
      barbershopId: 'shop-1', barbershopName: 'Test Shop',
      employeeId: null, employeeName: null,
    };
    vi.mocked(fetchCurrentUserContext).mockResolvedValueOnce(fakeContext);

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);
    expect(useContextStore.getState().context).toEqual(fakeContext);

    useContextStore.getState().clearContext();
    expect(useContextStore.getState().context).toBeNull();
    expect(useContextStore.getState().error).toBeNull();
  });

  it('loadContext does not overwrite context on second successful call', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    const firstContext = {
      userId: 'u1', role: 'OWNER' as const,
      barbershopId: 's1', barbershopName: 'Shop One',
      employeeId: null, employeeName: null,
    };
    const secondContext = {
      userId: 'u1', role: 'OWNER' as const,
      barbershopId: 's2', barbershopName: 'Shop Two',
      employeeId: null, employeeName: null,
    };

    vi.mocked(fetchCurrentUserContext)
      .mockResolvedValueOnce(firstContext)
      .mockResolvedValueOnce(secondContext);

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);
    expect(useContextStore.getState().context?.barbershopName).toBe('Shop One');

    await useContextStore.getState().loadContext(getToken);
    expect(useContextStore.getState().context?.barbershopName).toBe('Shop Two');
  });
});