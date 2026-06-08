/**
 * Unit tests for barbershop services API helpers — PR-042A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
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
      { headers: { Authorization: 'Bearer owner-token' } },
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
