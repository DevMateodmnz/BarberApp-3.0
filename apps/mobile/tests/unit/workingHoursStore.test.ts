/**
 * Unit tests for workingHoursStore
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkingHoursDay } from '../../src/lib/types.js';

const mockFetchWorkingHours = vi.fn();
const mockPutWorkingHours = vi.fn();

vi.mock('../../src/lib/workingHours.js', () => ({
  fetchWorkingHours: (...args: unknown[]) => mockFetchWorkingHours(...args),
  putWorkingHours: (...args: unknown[]) => mockPutWorkingHours(...args),
}));

async function importStore() {
  return import('../../src/lib/workingHoursStore.js');
}

function makeDay(overrides: Partial<WorkingHoursDay> = {}): WorkingHoursDay {
  return {
    id: 'wh-1',
    dayOfWeek: 1,
    openTime: '09:00',
    closeTime: '18:00',
    isActive: true,
    ...overrides,
  };
}

describe('useWorkingHoursStore', () => {
  beforeEach(async () => {
    const { useWorkingHoursStore } = await importStore();
    useWorkingHoursStore.setState({
      workingHours: [],
      isWorkingHoursLoading: false,
      workingHoursError: null,
    });
    vi.clearAllMocks();
  });

  it('initial state is empty', async () => {
    const { useWorkingHoursStore } = await importStore();
    const state = useWorkingHoursStore.getState();
    expect(state.workingHours).toEqual([]);
    expect(state.isWorkingHoursLoading).toBe(false);
    expect(state.workingHoursError).toBeNull();
  });

  it('loads working hours for a barbershop', async () => {
    const { useWorkingHoursStore } = await importStore();
    const fakeDays = [makeDay(), makeDay({ id: 'wh-2', dayOfWeek: 2 })];
    mockFetchWorkingHours.mockResolvedValueOnce(fakeDays);

    const getToken = vi.fn().mockResolvedValue('token');
    await useWorkingHoursStore.getState().loadWorkingHours(getToken, 'shop-1');

    expect(mockFetchWorkingHours).toHaveBeenCalledWith(getToken, 'shop-1');
    expect(useWorkingHoursStore.getState().workingHours).toEqual(fakeDays);
    expect(useWorkingHoursStore.getState().isWorkingHoursLoading).toBe(false);
  });

  it('no-ops when barbershopId is null', async () => {
    const { useWorkingHoursStore } = await importStore();
    const getToken = vi.fn();

    await useWorkingHoursStore.getState().loadWorkingHours(getToken, null);

    expect(mockFetchWorkingHours).not.toHaveBeenCalled();
    expect(useWorkingHoursStore.getState().workingHours).toEqual([]);
  });

  it('sets error state on failure', async () => {
    const { useWorkingHoursStore } = await importStore();
    mockFetchWorkingHours.mockRejectedValueOnce(new Error('Network error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useWorkingHoursStore.getState().loadWorkingHours(getToken, 'shop-1');

    expect(useWorkingHoursStore.getState().workingHoursError).toBe('Network error');
    expect(useWorkingHoursStore.getState().isWorkingHoursLoading).toBe(false);
  });

  it('saveWorkingHours sends days and replaces state with response', async () => {
    const { useWorkingHoursStore } = await importStore();
    const savedDays = [makeDay(), makeDay({ id: 'wh-2', dayOfWeek: 2 })];
    mockPutWorkingHours.mockResolvedValueOnce(savedDays);

    const getToken = vi.fn().mockResolvedValue('token');
    const days = [makeDay()];
    const result = await useWorkingHoursStore.getState().saveWorkingHours(getToken, 'shop-1', days);

    expect(mockPutWorkingHours).toHaveBeenCalledWith(getToken, 'shop-1', days);
    expect(result).toEqual(savedDays);
    expect(useWorkingHoursStore.getState().workingHours).toEqual(savedDays);
    expect(useWorkingHoursStore.getState().workingHoursError).toBeNull();
  });

  it('saveWorkingHours throws on API error', async () => {
    const { useWorkingHoursStore } = await importStore();
    mockPutWorkingHours.mockRejectedValueOnce(new Error('Validation failed'));

    const getToken = vi.fn().mockResolvedValue('token');
    await expect(
      useWorkingHoursStore.getState().saveWorkingHours(getToken, 'shop-1', []),
    ).rejects.toThrow('Validation failed');
  });

  it('clearWorkingHours resets state', async () => {
    const { useWorkingHoursStore } = await importStore();
    useWorkingHoursStore.setState({
      workingHours: [makeDay()],
      isWorkingHoursLoading: true,
      workingHoursError: 'err',
    });

    useWorkingHoursStore.getState().clearWorkingHours();

    const state = useWorkingHoursStore.getState();
    expect(state.workingHours).toEqual([]);
    expect(state.isWorkingHoursLoading).toBe(false);
    expect(state.workingHoursError).toBeNull();
  });
});
