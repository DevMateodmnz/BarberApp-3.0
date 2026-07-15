/**
 * Appointments screen — OWNER and BARBER manage appointments.
 *
 * OWNER sees all barbershop appointments with an employee filter.
 * BARBER sees their own appointments.
 * CLIENT is blocked.
 *
 * Date navigation keeps the UI stable while fetching date-scoped
 * appointments from the API.
 */
import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { useFlashStore } from '@/lib/flashStore.js';
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
import type { AppointmentNotificationSummary } from '@/lib/types.js';

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

function buildNotificationLabels(
  notifications: AppointmentNotificationSummary[] | undefined,
  t: (key: string) => string,
): string[] {
  if (!notifications || notifications.length === 0) {
    return [];
  }

  const labels = notifications
    .map((notification) => {
      if (notification.type === 'BOOKING_CONFIRMATION') {
        if (notification.status === 'SENT') {
          return t('appointments.notification.confirmationSent');
        }
        if (notification.status === 'FAILED') {
          return t('appointments.notification.deliveryError');
        }
        if (notification.status === 'CANCELLED') {
          return t('appointments.notification.confirmationCancelled');
        }
        return t('appointments.notification.confirmationScheduled');
      }

      if (notification.type === 'APPOINTMENT_RESCHEDULED') {
        if (notification.status === 'SENT') {
          return t('appointments.notification.rescheduleSent');
        }
        if (notification.status === 'FAILED') {
          return t('appointments.notification.deliveryError');
        }
        return t('appointments.notification.rescheduleScheduled');
      }

      if (notification.status === 'SENT') {
        return t('appointments.notification.reminderSent');
      }
      if (notification.status === 'FAILED') {
        return t('appointments.notification.deliveryError');
      }
      if (notification.status === 'CANCELLED') {
        return t('appointments.notification.reminderCancelled');
      }
      return t('appointments.notification.reminderScheduled');
    })
    .filter((value, index, array) => array.indexOf(value) === index);

  return labels;
}

function canRescheduleAppointment(input: {
  status: AppointmentStatus;
  startAt: string;
  deletedAt: string | null;
}): boolean {
  return (
    input.status === 'CONFIRMED' &&
    input.deletedAt === null &&
    new Date(input.startAt).getTime() > Date.now()
  );
}

export default function AppointmentsScreen() {
  const router = useRouter();
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
  const flashMessage = useFlashStore((state) => state.message);
  const clearFlashMessage = useFlashStore((state) => state.clearMessage);

  // Load context when signed in
  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current) return;
    loadContext(getTokenRef.current);
  }, [isSignedIn, loadContext]);

  useEffect(() => {
    if (!flashMessage) {
      return;
    }

    const timer = setTimeout(() => {
      clearFlashMessage();
    }, 4000);

    return () => clearTimeout(timer);
  }, [clearFlashMessage, flashMessage]);

  // Load employees for OWNER filter
  useEffect(() => {
    if (!context || context.role !== 'OWNER' || !context.barbershopId || !getTokenRef.current) return;
    loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context, loadEmployees]);

  // Load appointments when context is ready
  useEffect(() => {
    if (!context || !getTokenRef.current) return;
    void loadAppointments(getTokenRef.current, context, selectedDate);
  }, [context, loadAppointments, selectedDate]);

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

      void loadAppointments(getTokenRef.current, context, selectedDate);
      return undefined;
    // getToken intentionally NOT in deps
    }, [context, loadAppointments, selectedDate])
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) return;
    await loadContext(getTokenRef.current);
    const { context: freshContext } = useContextStore.getState();
    if (freshContext) {
      await loadAppointments(getTokenRef.current, freshContext, selectedDate);
      if (freshContext.role === 'OWNER' && freshContext.barbershopId) {
        await loadEmployees(getTokenRef.current, freshContext.barbershopId);
      }
    }
  }, [loadContext, loadAppointments, loadEmployees, selectedDate]);

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

  // Employee filter for OWNER
  const filtered = useMemo(() => {
    if (!context || context.role !== 'OWNER' || !selectedEmployeeId) return appointments;
    return appointments.filter((a) => a.employeeId === selectedEmployeeId);
  }, [appointments, context, selectedEmployeeId]);

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
        id: targetStatus,
        variant: targetStatus === 'CANCELLED' ? 'danger' : 'secondary',
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

      if (canRescheduleAppointment(appointment)) {
        actions.unshift({
          id: 'reschedule',
          variant: 'secondary',
          label: t('appointments.rescheduleAction'),
          testID: `appointment-action-${appointment.id}-reschedule`,
          onPress: () => {
            router.push({
              pathname: '/(tabs)/appointments-reschedule',
              params: { appointmentId: appointment.id },
            });
          },
        });
      }

      return {
        id: appointment.id,
        timeLabel: formatRecordTime(appointment.startAt) ?? '--:--',
        status: appointment.status,
        clientLabel: getAppointmentClientDisplayName(appointment),
        serviceLabel: getAppointmentServiceDisplayName(appointment),
        employeeLabel: context?.role === 'OWNER' && appointment.employee?.user?.name
          ? t('appointments.employeeLabel', { name: appointment.employee.user.name })
          : null,
        notificationLabels: buildNotificationLabels(appointment.notifications, t),
        notes: appointment.notes,
        actions,
      };
    });
  }, [context?.role, filtered, getTransitions, handleCancel, handleTransition, router, t]);

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
      flashMessage={flashMessage}
      showCreateAction={context?.role === 'OWNER' || context?.role === 'BARBER'}
      selectedDate={selectedDate}
      isTodaySelected={isTodayDateString(selectedDate)}
      employeeFilters={employeeFilters}
      appointmentRows={appointmentRows}
      onCreateAppointment={() => router.push('/(tabs)/appointments-create')}
      onRefresh={handleRefresh}
      onPrevDate={handlePrevDate}
      onToday={handleToday}
      onNextDate={handleNextDate}
    />
  );
}
