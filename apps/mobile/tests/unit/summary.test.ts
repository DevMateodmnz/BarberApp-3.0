/**
 * Unit tests for summary fetchers — PR-028D
 *
 * Tests fetchBarbershopDailySummary and fetchEmployeeDailySummary
 * with mocked Axios responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

async function importApi() {
  const axios = await import('axios');
  vi.spyOn(axios.default, 'create').mockReturnValue(
    mockApi as unknown as ReturnType<typeof axios.default.create>
  );
  return import('../../src/lib/api.js');
}

async function importSummary() {
  await importApi();
  return import('../../src/lib/summary.js');
}

const FAKE_OWNER_SUMMARY = {
  date: '2026-06-06',
  totalRecords: 5,
  totalRevenueCents: 15000,
  byEmployee: [
    { employeeId: 'emp-1', employeeName: 'Carlos', recordsCount: 3, revenueCents: 9000 },
    { employeeId: 'emp-2', employeeName: 'Ana', recordsCount: 2, revenueCents: 6000 },
  ],
  byPaymentMethod: [
    { paymentMethod: 'CASH', recordsCount: 3, revenueCents: 8000 },
    { paymentMethod: 'CARD', recordsCount: 2, revenueCents: 7000 },
  ],
};

const FAKE_EMPLOYEE_SUMMARY = {
  date: '2026-06-06',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
  totalRecords: 3,
  totalRevenueCents: 9000,
  byPaymentMethod: [
    { paymentMethod: 'CASH', recordsCount: 2, revenueCents: 5000 },
    { paymentMethod: 'CARD', recordsCount: 1, revenueCents: 4000 },
  ],
};

describe('fetchBarbershopDailySummary', () => {
  it('calls correct URL with Bearer token', async () => {
    const { fetchBarbershopDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_OWNER_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchBarbershopDailySummary(getToken, 'shop-1', '2026-06-06');
    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/service-records/summary',
      { headers: { Authorization: 'Bearer owner-token' }, params: { date: '2026-06-06' } }
    );
    expect(result.totalRecords).toBe(5);
    expect(result.byEmployee).toHaveLength(2);
  });

  it('returns full OWNER summary data', async () => {
    const { fetchBarbershopDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_OWNER_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    const result = await fetchBarbershopDailySummary(getToken, 'shop-1', '2026-06-06');
    expect(result).toEqual(FAKE_OWNER_SUMMARY);
  });

  it('supports period and employee filters for OWNER summary', async () => {
    const { fetchBarbershopDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_OWNER_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    await fetchBarbershopDailySummary(getToken, 'shop-1', {
      period: 'month',
      employeeId: 'emp-1',
    });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/service-records/summary',
      {
        headers: { Authorization: 'Bearer token' },
        params: { period: 'month', employeeId: 'emp-1' },
      }
    );
  });

  it('throws on API error', async () => {
    const { fetchBarbershopDailySummary } = await importSummary();
    mockApi.get.mockRejectedValueOnce(new Error('Server Error'));
    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      fetchBarbershopDailySummary(getToken, 'shop-1', '2026-06-06')
    ).rejects.toThrow('Server Error');
  });

  it('throws on unsuccessful response', async () => {
    const { fetchBarbershopDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed' } },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      fetchBarbershopDailySummary(getToken, 'shop-1', '2026-06-06')
    ).rejects.toThrow('Not allowed');
  });
});

describe('fetchEmployeeDailySummary', () => {
  it('calls correct URL with Bearer token', async () => {
    const { fetchEmployeeDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_EMPLOYEE_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('barber-token');
    const result = await fetchEmployeeDailySummary(getToken, 'shop-1', 'emp-1', '2026-06-06');
    expect(getToken).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1/service-records/summary',
      { headers: { Authorization: 'Bearer barber-token' }, params: { date: '2026-06-06' } }
    );
    expect(result.totalRecords).toBe(3);
  });

  it('supports period queries for employee summary', async () => {
    const { fetchEmployeeDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_EMPLOYEE_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    await fetchEmployeeDailySummary(getToken, 'shop-1', 'emp-1', { period: 'year' });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1/service-records/summary',
      { headers: { Authorization: 'Bearer token' }, params: { period: 'year' } }
    );
  });

  it('returns full employee summary data', async () => {
    const { fetchEmployeeDailySummary } = await importSummary();
    mockApi.get.mockResolvedValueOnce({
      data: { success: true, data: FAKE_EMPLOYEE_SUMMARY },
    });
    const getToken = vi.fn().mockResolvedValue('token');
    const result = await fetchEmployeeDailySummary(getToken, 'shop-1', 'emp-1', '2026-06-06');
    expect(result).toEqual(FAKE_EMPLOYEE_SUMMARY);
    expect(result.employeeName).toBe('Carlos');
    expect(result.byPaymentMethod).toHaveLength(2);
  });

  it('throws on API error', async () => {
    const { fetchEmployeeDailySummary } = await importSummary();
    mockApi.get.mockRejectedValueOnce(new Error('Network down'));
    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      fetchEmployeeDailySummary(getToken, 'shop-1', 'emp-1', '2026-06-06')
    ).rejects.toThrow('Network down');
  });
});
