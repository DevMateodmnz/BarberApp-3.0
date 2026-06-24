import { describe, expect, it, vi } from 'vitest';

import {
  AppointmentsScreenView,
  type AppointmentActionViewModel,
  type AppointmentRowViewModel,
  type EmployeeFilterOption,
} from '@/components/AppointmentsScreenView.js';
import { formatBusinessDateLabel } from '@/lib/format.js';
import {
  findAll,
  findByTestId,
  findByText,
  getDisplayName,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';
import type { ReactElement, ReactNode } from 'react';


interface ElementLike {
  type: { displayName?: string } | string;
  props: Record<string, unknown>;
}

function pressButton(node: ReactNode, testID: string): void {
  const matches = findAll(
    node,
    (el) => getDisplayName(el) === 'Pressable' && (el as ElementLike).props.testID === testID,
  );
  if (matches.length === 0) {
    throw new Error(`No Pressable button with testID ${testID}`);
  }
  press(matches[0] as ReactElement);
}

const OWNER_CONTEXT = {
  userId: 'u-owner',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

const BARBER_CONTEXT = {
  userId: 'u-barber',
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
};

const CLIENT_CONTEXT = {
  userId: 'u-client',
  role: 'CLIENT' as const,
  barbershopId: null,
  barbershopName: null,
  employeeId: null,
  employeeName: null,
};

function makeEmployeeFilters(overrides: Partial<EmployeeFilterOption>[] = []): EmployeeFilterOption[] {
  const base: EmployeeFilterOption[] = [
    {
      id: 'all',
      label: 'All',
      selected: true,
      testID: 'appointments-filter-all',
      onPress: vi.fn(),
    },
    {
      id: 'emp-1',
      label: 'Carlos',
      selected: false,
      testID: 'appointments-filter-emp-1',
      onPress: vi.fn(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function makeActions(overrides: Partial<AppointmentActionViewModel>[] = []): AppointmentActionViewModel[] {
  const base: AppointmentActionViewModel[] = [
    {
      status: 'CONFIRMED',
      label: 'Confirm',
      testID: 'appointment-action-appt-1-CONFIRMED',
      onPress: vi.fn(),
    },
    {
      status: 'CANCELLED',
      label: 'Cancel',
      testID: 'appointment-action-appt-1-CANCELLED',
      onPress: vi.fn(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function makeAppointments(overrides: Partial<AppointmentRowViewModel>[] = []): AppointmentRowViewModel[] {
  const base: AppointmentRowViewModel[] = [
    {
      id: 'appt-1',
      timeLabel: '14:30',
      status: 'PENDING',
      clientLabel: 'Juan Pérez',
      serviceLabel: 'Classic Cut',
      employeeLabel: 'Barber: Carlos',
      notes: 'Arrives after work.',
      actions: makeActions(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function renderView(overrides: Partial<Parameters<typeof AppointmentsScreenView>[0]> = {}) {
  return AppointmentsScreenView({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    isAppointmentsLoading: false,
    appointmentsError: null,
    isRefreshing: false,
    selectedDate: '2026-06-16',
    isTodaySelected: true,
    employeeFilters: makeEmployeeFilters(),
    appointmentRows: makeAppointments(),
    onRefresh: vi.fn(),
    onPrevDate: vi.fn(),
    onToday: vi.fn(),
    onNextDate: vi.fn(),
    ...overrides,
  });
}

describe('AppointmentsScreenView', () => {
  it('renders the client blocked state', () => {
    const tree = renderView({ context: CLIENT_CONTEXT, employeeFilters: [], appointmentRows: [] });
    expect(findByTestId(tree, 'appointments-client-blocked')).toBeDefined();
    expect(findByText(tree, 'Appointment management is available only to barbershop owners and barbers.')).toBeDefined();
  });

  it('renders the context loading state', () => {
    const tree = renderView({ context: null, isContextLoading: true, appointmentRows: [], employeeFilters: [] });
    expect(findByTestId(tree, 'appointments-loading')).toBeDefined();
    expect(findByText(tree, 'Loading your context…')).toBeDefined();
  });

  it('renders date controls and fires navigation callbacks', () => {
    const onPrevDate = vi.fn();
    const onToday = vi.fn();
    const onNextDate = vi.fn();
    const tree = renderView({ onPrevDate, onToday, onNextDate, isTodaySelected: false });

    expect(findByTestId(tree, 'appointments-date-controls')).toBeDefined();
    expect(findByTestId(tree, 'appointments-date-prev')).toBeDefined();
    expect(findByTestId(tree, 'appointments-date-today')).toBeDefined();
    expect(findByTestId(tree, 'appointments-date-next')).toBeDefined();
    expect(findByTestId(tree, 'appointments-date-display')).toBeDefined();
    expect(findByText(tree, formatBusinessDateLabel('2026-06-16'))).toBeDefined();

    press(findByTestId(tree, 'appointments-date-prev'));
    expect(onPrevDate).toHaveBeenCalledTimes(1);

    pressButton(tree, 'appointments-date-today');
    expect(onToday).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'appointments-date-next'));
    expect(onNextDate).toHaveBeenCalledTimes(1);
  });

  it('disables the today button when the selected date is already today', () => {
    const onToday = vi.fn();
    const tree = renderView({ onToday, isTodaySelected: true });
    pressButton(tree, 'appointments-date-today');
    expect(onToday).not.toHaveBeenCalled();
  });

  it('renders owner employee filter buttons and calls their handlers', () => {
    const allPress = vi.fn();
    const employeePress = vi.fn();
    const tree = renderView({
      employeeFilters: makeEmployeeFilters([
        { onPress: allPress },
        { onPress: employeePress },
      ]),
    });

    expect(findByTestId(tree, 'appointments-employee-filter')).toBeDefined();
    press(findByTestId(tree, 'appointments-filter-all'));
    expect(allPress).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'appointments-filter-emp-1'));
    expect(employeePress).toHaveBeenCalledTimes(1);
  });

  it('renders an appointments loading state', () => {
    const tree = renderView({ isAppointmentsLoading: true, appointmentRows: [] });
    expect(findByText(tree, 'Loading appointments…')).toBeDefined();
  });

  it('renders an error state', () => {
    const tree = renderView({ appointmentsError: 'Appointments failed', appointmentRows: [] });
    expect(findByTestId(tree, 'appointments-error')).toBeDefined();
    expect(findByText(tree, 'Appointments failed')).toBeDefined();
  });

  it('renders an empty state when no appointments match the date', () => {
    const tree = renderView({ appointmentRows: [] });
    expect(findByTestId(tree, 'appointments-empty')).toBeDefined();
    expect(findByText(tree, 'No appointments for this date.')).toBeDefined();
  });

  it('renders appointment rows with status badges and details for owners', () => {
    const tree = renderView();
    const card = findByTestId(tree, 'appointment-appt-1');
    expect(card).toBeDefined();
    expect(findByText(card, 'Juan Pérez')).toBeDefined();
    expect(findByText(card, 'Classic Cut')).toBeDefined();
    expect(findByText(card, '14:30')).toBeDefined();
    expect(findByText(card, 'Pending')).toBeDefined();
    expect(findByText(card, 'Barber: Carlos')).toBeDefined();
    expect(findByText(card, 'Arrives after work.')).toBeDefined();
  });

  it('renders barber context without owner filter controls', () => {
    const tree = renderView({
      context: BARBER_CONTEXT,
      employeeFilters: [],
      appointmentRows: makeAppointments([{ employeeLabel: null }]),
    });
    expect(findByText(tree, 'Barber')).toBeDefined();
    expect(findByText(tree, 'Review and update the appointments assigned to your schedule.')).toBeDefined();
    expect(queryByTestId(tree, 'appointments-employee-filter')).toBeNull();
  });

  it('renders available action buttons and calls their handlers', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const tree = renderView({
      appointmentRows: makeAppointments([
        {
          actions: makeActions([
            { onPress: onConfirm },
            { onPress: onCancel },
          ]),
        },
      ]),
    });

    expect(findByTestId(tree, 'appointment-actions-appt-1')).toBeDefined();
    press(findByTestId(tree, 'appointment-action-appt-1-CONFIRMED'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'appointment-action-appt-1-CANCELLED'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
