/**
 * Unit tests for barbershop services API helpers — PR-042A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  };
}

let mockApi: ReturnType<typeof createMockApi>;

beforeEach(() => {
  vi.resetModules();
  mockApi = createMockApi();
});

async function importApi() {
  const axios = await import('axios');
  vi.spyOn(axios.default, 'create').mockReturnValue(
    mockApi as unknown as ReturnType<typeof axios.default.create>,
  );
  return import('../../src/lib/api.js');
}

async function importServices() {
  await importApi();
  return import('../../src/lib/services.js');
}

describe('fetchBarbershopServices', () => {
  it('sends authenticated GET to /barbershops/:id/services', async () => {
    const { fetchBarbershopServices } = await importServices();
    const fakeServices = [
      { id: 'svc-1', name: 'Classic Cut', priceCents: 2500, durationMinutes: 30, isActive: true },
    ];

    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeServices },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchBarbershopServices(getToken, 'shop-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/services',
      {
        headers: { Authorization: 'Bearer owner-token' },
        params: {},
      },
    );
    expect(result).toEqual(fakeServices);
  });

  it('sends includeInactive=true when option is set', async () => {
    const { fetchBarbershopServices } = await importServices();
    const fakeServices = [
      { id: 'svc-1', name: 'Active', isActive: true },
      { id: 'svc-2', name: 'Inactive', isActive: false },
    ];

    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeServices },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchBarbershopServices(getToken, 'shop-1', { includeInactive: true });

    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/services',
      {
        headers: { Authorization: 'Bearer owner-token' },
        params: { includeInactive: 'true' },
      },
    );
    expect(result).toEqual(fakeServices);
  });

  it('handles API error', async () => {
    const { fetchBarbershopServices } = await importServices();

    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } },
    });

    const getToken = vi.fn().mockResolvedValue('barber-token');
    await expect(
      fetchBarbershopServices(getToken, 'shop-1'),
    ).rejects.toThrow('Not authorized');
  });
});

describe('createBarbershopService', () => {
  it('sends authenticated POST with correct body', async () => {
    const { createBarbershopService } = await importServices();
    const fakeService = {
      id: 'svc-new', name: 'New Cut', durationMinutes: 30, priceCents: 2500, isActive: true,
    };

    mockApi.post.mockResolvedValueOnce({
      data: { success: true, data: fakeService },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const input = { name: 'New Cut', durationMinutes: 30, priceCents: 2500 };
    const result = await createBarbershopService(getToken, 'shop-1', input);

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/services',
      input,
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result).toEqual(fakeService);
  });

  it('handles API error on create', async () => {
    const { createBarbershopService } = await importServices();

    mockApi.post.mockResolvedValueOnce({
      data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      createBarbershopService(getToken, 'shop-1', { name: '', durationMinutes: 30, priceCents: 2500 }),
    ).rejects.toThrow('Name is required');
  });
});

describe('updateBarbershopService', () => {
  it('sends authenticated PATCH with correct body', async () => {
    const { updateBarbershopService } = await importServices();
    const updatedService = {
      id: 'svc-1', name: 'Updated Cut', durationMinutes: 45, priceCents: 3000, isActive: true,
    };

    mockApi.patch.mockResolvedValueOnce({
      data: { success: true, data: updatedService },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const input = { name: 'Updated Cut', durationMinutes: 45, priceCents: 3000 };
    const result = await updateBarbershopService(getToken, 'shop-1', 'svc-1', input);

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/barbershops/shop-1/services/svc-1',
      input,
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result).toEqual(updatedService);
  });

  it('handles API error on update', async () => {
    const { updateBarbershopService } = await importServices();

    mockApi.patch.mockResolvedValueOnce({
      data: { success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      updateBarbershopService(getToken, 'shop-1', 'svc-1', { name: 'X' }),
    ).rejects.toThrow('Service not found');
  });
});
