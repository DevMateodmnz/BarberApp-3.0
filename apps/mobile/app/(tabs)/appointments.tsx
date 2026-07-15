import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AppointmentsScreenView,
  type AppointmentActionViewModel,
  type AppointmentModeOption,
  type AppointmentRowViewModel,
  type EmployeeFilterOption,
} from '@/components/AppointmentsScreenView.js';
import {
  AppointmentsAgendaScreenView,
  type AgendaAppointmentActionViewModel,
  type AgendaEmployeeSummaryCard,
  type AgendaTimelineItem,
} from '@/components/AppointmentsAgendaScreenView.js';
import { getAppointmentTransitionLabel } from '@/i18n/index.js';
import {
  buildAppointmentNotificationLabels,
  getAvailableAppointmentTransitions,
} from '@/lib/appointmentActions.js';
import {
  getAppointmentClientDisplayName,
  getAppointmentServiceDisplayName,
} from '@/lib/appointmentSelectors.js';
import { useAppointmentsStore } from '@/lib/appointmentsStore.js';
import {
  addDaysToDateString,
  DEFAULT_BARBERSHOP_TIMEZONE,
  formatRecordTime,
  getTodayDateStringInTimeZone,
  isTodayDateStringInTimeZone,
} from '@/lib/format.js';
import { useFlashStore } from '@/lib/flashStore.js';
import { useScheduleBoardStore } from '@/lib/scheduleBoardStore.js';
import { useEmployeesStore } from '@/lib/employeesStore.js';
import { useContextStore } from '@/lib/store.js';
import type {
  AppointmentStatus,
  DailyScheduleBoardAppointment,
  DailyScheduleBoardEmployee,
} from '@/lib/types.js';

type AppointmentMode = 'list' | 'agenda';

let lastAppointmentsMode: AppointmentMode = 'agenda';

interface TimelineSortableItem {
  id: string;
  startAt: string;
  endAt: string;
  item: AgendaTimelineItem;
}

function buildAgendaAttentionLabels(
  appointment: DailyScheduleBoardAppointment,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const labels: string[] = [];

  if (appointment.isReturningCustomer) {
    labels.push(t('appointments.agenda.returningCustomer'));
  }

  if (appointment.noShowCount > 0) {
    labels.push(
      t('appointments.agenda.previousNoShows', {
        count: appointment.noShowCount,
      }),
    );
  }

  if (appointment.notificationSummary?.hasFailures) {
    labels.push(t('appointments.notification.deliveryError'));
  }

  if (appointment.isOutsideWorkingHours) {
    labels.push(t('appointments.agenda.outsideWorkingHours'));
  }

  return labels;
}

function insertCurrentTimeMarker(
  items: TimelineSortableItem[],
  label: string,
  nowIso: string,
): AgendaTimelineItem[] {
  const nowMs = new Date(nowIso).getTime();
  const nextItems = [...items];

  const markerIndex = nextItems.findIndex((entry) => {
    const startMs = new Date(entry.startAt).getTime();
    const endMs = new Date(entry.endAt).getTime();
    return nowMs <= startMs || (nowMs >= startMs && nowMs <= endMs);
  });

  const marker: TimelineSortableItem = {
    id: 'current-time',
    startAt: nowIso,
    endAt: nowIso,
    item: {
      id: 'current-time',
      kind: 'currentTime',
      label,
    },
  };

  if (markerIndex === -1) {
    nextItems.push(marker);
  } else {
    nextItems.splice(markerIndex, 0, marker);
  }

  nextItems.sort((left, right) => left.startAt.localeCompare(right.startAt));
  return nextItems.map((entry) => entry.item);
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const { t } = useTranslation();
  const getTokenRef = useRef(getToken);
  const hasFocusedOnceRef = useRef(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const {
    context,
    isLoading: isContextLoading,
    loadContext,
  } = useContextStore();
  const {
    appointments,
    isAppointmentsLoading,
    appointmentsError,
    loadAppointments,
    transitionStatus,
    cancelAppointment,
  } = useAppointmentsStore();
  const {
    board,
    isScheduleBoardLoading,
    isScheduleBoardRefreshing,
    scheduleBoardError,
    loadScheduleBoard,
  } = useScheduleBoardStore();
  const {
    employees,
    loadEmployees,
  } = useEmployeesStore();

  const flashMessage = useFlashStore((state) => state.message);
  const clearFlashMessage = useFlashStore((state) => state.clearMessage);

  const fallbackToday = getTodayDateStringInTimeZone(DEFAULT_BARBERSHOP_TIMEZONE);
  const [selectedDate, setSelectedDate] = useState(fallbackToday);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [mode, setMode] = useState<AppointmentMode>(lastAppointmentsMode);

  useEffect(() => {
    if (!isSignedIn || !getTokenRef.current) {
      return;
    }

    void loadContext(getTokenRef.current);
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

  useEffect(() => {
    const timezone = context?.barbershopTimezone;
    if (!timezone) {
      return;
    }

    setSelectedDate((current) => (
      current === fallbackToday
        ? getTodayDateStringInTimeZone(timezone)
        : current
    ));
  }, [context?.barbershopTimezone, fallbackToday]);

  useEffect(() => {
    if (
      !context
      || context.role !== 'OWNER'
      || !context.barbershopId
      || !getTokenRef.current
    ) {
      return;
    }

    void loadEmployees(getTokenRef.current, context.barbershopId);
  }, [context, loadEmployees]);

  useEffect(() => {
    if (!context || !getTokenRef.current) {
      return;
    }

    if (mode === 'list') {
      void loadAppointments(getTokenRef.current, context, selectedDate);
      return;
    }

    if (!context.barbershopId) {
      return;
    }

    void loadScheduleBoard(getTokenRef.current, context.barbershopId, {
      date: selectedDate,
      employeeId: context.role === 'OWNER' ? selectedEmployeeId : undefined,
    });
  }, [
    context,
    loadAppointments,
    loadScheduleBoard,
    mode,
    selectedDate,
    selectedEmployeeId,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return undefined;
      }

      if (!context || !getTokenRef.current) {
        return undefined;
      }

      if (mode === 'list') {
        void loadAppointments(getTokenRef.current, context, selectedDate);
        return undefined;
      }

      if (context.barbershopId) {
        void loadScheduleBoard(getTokenRef.current, context.barbershopId, {
          date: selectedDate,
          employeeId: context.role === 'OWNER' ? selectedEmployeeId : undefined,
          refresh: true,
        });
      }

      return undefined;
    }, [
      context,
      loadAppointments,
      loadScheduleBoard,
      mode,
      selectedDate,
      selectedEmployeeId,
    ]),
  );

  const handleRefresh = useCallback(async () => {
    if (!getTokenRef.current) {
      return;
    }

    await loadContext(getTokenRef.current);
    const { context: freshContext } = useContextStore.getState();

    if (!freshContext) {
      return;
    }

    if (freshContext.role === 'OWNER' && freshContext.barbershopId) {
      await loadEmployees(getTokenRef.current, freshContext.barbershopId);
    }

    if (mode === 'list') {
      await loadAppointments(getTokenRef.current, freshContext, selectedDate);
      return;
    }

    if (freshContext.barbershopId) {
      await loadScheduleBoard(getTokenRef.current, freshContext.barbershopId, {
        date: selectedDate,
        employeeId: freshContext.role === 'OWNER' ? selectedEmployeeId : undefined,
        refresh: true,
      });
    }
  }, [
    loadAppointments,
    loadContext,
    loadEmployees,
    loadScheduleBoard,
    mode,
    selectedDate,
    selectedEmployeeId,
  ]);

  const handleTransition = useCallback(async (
    appointmentId: string,
    newStatus: AppointmentStatus,
  ) => {
    if (!getTokenRef.current) {
      return;
    }

    try {
      await transitionStatus(getTokenRef.current, appointmentId, newStatus);
    } catch {
      // Store owns the error surface.
    }
  }, [transitionStatus]);

  const handleCancel = useCallback(async (appointmentId: string) => {
    if (!getTokenRef.current) {
      return;
    }

    try {
      await cancelAppointment(getTokenRef.current, appointmentId);
    } catch {
      // Store owns the error surface.
    }
  }, [cancelAppointment]);

  const filteredAppointments = useMemo(() => {
    if (!context || context.role !== 'OWNER' || !selectedEmployeeId) {
      return appointments;
    }

    return appointments.filter((appointment) => appointment.employeeId === selectedEmployeeId);
  }, [appointments, context, selectedEmployeeId]);

  const modeOptions = useMemo<AppointmentModeOption[]>(() => ([
    {
      id: 'agenda',
      label: t('appointments.modes.agenda'),
      selected: mode === 'agenda',
      testID: 'appointments-mode-agenda',
      onPress: () => {
        lastAppointmentsMode = 'agenda';
        setMode('agenda');
      },
    },
    {
      id: 'list',
      label: t('appointments.modes.list'),
      selected: mode === 'list',
      testID: 'appointments-mode-list',
      onPress: () => {
        lastAppointmentsMode = 'list';
        setMode('list');
      },
    },
  ]), [mode, t]);

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
  }, [context, employees, selectedEmployeeId, t]);

  const appointmentRows = useMemo<AppointmentRowViewModel[]>(() => (
    filteredAppointments.map((appointment) => {
      const actions: AppointmentActionViewModel[] = getAvailableAppointmentTransitions(
        context,
        appointment.status,
      ).map((targetStatus) => ({
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

      return {
        id: appointment.id,
        timeLabel: formatRecordTime(appointment.startAt) ?? '--:--',
        status: appointment.status,
        clientLabel: getAppointmentClientDisplayName(appointment),
        serviceLabel: getAppointmentServiceDisplayName(appointment),
        employeeLabel:
          context?.role === 'OWNER' && appointment.employee?.user?.name
            ? t('appointments.employeeLabel', { name: appointment.employee.user.name })
            : null,
        notificationLabels: buildAppointmentNotificationLabels(appointment.notifications, t),
        notes: appointment.notes,
        actions,
      };
    })
  ), [context, filteredAppointments, handleCancel, handleTransition, t]);

  const selectedBoardEmployee = useMemo<DailyScheduleBoardEmployee | null>(() => {
    if (!board) {
      return null;
    }

    if (context?.role === 'OWNER') {
      if (!selectedEmployeeId) {
        return null;
      }

      return board.employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
    }

    return board.employees[0] ?? null;
  }, [board, context?.role, selectedEmployeeId]);

  const selectedEmployeeSummary = useMemo(() => {
    if (!selectedBoardEmployee) {
      return null;
    }

    const intervals = selectedBoardEmployee.workingDay.intervals
      .map((interval) => `${interval.startTime}–${interval.endTime}`)
      .join(' · ');

    if (!intervals) {
      return null;
    }

    return t('appointments.agenda.workingDaySummary', {
      intervals,
      confirmed: selectedBoardEmployee.summary.confirmed,
      inProgress: selectedBoardEmployee.summary.inProgress,
      completed: selectedBoardEmployee.summary.completed,
    });
  }, [selectedBoardEmployee, t]);

  const selectedEmployeeMeta = useMemo(() => {
    if (!selectedBoardEmployee) {
      return null;
    }

    return t('appointments.agenda.occupiedMinutes', {
      count: selectedBoardEmployee.summary.occupiedMinutes,
    });
  }, [selectedBoardEmployee, t]);

  const selectedEmployeeException = useMemo(() => {
    if (!selectedBoardEmployee || selectedBoardEmployee.workingDay.closedIntervals.length === 0) {
      return null;
    }

    return selectedBoardEmployee.workingDay.closedIntervals
      .map((interval) => t('appointments.agenda.scheduleExceptionClosed', {
        start: interval.startTime,
        end: interval.endTime,
      }))
      .join(' · ');
  }, [selectedBoardEmployee, t]);

  const summaryCards = useMemo<AgendaEmployeeSummaryCard[]>(() => {
    if (!board || context?.role !== 'OWNER' || selectedEmployeeId !== null) {
      return [];
    }

    return board.employees.map((employee) => ({
      id: employee.id,
      title: employee.name,
      summary: t('appointments.agenda.employeeSummary', {
        confirmed: employee.summary.confirmed,
        inProgress: employee.summary.inProgress,
        available: employee.availableGaps.length,
      }),
      subtitle:
        employee.workingDay.intervals.length > 0
          ? employee.workingDay.intervals
            .map((interval) => `${interval.startTime}–${interval.endTime}`)
            .join(' · ')
          : t('appointments.agenda.closedDayCard'),
      badgeLabel:
        employee.workingDay.availabilityState === 'TIME_OFF'
          ? t('appointments.agenda.timeOffLabel')
          : employee.workingDay.availabilityState === 'CUSTOM_HOURS'
            ? t('appointments.agenda.specialHoursLabel')
            : employee.workingDay.availabilityState === 'OFF'
              ? t('appointments.agenda.notWorkingLabel')
              : employee.isCurrentUser
                ? t('appointments.agenda.currentUserBadge')
                : t('appointments.agenda.workingLabel'),
      testID: `appointments-agenda-summary-${employee.id}`,
      onPress: () => setSelectedEmployeeId(employee.id),
    }));
  }, [board, context?.role, selectedEmployeeId, t]);

  const agendaTimelineItems = useMemo<AgendaTimelineItem[]>(() => {
    if (!selectedBoardEmployee) {
      return [];
    }

    const sortable: TimelineSortableItem[] = [];

    for (const closedInterval of selectedBoardEmployee.workingDay.closedIntervals) {
      sortable.push({
        id: `closed-${closedInterval.startAt}`,
        startAt: closedInterval.startAt,
        endAt: closedInterval.endAt,
        item: {
          id: `closed-${closedInterval.startAt}`,
          kind: 'closed',
          title: t('appointments.agenda.scheduleExceptionTitle'),
          message: t('appointments.agenda.scheduleExceptionClosed', {
            start: closedInterval.startTime,
            end: closedInterval.endTime,
          }),
          timeLabel: `${closedInterval.startTime}–${closedInterval.endTime}`,
        },
      });
    }

    for (const gap of selectedBoardEmployee.availableGaps) {
      sortable.push({
        id: `gap-${gap.startAt}`,
        startAt: gap.startAt,
        endAt: gap.endAt,
        item: {
          id: `gap-${gap.startAt}`,
          kind: 'gap',
          title: t('appointments.agenda.availableGapTitle'),
          timeLabel: `${gap.localStartTime}–${gap.localEndTime}`,
          durationLabel: t('appointments.agenda.gapDuration', {
            count: gap.durationMinutes,
          }),
          helper:
            gap.minimumBookableDuration !== null
              ? t('appointments.agenda.minimumBookableDuration', {
                count: gap.minimumBookableDuration,
              })
              : null,
          actionLabel: t('appointments.agenda.createAction'),
          actionAccessibilityLabel: t('appointments.agenda.createActionAtTime', {
            time: `${gap.localStartTime}–${gap.localEndTime}`,
          }),
          onPress: () => {
            router.push({
              pathname: '/(tabs)/appointments-create',
              params: {
                prefillEmployeeId: selectedBoardEmployee.id,
                prefillDate: board?.date,
                prefillStartAt: gap.startAt,
              },
            });
          },
        },
      });
    }

    for (const appointment of selectedBoardEmployee.appointments) {
      const currentTimeIso = board?.currentTime?.iso ?? null;
      const actions: AgendaAppointmentActionViewModel[] = [
        {
          id: 'detail',
          label: t('appointments.detailAction'),
          variant: 'secondary',
          testID: `agenda-appointment-detail-${appointment.id}`,
          onPress: () => {
            router.push({
              pathname: '/(tabs)/appointment-detail',
              params: { appointmentId: appointment.id },
            });
          },
        },
      ];

      if (appointment.canReschedule) {
        actions.push({
          id: 'reschedule',
          label: t('appointments.rescheduleAction'),
          variant: 'secondary',
          testID: `agenda-appointment-reschedule-${appointment.id}`,
          onPress: () => {
            router.push({
              pathname: '/(tabs)/appointments-reschedule',
              params: { appointmentId: appointment.id },
            });
          },
        });
      }

      if (appointment.canStart) {
        actions.push({
          id: 'start',
          label: getAppointmentTransitionLabel('IN_PROGRESS'),
          variant: 'secondary',
          testID: `agenda-appointment-start-${appointment.id}`,
          onPress: () => {
            void handleTransition(appointment.id, 'IN_PROGRESS');
          },
        });
      }

      if (appointment.canComplete) {
        actions.push({
          id: 'complete',
          label: getAppointmentTransitionLabel('COMPLETED'),
          variant: 'secondary',
          testID: `agenda-appointment-complete-${appointment.id}`,
          onPress: () => {
            void handleTransition(appointment.id, 'COMPLETED');
          },
        });
      }

      if (appointment.canMarkNoShow) {
        actions.push({
          id: 'no-show',
          label: getAppointmentTransitionLabel('NO_SHOW'),
          variant: 'secondary',
          testID: `agenda-appointment-no-show-${appointment.id}`,
          onPress: () => {
            void handleTransition(appointment.id, 'NO_SHOW');
          },
        });
      }

      if (appointment.canCancel) {
        actions.push({
          id: 'cancel',
          label: getAppointmentTransitionLabel('CANCELLED'),
          variant: 'danger',
          testID: `agenda-appointment-cancel-${appointment.id}`,
          onPress: () => {
            void handleCancel(appointment.id);
          },
        });
      }

      sortable.push({
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        item: {
          id: appointment.id,
          kind: 'appointment',
          timeLabel: `${appointment.localStartTime}–${appointment.localEndTime}`,
          status: appointment.status,
          title: appointment.clientDisplayName,
          subtitle: appointment.serviceName,
          employeeLabel:
            context?.role === 'OWNER'
              ? t('appointments.employeeLabel', { name: appointment.employeeName })
              : null,
          attentionLabels: buildAgendaAttentionLabels(appointment, t),
          actions,
          onPress: () => {
            router.push({
              pathname: '/(tabs)/appointment-detail',
              params: { appointmentId: appointment.id },
            });
          },
          isCurrent:
            currentTimeIso !== null
            && appointment.status === 'IN_PROGRESS'
            && new Date(currentTimeIso).getTime() >= new Date(appointment.startAt).getTime()
            && new Date(currentTimeIso).getTime() <= new Date(appointment.endAt).getTime(),
        },
      });
    }

    sortable.sort((left, right) => left.startAt.localeCompare(right.startAt));

    if (board?.currentTime) {
      return insertCurrentTimeMarker(
        sortable,
        t('appointments.agenda.currentTimeLabel', {
          time: board.currentTime.localTime,
        }),
        board.currentTime.iso,
      );
    }

    return sortable.map((entry) => entry.item);
  }, [
    board,
    context?.role,
    handleCancel,
    handleTransition,
    router,
    selectedBoardEmployee,
    t,
  ]);

  const emptyAgendaState = useMemo(() => {
    if (!selectedBoardEmployee) {
      return {
        title: t('appointments.agenda.emptyAllTitle'),
        message: t('appointments.agenda.emptyAllMessage'),
      };
    }

    if (selectedBoardEmployee.workingDay.source === 'weekly_closed' || selectedBoardEmployee.workingDay.source === 'date_exception_closed') {
      return {
        title: t('appointments.agenda.closedDayTitle'),
        message: t('appointments.agenda.closedDayMessage'),
      };
    }

    if (selectedBoardEmployee.workingDay.source === 'EMPLOYEE_FULL_DAY_OFF') {
      return {
        title: t('appointments.agenda.timeOffLabel'),
        message: t('appointments.agenda.timeOffMessage'),
      };
    }

    if (selectedBoardEmployee.workingDay.intervals.length === 0) {
      return {
        title: t('appointments.agenda.employeeNotWorkingTitle'),
        message: t('appointments.agenda.employeeNotWorkingMessage'),
      };
    }

    return {
      title: t('appointments.emptyTitle'),
      message: t('appointments.agenda.workingNoAppointmentsMessage'),
    };
  }, [selectedBoardEmployee, t]);

  const timezone = context?.barbershopTimezone ?? DEFAULT_BARBERSHOP_TIMEZONE;
  const isTodaySelected = isTodayDateStringInTimeZone(selectedDate, timezone);

  const handlePrevDate = useCallback(() => {
    setSelectedDate((current) => addDaysToDateString(current, -1));
  }, []);

  const handleToday = useCallback(() => {
    setSelectedDate(getTodayDateStringInTimeZone(timezone));
  }, [timezone]);

  const handleNextDate = useCallback(() => {
    setSelectedDate((current) => addDaysToDateString(current, 1));
  }, []);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (mode === 'list') {
    return (
      <AppointmentsScreenView
        context={context}
        isContextLoading={isContextLoading}
        isAppointmentsLoading={isAppointmentsLoading}
        appointmentsError={appointmentsError}
        isRefreshing={isContextLoading || isAppointmentsLoading}
        flashMessage={flashMessage}
        showCreateAction={context?.role === 'OWNER' || context?.role === 'BARBER'}
        selectedDate={selectedDate}
        isTodaySelected={isTodaySelected}
        modeOptions={modeOptions}
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

  return (
    <AppointmentsAgendaScreenView
      context={context}
      isContextLoading={isContextLoading}
      isAgendaLoading={isScheduleBoardLoading}
      agendaError={scheduleBoardError}
      isRefreshing={isContextLoading || isScheduleBoardRefreshing}
      flashMessage={flashMessage}
      showCreateAction={context?.role === 'OWNER' || context?.role === 'BARBER'}
      selectedDate={selectedDate}
      isTodaySelected={isTodaySelected}
      modeOptions={modeOptions}
      employeeFilters={employeeFilters}
      selectedEmployeeTitle={selectedBoardEmployee?.name ?? null}
      selectedEmployeeSummary={selectedEmployeeSummary}
      selectedEmployeeMeta={selectedEmployeeMeta}
      selectedEmployeeException={selectedEmployeeException}
      summaryCards={summaryCards}
      timelineItems={agendaTimelineItems}
      emptyTitle={emptyAgendaState.title}
      emptyMessage={emptyAgendaState.message}
      onCreateAppointment={() => router.push('/(tabs)/appointments-create')}
      onRefresh={handleRefresh}
      onPrevDate={handlePrevDate}
      onToday={handleToday}
      onNextDate={handleNextDate}
    />
  );
}
