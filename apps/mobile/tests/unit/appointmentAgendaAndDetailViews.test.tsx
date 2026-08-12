import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/index.js', async () => {
  const React = await import('react');

  const createPrimitive = (name: string) => {
    const Component = ({
      children,
      ...props
    }: Record<string, unknown>) => React.createElement(name, props, children);
    Component.displayName = name;
    return Component;
  };

  const AppButton = ({
    children,
    title,
    ...props
  }: Record<string, unknown>) => React.createElement('Pressable', props, title ?? children);
  AppButton.displayName = 'AppButton';

  const EmptyState = ({
    title,
    message,
  }: Record<string, unknown>) => React.createElement(
    'View',
    null,
    React.createElement('Text', null, title as string | undefined),
    React.createElement('Text', null, message as string | undefined),
  );
  EmptyState.displayName = 'EmptyState';

  const ScreenHeader = ({
    title,
    subtitle,
    rightAction,
  }: Record<string, unknown>) => React.createElement(
    'View',
    null,
    React.createElement('Text', null, title as string | undefined),
    subtitle ? React.createElement('Text', null, subtitle as string) : null,
    rightAction as React.ReactNode,
  );
  ScreenHeader.displayName = 'ScreenHeader';

  const SectionHeader = ({
    title,
    action,
  }: Record<string, unknown>) => React.createElement(
    'View',
    null,
    React.createElement('Text', null, title as string | undefined),
    action as React.ReactNode,
  );
  SectionHeader.displayName = 'SectionHeader';

  const StatusBadge = ({ status }: Record<string, unknown>) =>
    React.createElement('Text', null, status as string | undefined);
  StatusBadge.displayName = 'StatusBadge';

  const RoleBadge = ({ role }: Record<string, unknown>) =>
    React.createElement('Text', null, role as string | undefined);
  RoleBadge.displayName = 'RoleBadge';

  return {
    AppButton,
    AppCard: createPrimitive('View'),
    EmptyState,
    RoleBadge,
    Screen: createPrimitive('View'),
    ScreenHeader,
    SectionHeader,
    StatusBadge,
  };
});

import { AppointmentDetailScreenView } from '@/components/AppointmentDetailScreenView.js';
import { AppointmentsAgendaScreenView, type AgendaTimelineItem } from '@/components/AppointmentsAgendaScreenView.js';
import {
  findByDisplayName,
  findByTestId,
  findByText,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';
import type { Appointment, CurrentUserContext } from '@/lib/types.js';

const OWNER_CONTEXT: CurrentUserContext = {
  userId: 'owner-1',
  role: 'OWNER',
  barbershopId: 'shop-1',
  barbershopName: 'Downtown Barber',
  barbershopTimezone: 'America/Argentina/Tucuman',
  employeeId: null,
  employeeName: null,
};

function makeAppointment(): Appointment {
  return {
    id: 'appt-1',
    barbershopId: 'shop-1',
    employeeId: 'emp-1',
    clientId: null,
    customerId: 'cust-1',
    serviceId: 'svc-1',
    clientName: 'Mateo',
    clientPhone: '+5493815000000',
    clientEmail: 'mateo@example.com',
    serviceName: 'Classic Cut',
    servicePriceCents: 2000,
    serviceDurationMinutes: 30,
    serviceCurrency: 'ARS',
    startAt: '2026-07-20T13:00:00.000Z',
    endAt: '2026-07-20T13:30:00.000Z',
    status: 'CONFIRMED',
    notes: 'Prefers a low fade',
    createdAt: '2026-07-18T13:00:00.000Z',
    updatedAt: '2026-07-18T13:00:00.000Z',
    deletedAt: null,
    barbershop: {
      id: 'shop-1',
      name: 'Downtown Barber',
      timezone: 'America/Argentina/Tucuman',
    },
    employee: {
      id: 'emp-1',
      user: {
        id: 'user-1',
        name: 'Carlos',
      },
    },
    notifications: [],
    changes: [],
    client: null,
    service: {
      id: 'svc-1',
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 2000,
      currency: 'ARS',
    },
  };
}

describe('schedule board appointment views', () => {
  it('renders agenda timeline items and reuses gap + appointment actions', () => {
    const onCreate = vi.fn();
    const onSummaryCard = vi.fn();
    const onAppointmentOpen = vi.fn();
    const onAppointmentAction = vi.fn();

    const timelineItems: AgendaTimelineItem[] = [
      {
        id: 'current-time',
        kind: 'currentTime',
        label: 'Now · 10:15',
      },
      {
        id: 'lunch',
        kind: 'closed',
        title: 'Special schedule',
        timeLabel: '13:00–15:00',
        message: 'Closed from 13:00 to 15:00',
      },
      {
        id: 'gap-1',
        kind: 'gap',
        title: 'Available',
        timeLabel: '10:30–11:30',
        durationLabel: '60 min',
        helper: 'Minimum assigned service: 30 min',
        actionLabel: 'Create appointment',
        actionAccessibilityLabel: 'Create appointment in the available gap 10:30–11:30',
        onPress: onCreate,
      },
      {
        id: 'appt-1',
        kind: 'appointment',
        timeLabel: '11:30–12:00',
        status: 'CONFIRMED',
        title: 'Mateo',
        subtitle: 'Classic Cut',
        employeeLabel: 'Barber: Carlos',
        attentionLabels: ['Returning customer', 'Delivery error'],
        actions: [
          {
            id: 'detail',
            label: 'View detail',
            variant: 'secondary',
            testID: 'agenda-action-detail',
            onPress: onAppointmentAction,
          },
        ],
        onPress: onAppointmentOpen,
        isCurrent: false,
      },
    ];

    const tree = AppointmentsAgendaScreenView({
      context: OWNER_CONTEXT,
      isContextLoading: false,
      isAgendaLoading: false,
      agendaError: null,
      isRefreshing: false,
      flashMessage: 'Synced',
      showCreateAction: true,
      selectedDate: '2026-07-20',
      isTodaySelected: true,
      modeOptions: [
        {
          id: 'agenda',
          label: 'Agenda',
          selected: true,
          testID: 'mode-agenda',
          onPress: vi.fn(),
        },
        {
          id: 'list',
          label: 'List',
          selected: false,
          testID: 'mode-list',
          onPress: vi.fn(),
        },
      ],
      employeeFilters: [
        {
          id: 'all',
          label: 'All',
          selected: true,
          testID: 'employee-filter-all',
          onPress: vi.fn(),
        },
      ],
      selectedEmployeeTitle: 'Carlos',
      selectedEmployeeSummary: '1 confirmed · 1 available gap',
      selectedEmployeeMeta: '09:00–18:00',
      selectedEmployeeException: null,
      summaryCards: [
        {
          id: 'summary-1',
          title: 'Carlos',
          summary: '1 confirmed · 1 available gap',
          subtitle: '09:00–18:00',
          badgeLabel: 'You',
          testID: 'employee-summary-1',
          onPress: onSummaryCard,
        },
      ],
      timelineItems,
      emptyTitle: 'No appointments',
      emptyMessage: 'Try another day.',
      onCreateAppointment: vi.fn(),
      onRefresh: vi.fn(),
      onPrevDate: vi.fn(),
      onToday: vi.fn(),
      onNextDate: vi.fn(),
    });

    const flatList = findByDisplayName(tree, 'FlatList');
    const listHeader = (flatList.props as {
      ListHeaderComponent: unknown;
      renderItem: (input: { item: AgendaTimelineItem; index: number }) => unknown;
    }).ListHeaderComponent;
    const renderItem = (flatList.props as {
      ListHeaderComponent: unknown;
      renderItem: (input: { item: AgendaTimelineItem; index: number }) => unknown;
    }).renderItem;

    expect(findByTestId(listHeader, 'appointments-mode-switch')).toBeDefined();
    expect(findByTestId(listHeader, 'appointments-date-controls')).toBeDefined();
    press(findByTestId(listHeader, 'employee-summary-1'));

    const currentTimeRow = renderItem({ item: timelineItems[0]!, index: 0 });
    const closedRow = renderItem({ item: timelineItems[1]!, index: 1 });
    const gapRow = renderItem({ item: timelineItems[2]!, index: 2 });
    const appointmentRow = renderItem({ item: timelineItems[3]!, index: 3 });

    expect(findByText(currentTimeRow, 'Now · 10:15')).toBeDefined();
    expect(findByTestId(closedRow, 'agenda-item-lunch')).toBeDefined();
    expect(findByTestId(gapRow, 'agenda-item-gap-1')).toBeDefined();
    expect(findByTestId(appointmentRow, 'agenda-item-appt-1')).toBeDefined();
    expect(findByText(appointmentRow, 'Returning customer')).toBeDefined();
    expect(findByText(appointmentRow, 'Delivery error')).toBeDefined();

    press(findByTestId(gapRow, 'agenda-gap-action-gap-1'));
    press(findByTestId(appointmentRow, 'agenda-item-appt-1'));
    press(findByTestId(appointmentRow, 'agenda-action-detail'));

    expect(onSummaryCard).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onAppointmentOpen).toHaveBeenCalledTimes(1);
    expect(onAppointmentAction).toHaveBeenCalledTimes(1);
  });

  it('renders the agenda empty state without timeline rows', () => {
    const tree = AppointmentsAgendaScreenView({
      context: OWNER_CONTEXT,
      isContextLoading: false,
      isAgendaLoading: false,
      agendaError: null,
      isRefreshing: false,
      flashMessage: null,
      showCreateAction: false,
      selectedDate: '2026-07-21',
      isTodaySelected: false,
      modeOptions: [],
      employeeFilters: [],
      selectedEmployeeTitle: null,
      selectedEmployeeSummary: null,
      selectedEmployeeMeta: null,
      selectedEmployeeException: null,
      summaryCards: [],
      timelineItems: [],
      emptyTitle: 'The barbershop is closed this day.',
      emptyMessage: 'Choose another date to review the schedule.',
      onCreateAppointment: vi.fn(),
      onRefresh: vi.fn(),
      onPrevDate: vi.fn(),
      onToday: vi.fn(),
      onNextDate: vi.fn(),
    });

    expect(findByTestId(tree, 'appointments-agenda-empty')).toBeDefined();
    expect(queryByTestId(tree, 'agenda-item-current-time')).toBeNull();
    expect(findByText(tree, 'The barbershop is closed this day.')).toBeDefined();
  });

  it('renders appointment detail states and actions without duplicating logic in the card', () => {
    const onBack = vi.fn();
    const onReschedule = vi.fn();

    const tree = AppointmentDetailScreenView({
      appointment: makeAppointment(),
      summaryTimeLabel: 'Mon, Jul 20 · 10:00–10:30',
      employeeDisplayLabel: 'Barber: Carlos',
      changeRows: [
        {
          id: 'change-1',
          title: 'Reschedule',
          body: 'Mon, Jul 20 09:30 → Mon, Jul 20 10:00',
          meta: 'Carlos',
        },
      ],
      notificationRows: [
        {
          id: 'notification-1',
          label: 'Delivery error',
          meta: 'Mon, Jul 20',
        },
      ],
      actions: [
        {
          id: 'reschedule',
          label: 'Reschedule appointment',
          variant: 'secondary',
          testID: 'appointment-detail-reschedule',
          onPress: onReschedule,
        },
      ],
      isLoading: false,
      error: null,
      isMutating: false,
      onBack,
    });

    expect(findByText(tree, 'Appointment detail')).toBeDefined();
    expect(findByText(tree, 'Mateo')).toBeDefined();
    expect(findByText(tree, 'Prefers a low fade')).toBeDefined();
    expect(findByText(tree, 'Notification history')).toBeDefined();
    expect(findByText(tree, 'Delivery error')).toBeDefined();
    expect(findByText(tree, 'Reschedule')).toBeDefined();

    press(findByTestId(tree, 'appointment-detail-back'));
    press(findByTestId(tree, 'appointment-detail-reschedule'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onReschedule).toHaveBeenCalledTimes(1);
  });
});
