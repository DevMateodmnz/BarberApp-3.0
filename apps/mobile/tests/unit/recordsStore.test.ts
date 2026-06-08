/**
 * Unit tests for recordsStore — PR-040A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecordsStore } from '../../src/lib/recordsStore.js';
import type { CurrentUserContext, ServiceRecord } from '../../src/lib/types.js';

const mockFetchBarbershopRecords = vi.fn();
const mockFetchEmployeeRecords = vi.fn();

vi.mock('../../src/lib/serviceRecords.js', () => ({
  fetchBarbershopRecords: (...args: unknown[]) => mockFetchBarbershopRecords(...args),
  fetchEmployeeRecords: (...args: unknown[]) => mockFetchEmployeeRecords(...args),
}));

const ownerContext: CurrentUserContext = {
  userId: 'user-1',
  role: 'OWNER',
  barbershopId: 'shop-1',
  barbershopName: 'My Shop',
  employeeId: null,
  employeeName: null,
};

const barberContext: CurrentUserContext = {
  userId: 'user-2',
  role: 'BARBER',
  barbershopId: 'shop-1',
  barbershopName: 'My Shop',
  employeeId: 'emp-1',
  employeeName: 'Barber One',
};

const clientContext: CurrentUserContext = {
  userId: 'user-3',
  role: 'CLIENT',
  barbershopId: null,
  barbershopName: null,
  employeeId: null,
  employeeName: null,
};

describe('useRecordsStore', () => {
  beforeEach(() => {
    useRecordsStore.setState({ records: [], isRecordsLoading: false, recordsError: null });
    vi.clearAllMocks();
  });

  it('initial state is empty', () => {
    const state = useRecordsStore.getState();
    expect(state.records).toEqual([]);
    expect(state.isRecordsLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it('OWNER loads barbershop records', async () => {
    const fakeRecords = [
      { id: 'rec-1', employeeId: 'emp-1', serviceId: 'svc-1', priceCents: 2500 },
    ];
    mockFetchBarbershopRecords.mockResolvedValueOnce(fakeRecords);

    const getToken = vi.fn().mockResolvedValue('token');
    await useRecordsStore.getState().loadRecordsForDate(getToken, ownerContext, '2026-06-08');

    expect(mockFetchBarbershopRecords).toHaveBeenCalledWith(getToken, 'shop-1', '2026-06-08');
    expect(mockFetchEmployeeRecords).not.toHaveBeenCalled();

    const state = useRecordsStore.getState();
    expect(state.records).toEqual(fakeRecords);
    expect(state.isRecordsLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it('BARBER loads employee records', async () => {
    const fakeRecords = [
      { id: 'rec-1', employeeId: 'emp-1', serviceId: 'svc-1', priceCents: 1500 },
    ];
    mockFetchEmployeeRecords.mockResolvedValueOnce(fakeRecords);

    const getToken = vi.fn().mockResolvedValue('token');
    await useRecordsStore.getState().loadRecordsForDate(getToken, barberContext, '2026-06-08');

    expect(mockFetchEmployeeRecords).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1', '2026-06-08');
    expect(mockFetchBarbershopRecords).not.toHaveBeenCalled();

    const state = useRecordsStore.getState();
    expect(state.records).toEqual(fakeRecords);
  });

  it('CLIENT is a no-op', async () => {
    const getToken = vi.fn();
    await useRecordsStore.getState().loadRecordsForDate(getToken, clientContext, '2026-06-08');

    expect(mockFetchBarbershopRecords).not.toHaveBeenCalled();
    expect(mockFetchEmployeeRecords).not.toHaveBeenCalled();
    expect(useRecordsStore.getState().records).toEqual([]);
  });

  it('sets error state on API failure', async () => {
    mockFetchBarbershopRecords.mockRejectedValueOnce(new Error('Network error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useRecordsStore.getState().loadRecordsForDate(getToken, ownerContext, '2026-06-08');

    const state = useRecordsStore.getState();
    expect(state.records).toEqual([]);
    expect(state.isRecordsLoading).toBe(false);
    expect(state.recordsError).toBe('Network error');
  });

  it('clearRecords resets state', () => {
    useRecordsStore.setState({
      records: [{ id: 'rec-1' } as ServiceRecord],
      isRecordsLoading: true,
      recordsError: 'err',
    });

    useRecordsStore.getState().clearRecords();

    const state = useRecordsStore.getState();
    expect(state.records).toEqual([]);
    expect(state.isRecordsLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it('OWNER no-ops when barbershopId is missing', async () => {
    const contextWithoutShop: CurrentUserContext = { ...ownerContext, barbershopId: null };
    const getToken = vi.fn();

    await useRecordsStore.getState().loadRecordsForDate(getToken, contextWithoutShop, '2026-06-08');

    expect(mockFetchBarbershopRecords).not.toHaveBeenCalled();
    expect(useRecordsStore.getState().records).toEqual([]);
  });

  it('BARBER no-ops when employeeId is missing', async () => {
    const contextWithoutEmp: CurrentUserContext = { ...barberContext, employeeId: null };
    const getToken = vi.fn();

    await useRecordsStore.getState().loadRecordsForDate(getToken, contextWithoutEmp, '2026-06-08');

    expect(mockFetchEmployeeRecords).not.toHaveBeenCalled();
    expect(useRecordsStore.getState().records).toEqual([]);
  });
});
