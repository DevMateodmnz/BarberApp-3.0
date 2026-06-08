/**
 * Unit tests for employees fetcher — PR-029B
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
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

describe('deactivateEmployee', () => {
  it('sends DELETE to /barbershops/:barbershopId/employees/:employeeId', async () => {
    const { deactivateEmployee } = await importEmployees();

    mockApi.delete.mockResolvedValueOnce({
      data: { success: true, data: { message: 'Employee deactivated' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await deactivateEmployee(getToken, 'shop-1', 'emp-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.delete).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1',
      { headers: { Authorization: 'Bearer owner-token' } },
    );
  });

  it('throws on API error', async () => {
    const { deactivateEmployee } = await importEmployees();

    mockApi.delete.mockResolvedValueOnce({
      data: { success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      deactivateEmployee(getToken, 'shop-1', 'emp-1'),
    ).rejects.toThrow('Employee not found');
  });
});

describe('reactivateEmployee', () => {
  it('sends PATCH to /barbershops/:barbershopId/employees/:employeeId/reactivate', async () => {
    const { reactivateEmployee } = await importEmployees();

    const reactivated = {
      id: 'emp-1',
      barbershopId: 'shop-1',
      userId: 'user-1',
      isActive: true,
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
      user: { id: 'user-1', email: 'b@t.com', name: 'Barber One', role: 'BARBER' as const },
    };

    mockApi.patch.mockResolvedValueOnce({
      data: { success: true, data: reactivated },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await reactivateEmployee(getToken, 'shop-1', 'emp-1');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1/reactivate',
      undefined,
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result).toEqual(reactivated);
  });

  it('throws on API error', async () => {
    const { reactivateEmployee } = await importEmployees();

    mockApi.patch.mockResolvedValueOnce({
      data: { success: false, error: { code: 'CONFLICT', message: 'Already active' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      reactivateEmployee(getToken, 'shop-1', 'emp-1'),
    ).rejects.toThrow('Already active');
  });
});

describe('createEmployee', () => {
  it('sends POST to /barbershops/:barbershopId/employees with userId', async () => {
    const { createEmployee } = await importEmployees();

    const created = {
      id: 'emp-new',
      barbershopId: 'shop-1',
      userId: 'user-3',
      isActive: true,
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
      user: { id: 'user-3', email: 'new@t.com', name: 'New Barber', role: 'BARBER' as const },
    };

    mockApi.post.mockResolvedValueOnce({
      data: { success: true, data: created },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await createEmployee(getToken, 'shop-1', 'user-3');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees',
      { userId: 'user-3' },
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result).toEqual(created);
  });

  it('throws on API error', async () => {
    const { createEmployee } = await importEmployees();

    mockApi.post.mockResolvedValueOnce({
      data: { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      createEmployee(getToken, 'shop-1', 'nonexistent'),
    ).rejects.toThrow('User not found');
  });
});
