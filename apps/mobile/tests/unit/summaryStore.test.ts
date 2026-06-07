/**
 * Unit tests for summary store — PR-028D
 *
 * Tests loadTodaySummary behavior for OWNER, BARBER, and CLIENT roles,
 * plus error handling and clearSummary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level mock functions — persist across resetModules, cleared in beforeEach
const mockFetchBarbershopDailySummary = vi.fn();
const mockFetchEmployeeDailySummary = vi.fn();

vi.mock('../../src/lib/summary.js', () => ({
  fetchBarbershopDailySummary: (...args: unknown[]) => mockFetchBarbershopDailySummary(...args),
  fetchEmployeeDailySummary: (...args: unknown[]) => mockFetchEmployeeDailySummary(...args),
}));

// Mock axios so api.ts doesn't fail
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      defaults: {},
    })),
  },
}));

describe('useSummaryStore', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchBarbershopDailySummary.mockReset();
    mockFetchEmployeeDailySummary.mockReset();
  });

  it('has correct initial state', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');
    const state = useSummaryStore.getState();
    expect(state.summary).toBeNull();
    expect(state.isSummaryLoading).toBe(false);
    expect(state.summaryError).toBeNull();
  });

  it('OWNER with barbershopId loads barbershop summary', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const mockSummary = {
      date: '2026-06-06',
      totalRecords: 10,
      totalRevenueCents: 25000,
      byEmployee: [
        { employeeId: 'emp-1', employeeName: 'Carlos', recordsCount: 6, revenueCents: 15000 },
      ],
      byPaymentMethod: [
        { paymentMethod: 'CASH', recordsCount: 5, revenueCents: 12000 },
      ],
    };
    mockFetchBarbershopDailySummary.mockResolvedValueOnce(mockSummary);

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerContext = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, ownerContext);

    const state = useSummaryStore.getState();
    expect(state.summary).toEqual(mockSummary);
    expect(state.isSummaryLoading).toBe(false);
    expect(state.summaryError).toBeNull();
    expect(mockFetchBarbershopDailySummary).toHaveBeenCalledWith(getToken, 'shop-1', expect.any(String));
  });

  it('BARBER with employeeId loads employee summary', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const mockSummary = {
      date: '2026-06-06',
      employeeId: 'emp-1',
      employeeName: 'Carlos',
      totalRecords: 6,
      totalRevenueCents: 15000,
      byPaymentMethod: [
        { paymentMethod: 'CASH', recordsCount: 4, revenueCents: 10000 },
      ],
    };
    mockFetchEmployeeDailySummary.mockResolvedValueOnce(mockSummary);

    const getToken = vi.fn().mockResolvedValue('token');
    const barberContext = {
      userId: 'u2',
      role: 'BARBER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: 'emp-1',
      employeeName: 'Carlos',
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, barberContext);

    const state = useSummaryStore.getState();
    expect(state.summary).toEqual(mockSummary);
    expect(mockFetchEmployeeDailySummary).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1', expect.any(String));
  });

  it('CLIENT does not call any summary endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const clientContext = {
      userId: 'u3',
      role: 'CLIENT' as const,
      barbershopId: null,
      barbershopName: null,
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, clientContext);

    expect(mockFetchBarbershopDailySummary).not.toHaveBeenCalled();
    expect(mockFetchEmployeeDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('OWNER without barbershopId does not call endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerNoShop = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: null,
      barbershopName: null,
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, ownerNoShop);

    expect(mockFetchBarbershopDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('BARBER without employeeId does not call endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const barberNoEmployee = {
      userId: 'u2',
      role: 'BARBER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, barberNoEmployee);

    expect(mockFetchEmployeeDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    mockFetchBarbershopDailySummary.mockRejectedValueOnce(new Error('Server Error'));

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerContext = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, ownerContext);

    expect(useSummaryStore.getState().summaryError).toBe('Server Error');
    expect(useSummaryStore.getState().summary).toBeNull();
    expect(useSummaryStore.getState().isSummaryLoading).toBe(false);
  });

  it('clearSummary resets state', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    mockFetchBarbershopDailySummary.mockResolvedValueOnce({
      date: '2026-06-06', totalRecords: 1, totalRevenueCents: 100,
      byEmployee: [], byPaymentMethod: [],
    });

    const getToken = vi.fn().mockResolvedValue('token');
    await useSummaryStore.getState().loadTodaySummary(getToken, {
      userId: 'u1', role: 'OWNER' as const, barbershopId: 's1',
      barbershopName: 'Shop', employeeId: null, employeeName: null,
    });
    expect(useSummaryStore.getState().summary).not.toBeNull();

    useSummaryStore.getState().clearSummary();
    expect(useSummaryStore.getState().summary).toBeNull();
    expect(useSummaryStore.getState().summaryError).toBeNull();
  });
});

// ============================================================================
// loadSummaryForDate — MS-003
// Tests for the new date-aware summary loader.
// The function does NOT exist yet — RED phase.
// ============================================================================

describe('loadSummaryForDate', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchBarbershopDailySummary.mockReset();
    mockFetchEmployeeDailySummary.mockReset();
  });

  it('OWNER with barbershopId loads barbershop summary for a specific date', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const mockSummary = {
      date: '2026-06-05',
      totalRecords: 8,
      totalRevenueCents: 20000,
      byEmployee: [],
      byPaymentMethod: [],
    };
    mockFetchBarbershopDailySummary.mockResolvedValueOnce(mockSummary);

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerContext = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, ownerContext, '2026-06-05');

    const state = useSummaryStore.getState();
    expect(state.summary).toEqual(mockSummary);
    expect(state.isSummaryLoading).toBe(false);
    expect(state.summaryError).toBeNull();
    expect(mockFetchBarbershopDailySummary).toHaveBeenCalledWith(getToken, 'shop-1', '2026-06-05');
  });

  it('BARBER with employeeId loads employee summary for a specific date', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const mockSummary = {
      date: '2026-06-07',
      employeeId: 'emp-1',
      employeeName: 'Carlos',
      totalRecords: 4,
      totalRevenueCents: 12000,
      byPaymentMethod: [],
    };
    mockFetchEmployeeDailySummary.mockResolvedValueOnce(mockSummary);

    const getToken = vi.fn().mockResolvedValue('token');
    const barberContext = {
      userId: 'u2',
      role: 'BARBER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: 'emp-1',
      employeeName: 'Carlos',
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, barberContext, '2026-06-07');

    const state = useSummaryStore.getState();
    expect(state.summary).toEqual(mockSummary);
    expect(mockFetchEmployeeDailySummary).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1', '2026-06-07');
  });

  it('CLIENT does not call any summary endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const clientContext = {
      userId: 'u3',
      role: 'CLIENT' as const,
      barbershopId: null,
      barbershopName: null,
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, clientContext, '2026-06-06');

    expect(mockFetchBarbershopDailySummary).not.toHaveBeenCalled();
    expect(mockFetchEmployeeDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('OWNER without barbershopId does not call endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerNoShop = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: null,
      barbershopName: null,
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, ownerNoShop, '2026-06-06');

    expect(mockFetchBarbershopDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('BARBER without employeeId does not call endpoint', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const getToken = vi.fn().mockResolvedValue('token');
    const barberNoEmployee = {
      userId: 'u2',
      role: 'BARBER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, barberNoEmployee, '2026-06-06');

    expect(mockFetchEmployeeDailySummary).not.toHaveBeenCalled();
    expect(useSummaryStore.getState().summary).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    mockFetchBarbershopDailySummary.mockRejectedValueOnce(new Error('Server Error'));

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerContext = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadSummaryForDate(getToken, ownerContext, '2026-06-06');

    expect(useSummaryStore.getState().summaryError).toBe('Server Error');
    expect(useSummaryStore.getState().summary).toBeNull();
    expect(useSummaryStore.getState().isSummaryLoading).toBe(false);
  });

  it('loadTodaySummary delegates to loadSummaryForDate with today\'s date', async () => {
    const { useSummaryStore } = await import('../../src/lib/summaryStore.js');

    const mockSummary = {
      date: '2026-06-07', // This will be today's date from getTodayDateString
      totalRecords: 5,
      totalRevenueCents: 15000,
      byEmployee: [],
      byPaymentMethod: [],
    };
    // loadTodaySummary should pass getTodayDateString() as the date
    mockFetchBarbershopDailySummary.mockResolvedValueOnce(mockSummary);

    const getToken = vi.fn().mockResolvedValue('token');
    const ownerContext = {
      userId: 'u1',
      role: 'OWNER' as const,
      barbershopId: 'shop-1',
      barbershopName: 'Test Shop',
      employeeId: null,
      employeeName: null,
    };
    await useSummaryStore.getState().loadTodaySummary(getToken, ownerContext);

    const state = useSummaryStore.getState();
    expect(state.summary).toEqual(mockSummary);
    // Should pass today's date string, whatever it is
    expect(mockFetchBarbershopDailySummary).toHaveBeenCalledWith(getToken, 'shop-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});