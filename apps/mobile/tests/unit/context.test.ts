/**
 * Unit tests for context fetcher — PR-028C
 *
 * Tests createAuthInterceptor and fetchCurrentUserContext
 * with mocked Axios responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Creates a fresh mock Axios instance for each test.
 * Must be called inside vi.mock factory to provide the instance.
 */
function createMockApi() {
  return {
    get: vi.fn(),
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

// Dynamic import helpers — modules are loaded fresh after resetModules
async function importApi() {
  const axios = await import('axios');
  vi.spyOn(axios.default, 'create').mockReturnValue(
    mockApi as unknown as ReturnType<typeof axios.default.create>
  );
  return import('../../src/lib/api.js');
}

async function importContext() {
  // Must import api first so axios.create is mocked
  await importApi();
  return import('../../src/lib/context.js');
}

describe('createAuthInterceptor', () => {
  it('sends authorization header when token is provided', async () => {
    const { createAuthInterceptor } = await importApi();
    const getToken = vi.fn().mockResolvedValue('clerk-jwt-123');
    const interceptor = createAuthInterceptor(getToken);

    const config = { headers: {} };
    const result = await interceptor(config);

    expect(getToken).toHaveBeenCalled();
    expect(result.headers).toHaveProperty('Authorization', 'Bearer clerk-jwt-123');
  });

  it('does not set authorization header when getToken returns null', async () => {
    const { createAuthInterceptor } = await importApi();
    const getToken = vi.fn().mockResolvedValue(null);
    const interceptor = createAuthInterceptor(getToken);

    const config = { headers: {} };
    const result = await interceptor(config);

    expect(result.headers).not.toHaveProperty('Authorization');
  });
});

describe('fetchCurrentUserContext', () => {
  it('returns typed CurrentUserContext on success', async () => {
    const { fetchCurrentUserContext } = await importContext();
    const fakeContext = {
      userId: 'user-1',
      role: 'OWNER',
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: fakeContext },
    });
    const getToken = vi.fn().mockResolvedValue('test-token');
    const result = await fetchCurrentUserContext(getToken);
    expect(result).toEqual(fakeContext);
    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith('/me/context', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('passes Bearer token via per-request header', async () => {
    const { fetchCurrentUserContext } = await importContext();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: { userId: 'u1', role: 'CLIENT', barbershopId: null, barbershopName: null, employeeId: null, employeeName: null } },
    });
    const getToken = vi.fn().mockResolvedValue('my-token');
    await fetchCurrentUserContext(getToken);
    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith('/me/context', {
      headers: { Authorization: 'Bearer my-token' },
    });
  });

  it('returns CLIENT context with all null fields', async () => {
    const { fetchCurrentUserContext } = await importContext();
    const clientContext = {
      userId: 'user-2',
      role: 'CLIENT',
      barbershopId: null,
      barbershopName: null,
      employeeId: null,
      employeeName: null,
    };
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: clientContext },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    const result = await fetchCurrentUserContext(getToken);
    expect(result.role).toBe('CLIENT');
    expect(result.barbershopId).toBeNull();
    expect(result.employeeId).toBeNull();
  });

  it('omits Authorization header when getToken returns null', async () => {
    const { fetchCurrentUserContext } = await importContext();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: { userId: 'u1', role: 'CLIENT', barbershopId: null, barbershopName: null, employeeId: null, employeeName: null } },
    });
    const getToken = vi.fn().mockResolvedValue(null);
    await fetchCurrentUserContext(getToken);
    expect(mockApi.get).toHaveBeenCalledWith('/me/context', {
      headers: undefined,
    });
  });

  it('returns BARBER context with employee details', async () => {
    const { fetchCurrentUserContext } = await importContext();
    const barberContext = {
      userId: 'user-3',
      role: 'BARBER',
      barbershopId: 'shop-1',
      barbershopName: 'Barber Shop',
      employeeId: 'emp-1',
      employeeName: 'Carlos',
    };
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: barberContext },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    const result = await fetchCurrentUserContext(getToken);
    expect(result.role).toBe('BARBER');
    expect(result.employeeId).toBe('emp-1');
    expect(result.employeeName).toBe('Carlos');
    expect(result.barbershopName).toBe('Barber Shop');
  });

  it('throws on API error response', async () => {
    const { fetchCurrentUserContext } = await importContext();
    mockApi.get.mockRejectedValueOnce(new Error('Network Error'));
    const getToken = vi.fn().mockResolvedValue('token');
    await expect(fetchCurrentUserContext(getToken)).rejects.toThrow('Network Error');
  });

  it('throws on unsuccessful API response', async () => {
    const { fetchCurrentUserContext } = await importContext();
    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    await expect(fetchCurrentUserContext(getToken)).rejects.toThrow();
  });
});