/**
 * Unit tests for appointmentsStore
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Appointment, CurrentUserContext } from '../../src/lib/types.js';

const mockFetchAppointments = vi.fn();
const mockFetchEmployeeAppointments = vi.fn();
const mockTransitionStatus = vi.fn();
const mockCancelAppointment = vi.fn();

vi.mock('../../src/lib/appointments.js', () => ({
  fetchAppointments: (...args: unknown[]) => mockFetchAppointments(...args),
  fetchEmployeeAppointments: (...args: unknown[]) => mockFetchEmployeeAppointments(...args),
  transitionAppointmentStatus: (...args: unknown[]) => mockTransitionStatus(...args),
  cancelAppointment: (...args: unknown[]) => mockCancelAppointment(...args),
}));

async function importStore() {
  return import('../../src/lib/appointmentsStore.js');
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    barbershopId: 'shop-1',
    employeeId: 'emp-1',
    clientId: 'client-1',
    serviceId: 'svc-1',
    startAt: '2026-06-15T10:00:00.000Z',
    endAt: '2026-06-15T10:30:00.000Z',
    status: 'PENDING',
    notes: null,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
    deletedAt: null,
    barbershop: { id: 'shop-1', name: 'My Shop' },
    employee: { id: 'emp-1', user: { id: 'user-2', name: 'Barber One' } },
    client: { id: 'client-1', name: 'John Doe', email: 'john@example.com' },
    service: { id: 'svc-1', name: 'Haircut', durationMinutes: 30, priceCents: 2500 },
    ...overrides,
  };
}

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

describe('useAppointmentsStore', () => {
  beforeEach(async () => {
    const { useAppointmentsStore } = await importStore();
    useAppointmentsStore.setState({
      appointments: [],
      isAppointmentsLoading: false,
      appointmentsError: null,
    });
    vi.clearAllMocks();
  });

  it('initial state is empty', async () => {
    const { useAppointmentsStore } = await importStore();
    const state = useAppointmentsStore.getState();
    expect(state.appointments).toEqual([]);
    expect(state.isAppointmentsLoading).toBe(false);
    expect(state.appointmentsError).toBeNull();
  });

  it('OWNER loads appointments via fetchAppointments', async () => {
    const { useAppointmentsStore } = await importStore();
    const fakeAppointments = [makeAppointment(), makeAppointment({ id: 'appt-2' })];
    mockFetchAppointments.mockResolvedValueOnce(fakeAppointments);

    const getToken = vi.fn().mockResolvedValue('token');
    await useAppointmentsStore.getState().loadAppointments(getToken, ownerContext);

    expect(mockFetchAppointments).toHaveBeenCalledWith(getToken);
    expect(mockFetchEmployeeAppointments).not.toHaveBeenCalled();

    const state = useAppointmentsStore.getState();
    expect(state.appointments).toEqual(fakeAppointments);
    expect(state.isAppointmentsLoading).toBe(false);
    expect(state.appointmentsError).toBeNull();
  });

  it('BARBER loads appointments via fetchEmployeeAppointments', async () => {
    const { useAppointmentsStore } = await importStore();
    const fakeAppointments = [makeAppointment()];
    mockFetchEmployeeAppointments.mockResolvedValueOnce(fakeAppointments);

    const getToken = vi.fn().mockResolvedValue('token');
    await useAppointmentsStore.getState().loadAppointments(getToken, barberContext);

    expect(mockFetchEmployeeAppointments).toHaveBeenCalledWith(getToken, 'shop-1', 'emp-1');
    expect(mockFetchAppointments).not.toHaveBeenCalled();

    const state = useAppointmentsStore.getState();
    expect(state.appointments).toEqual(fakeAppointments);
  });

  it('CLIENT is a no-op', async () => {
    const { useAppointmentsStore } = await importStore();
    const getToken = vi.fn();

    await useAppointmentsStore.getState().loadAppointments(getToken, clientContext);

    expect(mockFetchAppointments).not.toHaveBeenCalled();
    expect(mockFetchEmployeeAppointments).not.toHaveBeenCalled();
    expect(useAppointmentsStore.getState().appointments).toEqual([]);
  });

  it('sets error state on API failure', async () => {
    const { useAppointmentsStore } = await importStore();
    mockFetchAppointments.mockRejectedValueOnce(new Error('Network error'));

    const getToken = vi.fn().mockResolvedValue('token');
    await useAppointmentsStore.getState().loadAppointments(getToken, ownerContext);

    const state = useAppointmentsStore.getState();
    expect(state.appointments).toEqual([]);
    expect(state.isAppointmentsLoading).toBe(false);
    expect(state.appointmentsError).toBe('Network error');
  });

  it('OWNER no-ops when barbershopId is missing', async () => {
    const { useAppointmentsStore } = await importStore();
    const contextWithoutShop: CurrentUserContext = { ...ownerContext, barbershopId: null };
    const getToken = vi.fn();

    await useAppointmentsStore.getState().loadAppointments(getToken, contextWithoutShop);

    expect(mockFetchAppointments).not.toHaveBeenCalled();
    expect(useAppointmentsStore.getState().appointments).toEqual([]);
  });

  it('BARBER no-ops when employeeId is missing', async () => {
    const { useAppointmentsStore } = await importStore();
    const contextWithoutEmp: CurrentUserContext = { ...barberContext, employeeId: null };
    const getToken = vi.fn();

    await useAppointmentsStore.getState().loadAppointments(getToken, contextWithoutEmp);

    expect(mockFetchEmployeeAppointments).not.toHaveBeenCalled();
    expect(useAppointmentsStore.getState().appointments).toEqual([]);
  });

  it('transitionStatus calls API and refetches list', async () => {
    const { useAppointmentsStore } = await importStore();

    // First load appointments to set _lastContext
    const initialAppts = [makeAppointment({ id: 'appt-1', status: 'PENDING' })];
    mockFetchAppointments.mockResolvedValueOnce(initialAppts);
    const getToken = vi.fn().mockResolvedValue('token');
    await useAppointmentsStore.getState().loadAppointments(getToken, ownerContext);

    // Now transition
    mockTransitionStatus.mockResolvedValueOnce({});
    const updatedAppts = [makeAppointment({ id: 'appt-1', status: 'CONFIRMED' })];
    mockFetchAppointments.mockResolvedValueOnce(updatedAppts);

    await useAppointmentsStore.getState().transitionStatus(getToken, 'appt-1', 'CONFIRMED');

    expect(mockTransitionStatus).toHaveBeenCalledWith(getToken, 'appt-1', 'CONFIRMED');
    // Should refetch after transition
    expect(mockFetchAppointments).toHaveBeenCalledTimes(2);
    expect(useAppointmentsStore.getState().appointments).toEqual(updatedAppts);
  });

  it('cancelAppointment calls API and refetches list', async () => {
    const { useAppointmentsStore } = await importStore();

    // First load appointments to set _lastContext
    const initialAppts = [makeAppointment({ id: 'appt-1', status: 'PENDING' })];
    mockFetchAppointments.mockResolvedValueOnce(initialAppts);
    const getToken = vi.fn().mockResolvedValue('token');
    await useAppointmentsStore.getState().loadAppointments(getToken, ownerContext);

    // Now cancel
    mockCancelAppointment.mockResolvedValueOnce({});
    const updatedAppts: Appointment[] = [];
    mockFetchAppointments.mockResolvedValueOnce(updatedAppts);

    await useAppointmentsStore.getState().cancelAppointment(getToken, 'appt-1');

    expect(mockCancelAppointment).toHaveBeenCalledWith(getToken, 'appt-1');
    // Should refetch after cancel
    expect(mockFetchAppointments).toHaveBeenCalledTimes(2);
    expect(useAppointmentsStore.getState().appointments).toEqual(updatedAppts);
  });

  it('clearAppointments resets state', async () => {
    const { useAppointmentsStore } = await importStore();
    useAppointmentsStore.setState({
      appointments: [makeAppointment()],
      isAppointmentsLoading: true,
      appointmentsError: 'err',
    });

    useAppointmentsStore.getState().clearAppointments();

    const state = useAppointmentsStore.getState();
    expect(state.appointments).toEqual([]);
    expect(state.isAppointmentsLoading).toBe(false);
    expect(state.appointmentsError).toBeNull();
  });
});
