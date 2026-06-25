/**
 * Appointments screen — OWNER and BARBER manage appointments.
 *
 * OWNER sees all barbershop appointments with an employee filter.
 * BARBER sees their own appointments.
 * CLIENT is blocked.
 *
 * Date navigation uses client-side filtering: appointments whose
 * startAt starts with the selected date string are shown.
 */
import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AppointmentsScreenView,
  type AppointmentActionViewModel,
  type AppointmentRowViewModel,
  type EmployeeFilterOption,
} from '@/components/AppointmentsScreenView.js';
import { useContextStore } from '@/lib/store.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import {
  getAppointmentClientDisplayName,
  getAppointmentServiceDisplayName,
} from '@/lib/appointmentSelectors.js';
import {
  getTodayDateString,
  addDaysToDateString,
  isTodayDateString,
  formatRecordTime,
} from '@/lib/format.js';
import { getAppointmentTransitionLabel } from '@/i18n/index.js';
import type { AppointmentStatus } from '@/lib/types.js';

/** Allowed status transitions per role. */
const OWNER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const BARBER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [],
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export default function AppointmentsScreen() {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { t } = useTranslation();

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const { context, isLoading: isContextLoading, loadContext } = useContextStore();
  const {
    appointments,
    isAppointmentsLoading,
    appointmentsError,
    loadAppointments,
    transitionStatus,
    cancelAppointment,
  } = useAppointmentsStore();

  const { employees, loadEmployees } = useEmployeesStore();

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const hasFocusedOnceRef = useRef(false);

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current) return;
    loadContext(getTokenRef.current);
  }, [isSignedIn, loadContext]);

  // Load employees for OWNER filter
  useEffect(() => {
    if (!context || context.role !== 'OWNER' || !context.barbershopId || !getTokenRef.current) return;
    loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context, loadEmployees]);

  // Load appointments when context is ready
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    loadAppointments(getTokenRef.current, context);
  }, [context, loadAppointments]);

  // Reload on focus
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return undefined;
      }

      if (!context || !getTokenRef.current) {
        return undefined;
      }

      void loadAppointments(getTokenRef.current, context);
      return undefined;
    // getToken intentionally NOT in deps
    }, [context, loadAppointments])
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) return;
    await loadContext(getTokenRef.current);
    const { context: freshContext } = useContextStore.getState();
    if (freshContext) {
      await loadAppointments(getTokenRef.current, freshContext);
      if (freshContext.role === 'OWNER' && freshContext.barbershopId) {
        await loadEmployees(getTokenRef.current, freshContext.barbershopId);
      }
    }
  }, [loadContext, loadAppointments, loadEmployees]);

  // Handle status transition
  const handleTransition = useCallback(
    async (appointmentId: string, newStatus: AppointmentStatus) => {
      if (!getTokenRef.current) return;
      try {
        await transitionStatus(getTokenRef.current, appointmentId, newStatus);
      } catch {
        // Error is handled by the store
      }
    },
    [transitionStatus],
  );

  // Handle cancel
  const handleCancel = useCallback(
    async (appointmentId: string) => {
      if (!getTokenRef.current) return;
      try {
        await cancelAppointment(getTokenRef.current, appointmentId);
      } catch {
        // Error is handled by the store
      }
    },
    [cancelAppointment],
  );

  // Client-side filtering by date
  const dateFiltered = useMemo(() => {
    return appointments.filter((a) => a.startAt.startsWith(selectedDate));
  }, [appointments, selectedDate]);

  // Employee filter for OWNER
  const filtered = useMemo(() => {
    if (!context || context.role !== 'OWNER' || !selectedEmployeeId) return dateFiltered;
    return dateFiltered.filter((a) => a.employeeId === selectedEmployeeId);
  }, [context, dateFiltered, selectedEmployeeId]);

  // Get available transitions for an appointment based on role
  const getTransitions = useCallback(
    (status: AppointmentStatus): AppointmentStatus[] => {
      if (!context) return [];
      if (context.role === 'OWNER') return OWNER_TRANSITIONS[status] ?? [];
      if (context.role === 'BARBER') return BARBER_TRANSITIONS[status] ?? [];
      return [];
    },
    [context],
  );

  const handlePrevDate = useCallback(() => {
    setSelectedDate((prev) => addDaysToDateString(prev, -1));
  }, []);

  const handleToday = useCallback(() => {
    const today = getTodayDateString();
    if (selectedDate !== today) {
      setSelectedDate(today);
    }
  }, [selectedDate]);

  const handleNextDate = useCallback(() => {
    setSelectedDate((prev) => addDaysToDateString(prev, 1));
  }, []);

  const employeeFilters = useMemo<EmployeeFilterOption[]>(() => {
    if (!context || context.role !== 'OWNER' || employees.length === 0) {
      return [];
    }

    return [
      {
        id: 'all',
        label: t('common.labels.all'),
        selected: selectedEmployeeId === null,
        testID: 'appointments-filter-all',
        onPress: () => setSelectedEmployeeId(null),
      },
      ...employees.map((employee) => ({
        id: employee.id,
        label: employee.user.name ?? employee.user.email,
        selected: selectedEmployeeId === employee.id,
        testID: `appointments-filter-emp-${employee.id}`,
        onPress: () => setSelectedEmployeeId(employee.id),
      })),
    ];
  }, [context, employees, selectedEmployeeId]);

  const appointmentRows = useMemo<AppointmentRowViewModel[]>(() => {
    return filtered.map((appointment) => {
      const actions: AppointmentActionViewModel[] = getTransitions(appointment.status).map((targetStatus) => ({
        status: targetStatus,
        label: getAppointmentTransitionLabel(targetStatus),
        testID: `appointment-action-${appointment.id}-${targetStatus}`,
        onPress: () => {
          if (targetStatus === 'CANCELLED') {
            void handleCancel(appointment.id);
            return;
          }

          void handleTransition(appointment.id, targetStatus);
        },
      }));

      return {
        id: appointment.id,
        timeLabel: formatRecordTime(appointment.startAt) ?? '--:--',
        status: appointment.status,
        clientLabel: getAppointmentClientDisplayName(appointment),
        serviceLabel: getAppointmentServiceDisplayName(appointment),
        employeeLabel: context?.role === 'OWNER' && appointment.employee?.user?.name
          ? t('appointments.employeeLabel', { name: appointment.employee.user.name })
          : null,
        notes: appointment.notes,
        actions,
      };
    });
  }, [context?.role, filtered, getTransitions, handleCancel, handleTransition, t]);

  const isRefreshing = isContextLoading || isAppointmentsLoading;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <AppointmentsScreenView
      context={context}
      isContextLoading={isContextLoading}
      isAppointmentsLoading={isAppointmentsLoading}
      appointmentsError={appointmentsError}
      isRefreshing={isRefreshing}
      selectedDate={selectedDate}
      isTodaySelected={isTodayDateString(selectedDate)}
      employeeFilters={employeeFilters}
      appointmentRows={appointmentRows}
      onRefresh={handleRefresh}
      onPrevDate={handlePrevDate}
      onToday={handleToday}
      onNextDate={handleNextDate}
    />
  );
}
