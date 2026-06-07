/**
 * Unit tests for employees fetcher — PR-029B
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

async function importEmployees() {
  await importApi();
  return import('../../src/lib/employees.js');
}

describe('fetchEmployees', () => {
  it('sends authenticated GET to /barbershops/:barbershopId/employees', async () => {
    const { fetchEmployees } = await importEmployees();
    const fakeEmployees = [
      {
        id: 'emp-1',
        barbershopId: 'shop-1',
        userId: 'user-1',
        isActive: true,
        createdAt: '2026-06-07T00:00:00.000Z',
        updatedAt: '2026-06-07T00:00:00.000Z',
        user: {
          id: 'user-1',
          email: 'owner@test.com',
          name: 'Owner Employee',
          role: 'BARBER',
        },
      },
    ];

    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeEmployees },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchEmployees(getToken, 'shop-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees',
      { headers: { Authorization: 'Bearer owner-token' } }
    );
    expect(result).toEqual(fakeEmployees);
  });

  it('handles API error', async () => {
    const { fetchEmployees } = await importEmployees();

    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');

    await expect(fetchEmployees(getToken, 'shop-1')).rejects.toThrow('Not allowed');
  });
});
