/**
 * Unit tests for context store — PR-028C
 *
 * Tests Zustand store behavior: loadContext, clearContext,
 * loading states, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CurrentUserContext } from '../../src/lib/types.js';

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
    vi.resetAllMocks();
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
    vi.mocked(fetchCurrentUserContext).mockReturnValueOnce(pending as Promise<CurrentUserContext>);

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

  // ---- Stale-state recovery tests ----
  // The Zustand store survives Expo Go hot reloads. If a previous render
  // cycle left isLoading: true (set but never cleared because the promise
  // chain was severed by a hot reload), the re-entrancy guard would
  // permanently block all future loadContext calls.  The stale-state
  // recovery heuristic must detect this and reset isLoading → false.

  it('recovers from stale loading state (isLoading=true, ctx=null, err=null)', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    // Simulate a stale store — set({ isLoading: true }) was called
    // but the promise was severed before resolve/reject.
    useContextStore.setState({ isLoading: true, context: null, error: null });

    const fakeContext = {
      userId: 'u1', role: 'OWNER' as const,
      barbershopId: 's1', barbershopName: 'Recovered Shop',
      employeeId: null, employeeName: null,
    };
    vi.mocked(fetchCurrentUserContext).mockResolvedValueOnce(fakeContext);

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    // Should have recovered: isLoading reset, then fetch proceeded
    expect(state.context).toEqual(fakeContext);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(fetchCurrentUserContext).toHaveBeenCalledTimes(1);
  });

  it('re-entrancy guard still blocks active call (isLoading=true, has error)', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    // This is NOT stale — it has an error (a real loading cycle completed
    // with failure).  The guard should still block.
    useContextStore.setState({ isLoading: true, context: null, error: 'Previous failure' });

    // NOTE: no mockResolvedValueOnce — the guard should block, so
    // fetchCurrentUserContext will never be called.

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    // Guard should have blocked — state remains unchanged
    expect(state.context).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.error).toBe('Previous failure');
    expect(fetchCurrentUserContext).not.toHaveBeenCalled();
  });

  it('re-entrancy guard still blocks active call (isLoading=true, has context)', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    const existingCtx = {
      userId: 'u1', role: 'OWNER' as const,
      barbershopId: 's1', barbershopName: 'Existing',
      employeeId: null, employeeName: null,
    };
    // isLoading=true WITH context — a real concurrent call is in progress
    useContextStore.setState({ isLoading: true, context: existingCtx, error: null });

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    expect(state.context).toEqual(existingCtx);
    expect(state.isLoading).toBe(true);
    expect(fetchCurrentUserContext).not.toHaveBeenCalled();
  });

  it('stale-state recovery does not interfere with normal first load', async () => {
    const { fetchCurrentUserContext } = await import('../../src/lib/context.js');
    const { useContextStore } = await import('../../src/lib/store.js');

    // Fresh store: everything null, isLoading false
    const fakeContext = {
      userId: 'u1', role: 'OWNER' as const,
      barbershopId: 's1', barbershopName: 'Normal Load',
      employeeId: null, employeeName: null,
    };
    vi.mocked(fetchCurrentUserContext).mockResolvedValueOnce(fakeContext);

    const getToken = vi.fn().mockResolvedValue('token');
    await useContextStore.getState().loadContext(getToken);

    const state = useContextStore.getState();
    expect(state.context).toEqual(fakeContext);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
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