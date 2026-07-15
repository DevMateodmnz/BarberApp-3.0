import { describe, expect, it, vi } from 'vitest';

import {
  EmployeeScheduleScreenView,
  type EmployeeScheduleDayRowViewModel,
} from '@/components/EmployeeScheduleScreenView.js';
import {
  changeText,
  findAll,
  findByDisplayName,
  findByTestId,
  findByText,
  getDisplayName,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';
import type { EmployeeScheduleDetail } from '@/lib/types.js';
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

function makeSchedule(
  overrides: Partial<EmployeeScheduleDetail> = {},
): EmployeeScheduleDetail {
  return {
    employee: {
      id: 'emp-1',
      displayName: 'Carlos',
      isActive: true,
    },
    timezone: 'America/Argentina/Tucuman',
    scheduleMode: 'CUSTOM',
    expectedUpdatedAt: '2026-07-15T23:00:00.000Z',
    weeklyIntervals: [{ dayOfWeek: 1, start: '09:00', end: '18:00' }],
    barbershopWeeklyIntervals: [{ dayOfWeek: 1, start: '09:00', end: '19:00' }],
    upcomingExceptions: [
      {
        localDate: '2026-07-18',
        type: 'FULL_DAY_OFF',
        reason: 'Vacation',
        intervals: [],
      },
      {
        localDate: '2026-07-19',
        type: 'CUSTOM_HOURS',
        reason: 'Special shift',
        intervals: [{ start: '10:00', end: '14:00' }],
      },
    ],
    effectivePreview: [
      {
        localDate: '2026-07-16',
        source: 'CUSTOM_WEEKLY',
        intervals: [{ start: '09:00', end: '18:00' }],
      },
      {
        localDate: '2026-07-17',
        source: 'EMPLOYEE_FULL_DAY_OFF',
        intervals: [],
      },
    ],
    conflictingFutureAppointmentsCount: 1,
    conflictingFutureAppointments: [
      {
        appointmentId: 'appt-1',
        startAt: '2026-07-18T14:00:00.000Z',
        endAt: '2026-07-18T15:00:00.000Z',
        customerDisplayName: 'Juan Pérez',
        serviceName: 'Classic Cut',
        reasonCode: 'EMPLOYEE_TIME_OFF',
      },
    ],
    ...overrides,
  };
}

function makeDayRows(
  overrides: Partial<EmployeeScheduleDayRowViewModel>[] = [],
): EmployeeScheduleDayRowViewModel[] {
  const base: EmployeeScheduleDayRowViewModel[] = [
    {
      dayOfWeek: 0,
      dayName: 'Sunday',
      isActive: false,
      start: '',
      end: '',
      error: null,
      onToggle: vi.fn(),
      onStartChange: vi.fn(),
      onEndChange: vi.fn(),
    },
    {
      dayOfWeek: 1,
      dayName: 'Monday',
      isActive: true,
      start: '09:00',
      end: '18:00',
      error: null,
      onToggle: vi.fn(),
      onStartChange: vi.fn(),
      onEndChange: vi.fn(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function renderView(
  overrides: Partial<Parameters<typeof EmployeeScheduleScreenView>[0]> = {},
) {
  return EmployeeScheduleScreenView({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    contextError: null,
    schedule: makeSchedule(),
    isScheduleLoading: false,
    scheduleError: null,
    isOwner: true,
    isReadOnly: false,
    mode: 'CUSTOM',
    dayRows: makeDayRows(),
    saveError: null,
    saving: false,
    exceptionDate: '2026-07-20',
    exceptionType: 'CUSTOM_HOURS',
    exceptionStart: '10:00',
    exceptionEnd: '14:00',
    exceptionReason: 'Doctor appointment',
    exceptionError: null,
    exceptionSaving: false,
    deletingExceptionDate: null,
    conflictMessage: 'Existing appointments outside the new schedule still need review.',
    onRefresh: vi.fn(),
    onBack: vi.fn(),
    onModeChange: vi.fn(),
    onCopyFromBarbershop: vi.fn(),
    onSave: vi.fn(),
    onExceptionDateChange: vi.fn(),
    onExceptionTypeChange: vi.fn(),
    onExceptionStartChange: vi.fn(),
    onExceptionEndChange: vi.fn(),
    onExceptionReasonChange: vi.fn(),
    onSaveException: vi.fn(),
    onDeleteException: vi.fn(),
    ...overrides,
  });
}

describe('EmployeeScheduleScreenView', () => {
  it('renders the loading state before schedule data is available', () => {
    const tree = renderView({
      context: OWNER_CONTEXT,
      schedule: null,
      isScheduleLoading: true,
      dayRows: [],
    });

    expect(findByTestId(tree, 'employee-schedule-loading')).toBeDefined();
    expect(findByText(tree, 'Loading employee schedule…')).toBeDefined();
  });

  it('renders the custom weekly editor and calls schedule actions', () => {
    const onModeChange = vi.fn();
    const onCopyFromBarbershop = vi.fn();
    const onSave = vi.fn();
    const onDeleteException = vi.fn();
    const tree = renderView({
      onModeChange,
      onCopyFromBarbershop,
      onSave,
      onDeleteException,
    });

    expect(findByText(tree, 'Employee schedule')).toBeDefined();
    expect(findByText(tree, 'Main St Barber')).toBeDefined();
    expect(findByText(tree, 'America/Argentina/Tucuman')).toBeDefined();
    expect(findByText(tree, 'Monday')).toBeDefined();
    expect(findByText(tree, 'Sunday')).toBeDefined();
    expect(findByText(tree, 'Not working this day.')).toBeDefined();
    expect(findByText(tree, 'Vacation')).toBeDefined();
    expect(findByText(tree, 'Special shift')).toBeDefined();
    expect(findByText(tree, 'Employee time off')).toBeDefined();
    expect(queryByTestId(tree, 'employee-schedule-conflicts-empty')).toBeNull();
    expect(findByText(tree, 'Existing appointments outside the new schedule still need review.'))
      .toBeDefined();

    press(findByTestId(tree, 'employee-schedule-mode-inherit'));
    expect(onModeChange).toHaveBeenCalledWith('INHERIT_BARBERSHOP');

    press(findByTestId(tree, 'employee-schedule-copy-barbershop'));
    expect(onCopyFromBarbershop).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-schedule-save'));
    expect(onSave).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'employee-schedule-delete-exception-2026-07-18'));
    expect(onDeleteException).toHaveBeenCalledWith('2026-07-18');
  });

  it('wires weekly and exception input callbacks', () => {
    const onToggle = vi.fn();
    const onStartChange = vi.fn();
    const onEndChange = vi.fn();
    const onExceptionDateChange = vi.fn();
    const onExceptionTypeChange = vi.fn();
    const onExceptionStartChange = vi.fn();
    const onExceptionEndChange = vi.fn();
    const onExceptionReasonChange = vi.fn();
    const onSaveException = vi.fn();
    const tree = renderView({
      dayRows: makeDayRows([
        {},
        {
          onToggle,
          onStartChange,
          onEndChange,
        },
      ]),
      onExceptionDateChange,
      onExceptionTypeChange,
      onExceptionStartChange,
      onExceptionEndChange,
      onExceptionReasonChange,
      onSaveException,
    });

    press(findByTestId(tree, 'employee-schedule-toggle-1'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    const startInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-start-1'),
      'TextInput',
    );
    changeText(startInput, '10:00');
    expect(onStartChange).toHaveBeenCalledWith('10:00');

    const endInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-end-1'),
      'TextInput',
    );
    changeText(endInput, '19:00');
    expect(onEndChange).toHaveBeenCalledWith('19:00');

    const dateInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-exception-date'),
      'TextInput',
    );
    changeText(dateInput, '2026-07-21');
    expect(onExceptionDateChange).toHaveBeenCalledWith('2026-07-21');

    press(findByTestId(tree, 'employee-schedule-exception-full-day'));
    expect(onExceptionTypeChange).toHaveBeenCalledWith('FULL_DAY_OFF');

    const exceptionStartInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-exception-start'),
      'TextInput',
    );
    changeText(exceptionStartInput, '11:00');
    expect(onExceptionStartChange).toHaveBeenCalledWith('11:00');

    const exceptionEndInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-exception-end'),
      'TextInput',
    );
    changeText(exceptionEndInput, '15:00');
    expect(onExceptionEndChange).toHaveBeenCalledWith('15:00');

    const reasonInput = findByDisplayName(
      findByTestId(tree, 'employee-schedule-exception-reason'),
      'TextInput',
    );
    changeText(reasonInput, 'Horario especial');
    expect(onExceptionReasonChange).toHaveBeenCalledWith('Horario especial');

    press(findByTestId(tree, 'employee-schedule-save-exception'));
    expect(onSaveException).toHaveBeenCalledTimes(1);
  });

  it('renders a read-only barber view without owner mutation actions', () => {
    const onBack = vi.fn();
    const tree = renderView({
      context: BARBER_CONTEXT,
      isOwner: false,
      isReadOnly: true,
      onBack,
    });

    expect(findByText(tree, 'Read-only schedule')).toBeDefined();
    expect(queryByTestId(tree, 'employee-schedule-save')).toBeNull();
    expect(queryByTestId(tree, 'employee-schedule-copy-barbershop')).toBeNull();
    expect(queryByTestId(tree, 'employee-schedule-save-exception')).toBeNull();
    expect(queryByTestId(tree, 'employee-schedule-delete-exception-2026-07-18')).toBeNull();

    pressButton(tree, 'employee-schedule-back');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows validation and saving states without leaking raw enums', () => {
    const tree = renderView({
      saving: true,
      saveError: 'Close time must be after start time.',
      exceptionError: 'Enter a valid date.',
      dayRows: makeDayRows([
        {},
        { error: 'End time must be after start time.' },
      ]),
    });

    expect(findByText(tree, 'End time must be after start time.')).toBeDefined();
    expect(findByText(tree, 'Close time must be after start time.')).toBeDefined();
    expect(findByText(tree, 'Enter a valid date.')).toBeDefined();
    expect(findByText(tree, 'Saving…')).toBeDefined();
    expect(() => findByText(tree, 'EMPLOYEE_TIME_OFF')).toThrow();
  });
});
