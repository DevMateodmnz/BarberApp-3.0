import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api.js')>();
  return { ...actual, api: { get: apiGet, post: apiPost, put: apiPut } };
});

import {
  createCommissionLiquidation,
  fetchCommissionLiquidation,
  fetchCommissionOverview,
  markCommissionLiquidationPaid,
  saveCommissionSettings,
} from '../../src/lib/commissions.js';
import { ApiError } from '../../src/lib/api.js';

const token = async () => 'secret-token';
const success = <T>(data: T, status = 200) => ({ status, data: { success: true, data } });

describe('commission mobile API contracts', () => {
  beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); apiPut.mockReset(); });

  it('uses the owner overview endpoint with bounded range and employee params', async () => {
    apiGet.mockResolvedValueOnce(success({ employeeId: 'employee-1' }));
    await fetchCommissionOverview(token, 'shop-1', { role: 'OWNER', employeeId: 'employee-1', dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    expect(apiGet).toHaveBeenCalledWith('/barbershops/shop-1/commissions/overview', {
      headers: { Authorization: 'Bearer secret-token' },
      params: { employeeId: 'employee-1', dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    });
  });

  it('uses the barber self endpoint without accepting an employee selector', async () => {
    apiGet.mockResolvedValueOnce(success({ employeeId: 'own-employee' }));
    await fetchCommissionOverview(token, 'shop-1', { role: 'BARBER', employeeId: 'foreign', dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    expect(apiGet.mock.calls[0]?.[0]).toBe('/barbershops/shop-1/commissions/me');
    expect(apiGet.mock.calls[0]?.[1].params).not.toHaveProperty('employeeId');
  });

  it('loads liquidation detail from the tenant-scoped detail endpoint', async () => {
    apiGet.mockResolvedValueOnce(success({ id: 'liquidation-1', entries: [] }));
    await fetchCommissionLiquidation(token, 'shop-1', 'liquidation-1');
    expect(apiGet).toHaveBeenCalledWith('/barbershops/shop-1/commissions/liquidations/liquidation-1', {
      headers: { Authorization: 'Bearer secret-token' },
    });
  });

  it('sends basis points and never UI-calculated totals when saving or creating', async () => {
    apiPut.mockResolvedValueOnce(success({ defaultPercentageBasisPoints: 2500, employees: [] }));
    await saveCommissionSettings(token, 'shop-1', { defaultPercentageBasisPoints: 2500, employeeOverrides: [{ employeeId: 'employee-1', percentageBasisPoints: 3000 }] });
    expect(apiPut.mock.calls[0]?.[1]).toEqual({ defaultPercentageBasisPoints: 2500, employeeOverrides: [{ employeeId: 'employee-1', percentageBasisPoints: 3000 }] });

    apiPost.mockResolvedValueOnce(success({ id: 'liquidation-1' }, 201));
    const input = { employeeId: 'employee-1', dateFrom: '2026-08-01', dateTo: '2026-08-31', idempotencyKey: 'stable-attempt-key' };
    await createCommissionLiquidation(token, 'shop-1', input);
    expect(apiPost.mock.calls[0]?.[1]).toEqual(input);
    expect(apiPost.mock.calls[0]?.[1]).not.toHaveProperty('commissionAmountCents');
  });

  it('propagates persistence failure and does not report false success', async () => {
    apiPost.mockRejectedValueOnce(new ApiError('Database unavailable', 'INTERNAL_SERVER_ERROR', 500));
    await expect(markCommissionLiquidationPaid(token, 'shop-1', 'liquidation-1')).rejects.toMatchObject({ message: 'Database unavailable', status: 500 });
  });
});
