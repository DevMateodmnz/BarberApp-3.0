import { describe, expect, it, vi } from 'vitest';

import { HomeContent } from '@/components/HomeContent.js';
import { formatBusinessDateLabel, formatCentsForDisplay, formatRecordTime, getTodayDateString } from '@/lib/format.js';
import type { BarbershopDailySummary, EmployeeDailySummary, ServiceRecord } from '@/lib/types.js';
import { findByTestId, findByText, press, queryByTestId, queryByText } from '@/testing/elementTree.js';

const today = getTodayDateString();

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

const OWNER_SUMMARY: BarbershopDailySummary = {
  date: today,
  totalRecords: 5,
  totalRevenueCents: 15000,
  byEmployee: [
    { employeeId: 'emp-1', employeeName: 'Carlos', recordsCount: 3, revenueCents: 9000 },
  ],
  byPaymentMethod: [
    { paymentMethod: 'CASH', recordsCount: 3, revenueCents: 9000 },
  ],
};

const BARBER_SUMMARY: EmployeeDailySummary = {
  date: today,
  employeeId: 'emp-1',
  employeeName: 'Carlos',
  totalRecords: 3,
  totalRevenueCents: 9000,
  byPaymentMethod: [
    { paymentMethod: 'CASH', recordsCount: 3, revenueCents: 9000 },
  ],
};

const RECORD: ServiceRecord = {
  id: 'rec-1',
  barbershopId: 'shop-1',
  employeeId: 'emp-1',
  serviceId: 'svc-1',
  appointmentId: null,
  clientName: 'Juan',
  priceCents: 3000,
  paymentMethod: 'CASH',
  notes: 'Fade and beard trim',
  performedAt: '2026-06-08T14:30:00.000Z',
  createdAt: '2026-06-08T14:30:00.000Z',
  updatedAt: '2026-06-08T14:30:00.000Z',
  deletedAt: null,
  service: { id: 'svc-1', name: 'Haircut' },
  employee: {
    id: 'emp-1',
    user: { id: 'u-barber', name: 'Carlos' },
  },
};

function renderHomeContent(overrides: Partial<Parameters<typeof HomeContent>[0]> = {}) {
  return HomeContent({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    contextError: null,
    summary: OWNER_SUMMARY,
    isSummaryLoading: false,
    summaryError: null,
    records: [RECORD],
    isRecordsLoading: false,
    recordsError: null,
    summaryPeriod: 'today',
    summaryPeriodLabel: 'Today',
    onSummaryPeriodChange: vi.fn(),
    ownerEmployeeFilters: [],
    hasLoadedOwnerEmployeeFilters: false,
    isOwnerEmployeeFiltersLoading: false,
    ownerEmployeeFiltersError: null,
    onRetryOwnerEmployeeFilters: vi.fn(),
    selectedDate: today,
    flashMessage: null,
    canRecordService: true,
    onRecordService: vi.fn(),
    onAppointments: vi.fn(),
    onPrevDate: vi.fn(),
    onNextDate: vi.fn(),
    onToday: vi.fn(),
    ...overrides,
  });
}

describe('HomeContent', () => {
  it('renders a loading state while context is loading', () => {
    const tree = renderHomeContent({ context: null, isContextLoading: true });
    expect(findByTestId(tree, 'home-loading')).toBeDefined();
    expect(findByText(tree, 'Loading your context…')).toBeDefined();
  });

  it('renders a context error message', () => {
    const tree = renderHomeContent({ context: null, contextError: 'Context failed' });
    expect(findByTestId(tree, 'home-error')).toBeDefined();
    expect(findByText(tree, 'Context failed')).toBeDefined();
  });

  it('renders the context card with role badge and barbershop details', () => {
    const tree = renderHomeContent({ context: OWNER_CONTEXT });
    expect(findByTestId(tree, 'home-context')).toBeDefined();
    expect(findByText(tree, 'Owner')).toBeDefined();
    expect(findByText(tree, 'Main St Barber')).toBeDefined();
  });

  it('renders the employee name for a barber context', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT, summary: BARBER_SUMMARY });
    expect(findByTestId(tree, 'home-employee-name')).toBeDefined();
    expect(findByText(tree, 'Carlos')).toBeDefined();
  });

  it('renders the no-context hint when a role has no barbershop', () => {
    const tree = renderHomeContent({
      context: { ...OWNER_CONTEXT, barbershopId: null, barbershopName: null },
      canRecordService: false,
      summary: null,
    });
    expect(findByTestId(tree, 'home-no-context')).toBeDefined();
    expect(findByText(tree, 'No barbershop is linked to your account yet.')).toBeDefined();
  });

  it('renders compact daily actions and removes owner management cards from Home', () => {
    const onRecordService = vi.fn();
    const onAppointments = vi.fn();
    const tree = renderHomeContent({ onRecordService, onAppointments });

    expect(findByTestId(tree, 'home-daily-actions-section')).toBeDefined();
    press(findByTestId(tree, 'home-daily-action-record'));
    press(findByTestId(tree, 'home-daily-action-appointments'));

    expect(onRecordService).toHaveBeenCalledTimes(1);
    expect(onAppointments).toHaveBeenCalledTimes(1);
    expect(queryByTestId(tree, 'home-services-card')).toBeNull();
    expect(queryByTestId(tree, 'home-employees-card')).toBeNull();
    expect(queryByTestId(tree, 'home-working-hours-card')).toBeNull();
  });

  it('renders barber daily actions without owner management affordances', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT, summary: BARBER_SUMMARY });
    expect(findByTestId(tree, 'home-daily-action-record')).toBeDefined();
    expect(findByTestId(tree, 'home-daily-action-appointments')).toBeDefined();
    expect(queryByTestId(tree, 'home-services-card')).toBeNull();
    expect(queryByTestId(tree, 'home-employees-card')).toBeNull();
    expect(queryByTestId(tree, 'home-working-hours-card')).toBeNull();
  });

  it('hides the record daily action when record service is not allowed', () => {
    const tree = renderHomeContent({ canRecordService: false });
    expect(queryByTestId(tree, 'home-daily-action-record')).toBeNull();
    expect(findByTestId(tree, 'home-daily-action-appointments')).toBeDefined();
  });

  it('renders the client message and no daily dashboard sections', () => {
    const tree = renderHomeContent({
      context: CLIENT_CONTEXT,
      canRecordService: false,
      summary: null,
      records: [],
    });
    expect(findByTestId(tree, 'home-client-message')).toBeDefined();
    expect(findByText(tree, 'Coming soon for clients.')).toBeDefined();
    expect(queryByTestId(tree, 'home-daily-actions-section')).toBeNull();
    expect(queryByTestId(tree, 'home-revenue-section')).toBeNull();
  });

  it('renders date controls and triggers navigation callbacks', () => {
    const onPrevDate = vi.fn();
    const onNextDate = vi.fn();
    const onToday = vi.fn();
    const tree = renderHomeContent({ onPrevDate, onNextDate, onToday });
    expect(findByTestId(tree, 'date-controls')).toBeDefined();
    expect(findByText(tree, formatBusinessDateLabel(today))).toBeDefined();
    press(findByTestId(tree, 'date-prev'));
    press(findByTestId(tree, 'date-next'));
    press(findByTestId(tree, 'date-today'));
    expect(onPrevDate).toHaveBeenCalledTimes(1);
    expect(onNextDate).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('renders summary period controls and triggers period changes', () => {
    const onSummaryPeriodChange = vi.fn();
    const tree = renderHomeContent({ onSummaryPeriodChange, summaryPeriod: 'today' });
    expect(findByTestId(tree, 'summary-period-controls')).toBeDefined();
    press(findByTestId(tree, 'summary-period-week'));
    press(findByTestId(tree, 'summary-period-month'));
    expect(onSummaryPeriodChange).toHaveBeenCalledWith('week');
    expect(onSummaryPeriodChange).toHaveBeenCalledWith('month');
  });

  it('renders owner employee filter controls and triggers handlers', () => {
    const onAll = vi.fn();
    const onCarlos = vi.fn();
    const tree = renderHomeContent({
      context: OWNER_CONTEXT,
      ownerEmployeeFilters: [
        {
          id: 'all',
          label: 'All barbers',
          selected: true,
          testID: 'summary-employee-filter-all',
          onPress: onAll,
        },
        {
          id: 'emp-1',
          label: 'Carlos',
          selected: false,
          testID: 'summary-employee-filter-emp-1',
          onPress: onCarlos,
        },
      ],
      hasLoadedOwnerEmployeeFilters: true,
    });

    expect(findByTestId(tree, 'summary-employee-filter')).toBeDefined();
    press(findByTestId(tree, 'summary-employee-filter-all'));
    press(findByTestId(tree, 'summary-employee-filter-emp-1'));
    expect(onAll).toHaveBeenCalledTimes(1);
    expect(onCarlos).toHaveBeenCalledTimes(1);
  });

  it('does not render owner employee filters for barber context', () => {
    const tree = renderHomeContent({
      context: BARBER_CONTEXT,
      summary: BARBER_SUMMARY,
      ownerEmployeeFilters: [
        {
          id: 'all',
          label: 'All barbers',
          selected: true,
          testID: 'summary-employee-filter-all',
          onPress: vi.fn(),
        },
      ],
    });
    expect(queryByTestId(tree, 'summary-employee-filter')).toBeNull();
  });

  it('renders owner employee filter loading, error, retry, and empty states', () => {
    const onRetryOwnerEmployeeFilters = vi.fn();

    const loadingTree = renderHomeContent({
      context: OWNER_CONTEXT,
      isOwnerEmployeeFiltersLoading: true,
    });
    expect(findByTestId(loadingTree, 'summary-employee-filter-loading')).toBeDefined();

    const errorTree = renderHomeContent({
      context: OWNER_CONTEXT,
      ownerEmployeeFiltersError: 'Failed to load barbers.',
      onRetryOwnerEmployeeFilters,
    });
    expect(findByTestId(errorTree, 'summary-employee-filter-error')).toBeDefined();
    press(findByTestId(errorTree, 'summary-employee-filter-retry'));
    expect(onRetryOwnerEmployeeFilters).toHaveBeenCalledTimes(1);

    const emptyTree = renderHomeContent({
      context: OWNER_CONTEXT,
      hasLoadedOwnerEmployeeFilters: true,
      ownerEmployeeFilters: [],
    });
    expect(findByTestId(emptyTree, 'summary-employee-filter-empty')).toBeDefined();
  });

  it('renders revenue content for owners and barbers', () => {
    const ownerTree = renderHomeContent({ context: OWNER_CONTEXT, summary: OWNER_SUMMARY });
    expect(findByTestId(ownerTree, 'home-owner-summary')).toBeDefined();
    expect(findByTestId(ownerTree, 'home-revenue-section')).toBeDefined();

    const barberTree = renderHomeContent({ context: BARBER_CONTEXT, summary: BARBER_SUMMARY });
    expect(findByTestId(barberTree, 'home-barber-summary')).toBeDefined();
    expect(findByTestId(barberTree, 'home-revenue-section')).toBeDefined();
  });

  it('renders records loading, error, and empty states', () => {
    const loadingTree = renderHomeContent({ isRecordsLoading: true, records: [] });
    expect(findByText(loadingTree, 'Loading records…')).toBeDefined();

    const errorTree = renderHomeContent({ recordsError: 'Records failed' });
    expect(findByTestId(errorTree, 'home-records-error')).toBeDefined();
    expect(findByText(errorTree, 'Records failed')).toBeDefined();

    const emptyTree = renderHomeContent({ records: [] });
    expect(findByTestId(emptyTree, 'home-records-empty')).toBeDefined();
  });

  it('renders service record cards with full details for owners', () => {
    const tree = renderHomeContent({ context: OWNER_CONTEXT, records: [RECORD] });
    const recordCard = findByTestId(tree, 'record-rec-1');
    expect(findByText(recordCard, 'Haircut')).toBeDefined();
    expect(findByText(recordCard, formatCentsForDisplay(3000))).toBeDefined();
    expect(findByText(recordCard, 'Cash')).toBeDefined();
    const recordTime = formatRecordTime(RECORD.performedAt);
    if (recordTime) {
      expect(findByText(recordCard, recordTime)).toBeDefined();
    }
    expect(findByText(recordCard, 'Carlos')).toBeDefined();
    expect(findByText(recordCard, 'Client: Juan')).toBeDefined();
    expect(findByText(recordCard, 'Fade and beard trim')).toBeDefined();
  });

  it('hides barber names in the records list for barbers', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT, summary: BARBER_SUMMARY, records: [RECORD] });
    const recordCard = findByTestId(tree, 'record-rec-1');
    expect(queryByText(recordCard, 'Carlos')).toBeNull();
  });

  it('renders the flash message banner', () => {
    const tree = renderHomeContent({ flashMessage: 'Saved successfully' });
    expect(findByTestId(tree, 'home-flash-message')).toBeDefined();
    expect(findByText(tree, 'Saved successfully')).toBeDefined();
  });
});
