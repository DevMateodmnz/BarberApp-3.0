/**
 * Unit tests for employee services fetcher — PR-029B
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
    mockApi as unknown as ReturnType<typeof axios.default.create>
  );
  return import('../../src/lib/api.js');
}

async function importEmployeeServices() {
  await importApi();
  return import('../../src/lib/employeeServices.js');
}

describe('fetchEmployeeServices', () => {
  it('sends authenticated GET to /barbershops/:barbershopId/employees/:employeeId/services', async () => {
    const { fetchEmployeeServices } = await importEmployeeServices();
    const fakeServices = [
      {
        id: 'svc-1',
        barbershopId: 'shop-1',
        name: 'Classic Cut',
        description: null,
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
        isActive: true,
        createdAt: '2026-06-07T00:00:00.000Z',
        updatedAt: '2026-06-07T00:00:00.000Z',
      },
    ];

    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeServices },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchEmployeeServices(getToken, 'shop-1', 'emp-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1/services',
      { headers: { Authorization: 'Bearer owner-token' } }
    );
    expect(result).toEqual(fakeServices);
  });

  it('handles API error', async () => {
    const { fetchEmployeeServices } = await importEmployeeServices();

    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'BAD_REQUEST', message: 'Employee not found' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');

    await expect(fetchEmployeeServices(getToken, 'shop-1', 'emp-1')).rejects.toThrow('Employee not found');
  });
});

describe('fetchMyAssignedServices', () => {
  it('sends authenticated GET to /barbershops/:barbershopId/me/services', async () => {
    const { fetchMyAssignedServices } = await importEmployeeServices();
    const fakeServices = [
      {
        id: 'svc-1',
        name: 'Classic Cut',
        description: null,
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
        isActive: true,
      },
    ];

    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeServices },
    });

    const getToken = vi.fn().mockResolvedValue('barber-token');
    const result = await fetchMyAssignedServices(getToken, 'shop-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/me/services',
      { headers: { Authorization: 'Bearer barber-token' } }
    );
    expect(result).toEqual(fakeServices);
  });

  it('handles API error', async () => {
    const { fetchMyAssignedServices } = await importEmployeeServices();

    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
    });

    const getToken = vi.fn().mockResolvedValue('barber-token');

    await expect(fetchMyAssignedServices(getToken, 'shop-1')).rejects.toThrow('Not allowed');
  });
});
