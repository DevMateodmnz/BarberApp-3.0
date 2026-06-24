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

beforeEach(async () => {
  const { mobileLocalizationRuntime } = await import('../../src/i18n/runtime.js');
  await mobileLocalizationRuntime.i18n.changeLanguage('en');
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
  it('sends POST with userId when identifier does not contain @', async () => {
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

  it('sends POST with email when identifier contains @', async () => {
    const { createEmployee } = await importEmployees();

    const created = {
      id: 'emp-new',
      barbershopId: 'shop-1',
      userId: 'user-3',
      isActive: true,
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z',
      user: { id: 'user-3', email: 'barber@test.com', name: 'Barber', role: 'BARBER' as const },
    };

    mockApi.post.mockResolvedValueOnce({
      data: { success: true, data: created },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await createEmployee(getToken, 'shop-1', '  Barber@TEST.com  ');

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees',
      { email: 'barber@test.com' },
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

// ============================================
// friendlyCreateEmployeeError — PR-067A
// ============================================

describe('friendlyCreateEmployeeError', () => {
  it('maps "User not found" to a user-friendly message', async () => {
    const { friendlyCreateEmployeeError } = await importEmployees();
    const result = friendlyCreateEmployeeError('User not found');
    expect(result).toBe(
      'No account found with this email or ID. Make sure the person has logged in at least once.',
    );
  });

  it('maps "User is already an employee of this barbershop" to a user-friendly message', async () => {
    const { friendlyCreateEmployeeError } = await importEmployees();
    const result = friendlyCreateEmployeeError(
      'User is already an employee of this barbershop',
    );
    expect(result).toBe('This person is already an employee of this barbershop.');
  });

  it('passes through unknown messages unchanged', async () => {
    const { friendlyCreateEmployeeError } = await importEmployees();
    const result = friendlyCreateEmployeeError('Network error');
    expect(result).toBe('Something went wrong. Please try again. [Network error]');
  });

  it('passes through "Provide exactly one of: userId or email" unchanged', async () => {
    const { friendlyCreateEmployeeError } = await importEmployees();
    const result = friendlyCreateEmployeeError(
      'Provide exactly one of: userId or email',
    );
    expect(result).toBe(
      'Something went wrong. Please try again. [Provide exactly one of: userId or email]',
    );
  });

  // PR-068A: structured ApiError matching — robust against message rewording
  describe('with ApiError (structured)', () => {
    async function getApiError() {
      const apiModule = await importApi();
      return apiModule.ApiError;
    }

    it('maps ApiError with status=404 to user-friendly message (even with random message)', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      const err = new ApiError('Some completely different error text', 'NOT_FOUND', 404);
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe(
        'No account found with this email or ID. Make sure the person has logged in at least once.',
      );
    });

    it('maps ApiError with code=NOT_FOUND to user-friendly message (even with random message)', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      const err = new ApiError('User does not exist in the database', 'NOT_FOUND');
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe(
        'No account found with this email or ID. Make sure the person has logged in at least once.',
      );
    });

    it('maps ApiError with status=409 to duplicate-employee message', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      const err = new ApiError('Employee relationship exists already', 'CONFLICT', 409);
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe('This person is already an employee of this barbershop.');
    });

    it('maps ApiError with code=CONFLICT to duplicate-employee message', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      const err = new ApiError('Resource conflict', 'CONFLICT');
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe('This person is already an employee of this barbershop.');
    });

    it('falls through to message matching when status/code are unknown', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      // status 400 with code VALIDATION_ERROR — not explicitly handled, so it
      // uses the localized generic fallback plus development diagnostics.
      const err = new ApiError('User not found', 'VALIDATION_ERROR', 400);
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe('Something went wrong. Please try again. [User not found]');
    });

    it('passes through completely unknown ApiError unchanged', async () => {
      const { friendlyCreateEmployeeError } = await importEmployees();
      const ApiError = await getApiError();
      const err = new ApiError('Something exploded', undefined, 500);
      const result = friendlyCreateEmployeeError(err);
      expect(result).toBe('Something went wrong. Please try again. [Something exploded]');
    });
  });
});

// ============================================
// createEmployee ApiError — PR-068A (defense-in-depth for 2xx + success:false)
// ============================================

describe('createEmployee ApiError (defense-in-depth)', () => {
  it('throws ApiError on 200 with success:false and NOT_FOUND code', async () => {
    const { createEmployee } = await importEmployees();
    const apiModule = await importApi();
    const ApiError = apiModule.ApiError;

    // Simulate a 200 response with structured error — the interceptor
    // passes 2xx through, so createEmployee's own check fires.
    mockApi.post.mockResolvedValueOnce({
      status: 200,
      data: { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');

    let caught: unknown;
    try {
      await createEmployee(getToken, 'shop-1', 'noone@test.com');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as InstanceType<typeof ApiError>;
    expect(apiErr.message).toBe('Something went wrong. Please try again. [User not found]');
    expect(apiErr.code).toBe('NOT_FOUND');
    expect(apiErr.status).toBe(200);
  });

  it('throws ApiError on 200 with success:false and CONFLICT code', async () => {
    const { createEmployee } = await importEmployees();
    const apiModule = await importApi();
    const ApiError = apiModule.ApiError;

    mockApi.post.mockResolvedValueOnce({
      status: 200,
      data: { success: false, error: { code: 'CONFLICT', message: 'User is already an employee of this barbershop' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');

    let caught: unknown;
    try {
      await createEmployee(getToken, 'shop-1', 'existing@test.com');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as InstanceType<typeof ApiError>;
    expect(apiErr.message).toBe(
      'Something went wrong. Please try again. [User is already an employee of this barbershop]',
    );
    expect(apiErr.code).toBe('CONFLICT');
    expect(apiErr.status).toBe(200);
  });
});

// ============================================
// toApiError — PR-070B: normalise Axios non-2xx → ApiError
// ============================================

describe('toApiError (interceptor)', () => {
  async function getToApiError() {
    const apiModule = await importApi();
    return apiModule.toApiError;
  }

  async function getApiErrorClass() {
    const apiModule = await importApi();
    return apiModule.ApiError;
  }

  it('converts Axios 404 rejection to ApiError with NOT_FOUND', async () => {
    const toApiError = await getToApiError();
    const ApiError = await getApiErrorClass();

    const axiosError = {
      message: 'Request failed with status code 404',
      response: {
        status: 404,
        data: { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
      },
    };

    let caught: unknown;
    try {
      toApiError(axiosError);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as InstanceType<typeof ApiError>;
    expect(apiErr.message).toBe('User not found');
    expect(apiErr.code).toBe('NOT_FOUND');
    expect(apiErr.status).toBe(404);
  });

  it('converts Axios 409 rejection to ApiError with CONFLICT', async () => {
    const toApiError = await getToApiError();
    const ApiError = await getApiErrorClass();

    const axiosError = {
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: { success: false, error: { code: 'CONFLICT', message: 'User is already an employee of this barbershop' } },
      },
    };

    let caught: unknown;
    try {
      toApiError(axiosError);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as InstanceType<typeof ApiError>;
    expect(apiErr.message).toBe('User is already an employee of this barbershop');
    expect(apiErr.code).toBe('CONFLICT');
    expect(apiErr.status).toBe(409);
  });

  it('falls back to Axios error message when response.data.error is missing', async () => {
    const toApiError = await getToApiError();
    const ApiError = await getApiErrorClass();

    const axiosError = {
      message: 'Request failed with status code 500',
      response: {
        status: 500,
        data: { success: false },
      },
    };

    let caught: unknown;
    try {
      toApiError(axiosError);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as InstanceType<typeof ApiError>;
    expect(apiErr.message).toBe('Request failed with status code 500');
    expect(apiErr.code).toBeUndefined();
    expect(apiErr.status).toBe(500);
  });

  it('re-throws network error (no response) unchanged', async () => {
    const toApiError = await getToApiError();

    const networkError = new Error('Network Error');

    let caught: unknown;
    try {
      toApiError(networkError);
    } catch (err) {
      caught = err;
    }

    // Should be the same Error instance, not an ApiError
    expect(caught).toBe(networkError);
    expect(caught).not.toBeInstanceOf((await getApiErrorClass()));
  });

  it('re-throws non-object errors unchanged', async () => {
    const toApiError = await getToApiError();

    let caught: unknown;
    try {
      toApiError('raw string error');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBe('raw string error');
  });
});
