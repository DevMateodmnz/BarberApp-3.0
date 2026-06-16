import { describe, expect, it, vi } from 'vitest';

import {
  WorkingHoursScreenView,
  type WorkingHoursDayViewModel,
} from '@/components/WorkingHoursScreenView.js';
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

function makeDayRows(overrides: Partial<WorkingHoursDayViewModel>[] = []): WorkingHoursDayViewModel[] {
  const base: WorkingHoursDayViewModel[] = [
    {
      dayOfWeek: 0,
      dayName: 'Sunday',
      isActive: false,
      openTime: '',
      closeTime: '',
      error: null,
      onToggle: vi.fn(),
      onOpenTimeChange: vi.fn(),
      onCloseTimeChange: vi.fn(),
    },
    {
      dayOfWeek: 1,
      dayName: 'Monday',
      isActive: true,
      openTime: '09:00',
      closeTime: '18:00',
      error: null,
      onToggle: vi.fn(),
      onOpenTimeChange: vi.fn(),
      onCloseTimeChange: vi.fn(),
    },
  ];

  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function renderView(overrides: Partial<Parameters<typeof WorkingHoursScreenView>[0]> = {}) {
  return WorkingHoursScreenView({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    contextError: null,
    isOwner: true,
    isWorkingHoursLoading: false,
    workingHoursError: null,
    saveError: null,
    saving: false,
    dayRows: makeDayRows(),
    onRefresh: vi.fn(),
    onSave: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  });
}

describe('WorkingHoursScreenView', () => {
  it('renders the loading state', () => {
    const tree = renderView({ context: null, isContextLoading: true, dayRows: [] });
    expect(findByTestId(tree, 'loading')).toBeDefined();
    expect(findByText(tree, 'Loading your context…')).toBeDefined();
  });

  it('renders the context error state', () => {
    const tree = renderView({ context: null, contextError: 'Context failed', dayRows: [] });
    expect(findByText(tree, 'Context failed')).toBeDefined();
  });

  it('renders the no-context state', () => {
    const tree = renderView({ context: null, dayRows: [] });
    expect(findByTestId(tree, 'working-hours-no-context')).toBeDefined();
    expect(findByText(tree, 'No context available yet.')).toBeDefined();
  });

  it('renders blocked barber and client states', () => {
    const barberTree = renderView({ context: BARBER_CONTEXT, isOwner: false, dayRows: [] });
    expect(findByTestId(barberTree, 'working-hours-blocked')).toBeDefined();
    expect(findByText(barberTree, 'Only barbershop owners can manage the weekly schedule.')).toBeDefined();

    const clientTree = renderView({ context: CLIENT_CONTEXT, isOwner: false, dayRows: [] });
    expect(findByTestId(clientTree, 'working-hours-blocked')).toBeDefined();
    expect(findByText(clientTree, 'Only barbershop owners can manage the weekly schedule.')).toBeDefined();
  });

  it('renders day rows with active and inactive states', () => {
    const tree = renderView();
    const sunday = findByTestId(tree, 'day-row-0');
    const monday = findByTestId(tree, 'day-row-1');

    expect(findByText(sunday, 'Sunday')).toBeDefined();
    expect(findByText(sunday, 'Inactive')).toBeDefined();
    expect(findByText(sunday, 'Closed')).toBeDefined();
    expect(findByText(sunday, 'Closed for this day.')).toBeDefined();

    expect(findByText(monday, 'Monday')).toBeDefined();
    expect(findByText(monday, 'Active')).toBeDefined();
    expect(findByText(monday, 'Open')).toBeDefined();
    expect(findByTestId(monday, 'day-open-1')).toBeDefined();
    expect(findByTestId(monday, 'day-close-1')).toBeDefined();
  });

  it('calls day toggle and time input callbacks', () => {
    const onToggle = vi.fn();
    const onOpenTimeChange = vi.fn();
    const onCloseTimeChange = vi.fn();
    const tree = renderView({
      dayRows: makeDayRows([
        {},
        { onToggle, onOpenTimeChange, onCloseTimeChange },
      ]),
    });

    press(findByTestId(tree, 'day-toggle-1'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    const openInput = findByDisplayName(findByTestId(tree, 'day-open-1'), 'TextInput');
    changeText(openInput, '10:00');
    expect(onOpenTimeChange).toHaveBeenCalledWith('10:00');

    const closeInput = findByDisplayName(findByTestId(tree, 'day-close-1'), 'TextInput');
    changeText(closeInput, '19:00');
    expect(onCloseTimeChange).toHaveBeenCalledWith('19:00');
  });

  it('renders field validation and save error messages', () => {
    const tree = renderView({
      saveError: 'Failed to save working hours',
      dayRows: makeDayRows([
        {},
        { error: 'Close time must be after open time' },
      ]),
    });

    expect(findByText(tree, 'Close time must be after open time')).toBeDefined();
    expect(findByText(tree, 'Failed to save working hours')).toBeDefined();
  });

  it('renders working-hours loading and error states for owners', () => {
    const loadingTree = renderView({ isWorkingHoursLoading: true, dayRows: [] });
    expect(findByText(loadingTree, 'Loading working hours…')).toBeDefined();

    const errorTree = renderView({ workingHoursError: 'Working hours failed', dayRows: [] });
    expect(findByTestId(errorTree, 'error')).toBeDefined();
    expect(findByText(errorTree, 'Working hours failed')).toBeDefined();
  });

  it('calls save and back callbacks', () => {
    const onSave = vi.fn();
    const onBack = vi.fn();
    const tree = renderView({ onSave, onBack });

    press(findByTestId(tree, 'save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);

    press(findByTestId(tree, 'working-hours-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables save while saving', () => {
    const onSave = vi.fn();
    const tree = renderView({ saving: true, onSave });
    pressButton(tree, 'save-button');
    expect(onSave).not.toHaveBeenCalled();
    expect(findByText(tree, 'Saving…')).toBeDefined();
  });

  it('does not render schedule editor when owner view is blocked or errored', () => {
    const blockedTree = renderView({ context: BARBER_CONTEXT, isOwner: false, dayRows: makeDayRows() });
    expect(queryByTestId(blockedTree, 'day-row-0')).toBeNull();

    const errorTree = renderView({ workingHoursError: 'Working hours failed', dayRows: makeDayRows() });
    expect(queryByTestId(errorTree, 'day-row-0')).toBeNull();
  });
});
