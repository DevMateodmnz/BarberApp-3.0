/**
 * Appointments store — Zustand store for appointment listing.
 *
 * Loads appointments based on user role:
 * - OWNER: fetches all barbershop appointments via /appointments.
 * - BARBER: fetches own appointments via employee endpoint.
 * - CLIENT: no-op.
 */
import { create } from 'zustand';
import { localizeUnknownError } from '@/i18n/errors.js';
import {
  appointmentMatchesContext,
  upsertAppointmentById,
} from './appointmentCreationDomain.js';
import {
  fetchAppointments,
  fetchEmployeeAppointments,
  transitionAppointmentStatus,
  cancelAppointment as cancelAppointmentApi,
} from './appointments.js';
import type { Appointment, AppointmentStatus, CurrentUserContext } from './types.js';

interface AppointmentsState {
  appointments: Appointment[];
  isAppointmentsLoading: boolean;
  appointmentsError: string | null;

  /**
   * Loads appointments based on user role.
   * - OWNER: calls fetchAppointments.
   * - BARBER: calls fetchEmployeeAppointments with barbershopId and employeeId.
   * - CLIENT: no-op.
   */
  loadAppointments: (
    getToken: () => Promise<string | null>,
    context: CurrentUserContext,
    selectedDate: string,
  ) => Promise<void>;

  /**
   * Transitions an appointment status and refetches the full list.
   */
  transitionStatus: (
    getToken: () => Promise<string | null>,
    appointmentId: string,
    newStatus: AppointmentStatus,
  ) => Promise<void>;

  /**
   * Cancels an appointment and refetches the full list.
   *
   * Note: The cancel endpoint returns an Appointment WITHOUT nested includes,
   * so we refetch the list instead of relying on the response.
   */
  cancelAppointment: (
    getToken: () => Promise<string | null>,
    appointmentId: string,
  ) => Promise<void>;

  /**
   * Upserts a newly created appointment into the current cached list when it
   * belongs to the loaded context. Used by the future create flow to avoid a
   * stale list after navigating back.
   */
  recordCreatedAppointment: (appointment: Appointment) => void;

  /** Resets appointments state to initial values. */
  clearAppointments: () => void;
}

/** Module-level cache of last load context so mutation methods can refetch. */
let _lastContext: CurrentUserContext | null = null;
let _lastSelectedDate: string | null = null;

async function doLoadAppointments(
  getToken: () => Promise<string | null>,
  context: CurrentUserContext,
  selectedDate: string,
): Promise<Appointment[]> {
  if (context.role === 'OWNER') {
    return fetchAppointments(getToken, { date: selectedDate });
  }

  // BARBER
  return fetchEmployeeAppointments(getToken, context.barbershopId!, context.employeeId!, {
    date: selectedDate,
  });
}

export const useAppointmentsStore = create<AppointmentsState>((set, get) => ({
  appointments: [],
  isAppointmentsLoading: false,
  appointmentsError: null,

  loadAppointments: async (getToken, context, selectedDate) => {
    if (context.role === 'CLIENT') {
      return;
    }

    if (!context.barbershopId) {
      return;
    }

    if (context.role === 'BARBER' && !context.employeeId) {
      return;
    }

    _lastContext = context;
    _lastSelectedDate = selectedDate;
    set({ isAppointmentsLoading: true, appointmentsError: null });

    try {
      const appointments = await doLoadAppointments(getToken, context, selectedDate);
      set({ appointments, isAppointmentsLoading: false, appointmentsError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : localizeUnknownError('Unknown error');
      set({ appointments: [], isAppointmentsLoading: false, appointmentsError: message });
    }
  },

  transitionStatus: async (getToken, appointmentId, newStatus) => {
    await transitionAppointmentStatus(getToken, appointmentId, newStatus);
    // Refetch the full list after status change
    if (_lastContext && _lastSelectedDate) {
      const { loadAppointments } = get();
      await loadAppointments(getToken, _lastContext, _lastSelectedDate);
    }
  },

  cancelAppointment: async (getToken, appointmentId) => {
    await cancelAppointmentApi(getToken, appointmentId);
    // Refetch the full list — cancel endpoint doesn't return nested includes
    if (_lastContext && _lastSelectedDate) {
      const { loadAppointments } = get();
      await loadAppointments(getToken, _lastContext, _lastSelectedDate);
    }
  },

  recordCreatedAppointment: (appointment) => {
    if (
      _lastContext &&
      !appointmentMatchesContext(appointment, _lastContext)
    ) {
      return;
    }

    set((state) => ({
      appointments: upsertAppointmentById(state.appointments, appointment),
      appointmentsError: null,
    }));
  },

  clearAppointments: () => {
    _lastContext = null;
    _lastSelectedDate = null;
    set({ appointments: [], isAppointmentsLoading: false, appointmentsError: null });
  },
}));
