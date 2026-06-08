/**
 * Unit tests for servicesStore — PR-042A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Service } from '../../src/lib/types.js';

const mockFetchBarbershopServices = vi.fn();
const mockCreateBarbershopService = vi.fn();
const mockUpdateBarbershopService = vi.fn();

vi.mock('../../src/lib/services.js', () => ({
  fetchBarbershopServices: (...args: unknown[]) => mockFetchBarbershopServices(...args),
  createBarbershopService: (...args: unknown[]) => mockCreateBarbershopService(...args),
  updateBarbershopService: (...args: unknown[]) => mockUpdateBarbershopService(...args),
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

  it('createService sends input and prepends to list', async () => {
    const { useServicesStore } = await importStore();
    const fakeService = { id: 'svc-new', name: 'New Cut', durationMinutes: 30, priceCents: 2500 };
    mockCreateBarbershopService.mockResolvedValueOnce(fakeService);

    // Pre-populate with an existing service
    useServicesStore.setState({ services: [{ id: 'svc-old', name: 'Old Cut' } as Service] });

    const getToken = vi.fn().mockResolvedValue('token');
    const input = { name: 'New Cut', durationMinutes: 30, priceCents: 2500 };
    const result = await useServicesStore.getState().createService(getToken, 'shop-1', input);

    expect(mockCreateBarbershopService).toHaveBeenCalledWith(getToken, 'shop-1', input);
    expect(result).toEqual(fakeService);
    // New service should be prepended
    expect(useServicesStore.getState().services).toEqual([fakeService, { id: 'svc-old', name: 'Old Cut' }]);
  });

  it('createService throws on API error', async () => {
    const { useServicesStore } = await importStore();
    mockCreateBarbershopService.mockRejectedValueOnce(new Error('Name is required'));

    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      useServicesStore.getState().createService(getToken, 'shop-1', { name: '', durationMinutes: 30, priceCents: 2500 }),
    ).rejects.toThrow('Name is required');
  });

  it('updateService sends input and replaces in list', async () => {
    const { useServicesStore } = await importStore();
    const original = { id: 'svc-1', name: 'Old Cut', durationMinutes: 30, priceCents: 2000 };
    const updated = { id: 'svc-1', name: 'New Cut', durationMinutes: 45, priceCents: 3000 };
    mockUpdateBarbershopService.mockResolvedValueOnce(updated);

    useServicesStore.setState({ services: [original] });

    const getToken = vi.fn().mockResolvedValue('token');
    const input = { name: 'New Cut', durationMinutes: 45, priceCents: 3000 };
    const result = await useServicesStore.getState().updateService(getToken, 'shop-1', 'svc-1', input);

    expect(mockUpdateBarbershopService).toHaveBeenCalledWith(getToken, 'shop-1', 'svc-1', input);
    expect(result).toEqual(updated);
    expect(useServicesStore.getState().services).toEqual([updated]);
  });

  it('updateService throws on API error', async () => {
    const { useServicesStore } = await importStore();
    mockUpdateBarbershopService.mockRejectedValueOnce(new Error('Not found'));

    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      useServicesStore.getState().updateService(getToken, 'shop-1', 'svc-1', { name: 'X' }),
    ).rejects.toThrow('Not found');
  });
});
