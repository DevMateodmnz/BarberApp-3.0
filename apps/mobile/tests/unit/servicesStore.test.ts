/**
 * Unit tests for servicesStore — PR-042A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Service } from '../../src/lib/types.js';

const mockFetchBarbershopServices = vi.fn();

vi.mock('../../src/lib/services.js', () => ({
  fetchBarbershopServices: (...args: unknown[]) => mockFetchBarbershopServices(...args),
}));

// Dynamic import so the mock above is registered first
async function importStore() {
  return import('../../src/lib/servicesStore.js');
}

describe('useServicesStore', () => {
  beforeEach(async () => {
    const { useServicesStore } = await importStore();
    useServicesStore.setState({ services: [], isServicesLoading: false, servicesError: null });
    vi.clearAllMocks();
  });

  it('initial state is empty', async () => {
    const { useServicesStore } = await importStore();
    const state = useServicesStore.getState();
    expect(state.services).toEqual([]);
    expect(state.isServicesLoading).toBe(false);
    expect(state.servicesError).toBeNull();
  });

  it('loads services for a barbershop', async () => {
    const { useServicesStore } = await importStore();
    const fakeServices = [
      { id: 'svc-1', name: 'Classic Cut', priceCents: 2500 },
    ];
    mockFetchBarbershopServices.mockResolvedValueOnce(fakeServices);

    const getToken = vi.fn().mockResolvedValue('token');
    await useServicesStore.getState().loadServices(getToken, 'shop-1');

    expect(mockFetchBarbershopServices).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useServicesStore.getState().services).toEqual(fakeServices);
    expect(useServicesStore.getState().isServicesLoading).toBe(false);
  });

  it('no-ops when barbershopId is null', async () => {
    const { useServicesStore } = await importStore();
    const getToken = vi.fn();

    await useServicesStore.getState().loadServices(getToken, null);

    expect(mockFetchBarbershopServices).not.toHaveBeenCalled();
    expect(useServicesStore.getState().services).toEqual([]);
  });

  it('sets error state on failure', async () => {
    const { useServicesStore } = await importStore();
    mockFetchBarbershopServices.mockRejectedValueOnce(new Error('Network error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useServicesStore.getState().loadServices(getToken, 'shop-1');

    expect(useServicesStore.getState().servicesError).toBe('Network error');
    expect(useServicesStore.getState().isServicesLoading).toBe(false);
  });

  it('clearServices resets state', async () => {
    const { useServicesStore } = await importStore();
    useServicesStore.setState({
      services: [{ id: 'svc-1' } as Service],
      isServicesLoading: true,
      servicesError: 'err',
    });

    useServicesStore.getState().clearServices();

    const state = useServicesStore.getState();
    expect(state.services).toEqual([]);
    expect(state.isServicesLoading).toBe(false);
    expect(state.servicesError).toBeNull();
  });
});
