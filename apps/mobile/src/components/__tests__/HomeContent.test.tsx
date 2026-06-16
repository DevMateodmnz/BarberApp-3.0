import { describe, it, expect, vi } from 'vitest';

import { HomeContent } from '@/components/HomeContent.js';
import { findByTestId, findByText, press, queryByTestId, queryByText } from '@/testing/elementTree.js';
import { formatRecordTime } from '@/lib/format.js';
import type { BarbershopDailySummary, EmployeeDailySummary, ServiceRecord } from '@/lib/types.js';

const today = new Date().toISOString().slice(0, 10);

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
    selectedDate: today,
    flashMessage: null,
    canRecordService: true,
    onRecordService: vi.fn(),
    onServices: vi.fn(),
    onEmployees: vi.fn(),
    onWorkingHours: vi.fn(),
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
    expect(findByTestId(tree, 'home-barbershop-name')).toBeDefined();
    expect(findByText(tree, 'Main St Barber')).toBeDefined();
  });

  it('renders the employee name for a barber context', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT });
    expect(findByTestId(tree, 'home-employee-name')).toBeDefined();
    expect(findByText(tree, 'Carlos')).toBeDefined();
  });

  it('renders the no-context hint when a role has no barbershop', () => {
    const tree = renderHomeContent({
      context: { ...OWNER_CONTEXT, barbershopId: null, barbershopName: null },
      canRecordService: false,
    });
    expect(findByTestId(tree, 'home-no-context')).toBeDefined();
    expect(findByText(tree, 'No barbershop assigned yet.')).toBeDefined();
  });

  it('renders owner action cards and navigation buttons', () => {
    const onServices = vi.fn();
    const tree = renderHomeContent({ onServices });
    expect(findByTestId(tree, 'home-record-service-card')).toBeDefined();
    expect(findByTestId(tree, 'home-services-card')).toBeDefined();
    expect(findByTestId(tree, 'home-employees-card')).toBeDefined();
    expect(findByTestId(tree, 'home-working-hours-card')).toBeDefined();
    expect(findByTestId(tree, 'home-appointments-card')).toBeDefined();
    press(findByTestId(tree, 'home-services-button'));
    expect(onServices).toHaveBeenCalledTimes(1);
  });

  it('renders barber-only action cards', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT });
    expect(findByTestId(tree, 'home-record-service-card')).toBeDefined();
    expect(findByTestId(tree, 'home-appointments-card')).toBeDefined();
    expect(queryByTestId(tree, 'home-services-card')).toBeNull();
    expect(queryByTestId(tree, 'home-employees-card')).toBeNull();
    expect(queryByTestId(tree, 'home-working-hours-card')).toBeNull();
  });

  it('hides action cards when record service is not allowed', () => {
    const tree = renderHomeContent({ canRecordService: false });
    expect(queryByTestId(tree, 'home-record-service-card')).toBeNull();
  });

  it('renders the client message and no action cards', () => {
    const tree = renderHomeContent({ context: CLIENT_CONTEXT, canRecordService: false });
    expect(findByTestId(tree, 'home-client-message')).toBeDefined();
    expect(findByText(tree, 'Coming soon for clients.')).toBeDefined();
    expect(queryByTestId(tree, 'date-controls')).toBeNull();
  });

  it('renders date controls and triggers navigation callbacks', () => {
    const onPrevDate = vi.fn();
    const onNextDate = vi.fn();
    const onToday = vi.fn();
    const tree = renderHomeContent({ onPrevDate, onNextDate, onToday });
    expect(findByTestId(tree, 'date-controls')).toBeDefined();
    expect(findByTestId(tree, 'date-prev')).toBeDefined();
    expect(findByTestId(tree, 'date-today')).toBeDefined();
    expect(findByTestId(tree, 'date-display')).toBeDefined();
    expect(findByTestId(tree, 'date-next')).toBeDefined();
    expect(findByText(tree, today)).toBeDefined();
    press(findByTestId(tree, 'date-prev'));
    expect(onPrevDate).toHaveBeenCalledTimes(1);
    press(findByTestId(tree, 'date-next'));
    expect(onNextDate).toHaveBeenCalledTimes(1);
    press(findByTestId(tree, 'date-today'));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('renders a summary loading state', () => {
    const tree = renderHomeContent({ isSummaryLoading: true, summary: null });
    expect(findByText(tree, 'Loading summary…')).toBeDefined();
  });

  it('renders a summary error state', () => {
    const tree = renderHomeContent({ summaryError: 'Summary failed' });
    expect(findByTestId(tree, 'home-summary-error')).toBeDefined();
    expect(findByText(tree, 'Summary failed')).toBeDefined();
  });

  it('renders the owner summary card', () => {
    const tree = renderHomeContent({ context: OWNER_CONTEXT, summary: OWNER_SUMMARY });
    expect(findByTestId(tree, 'home-owner-summary')).toBeDefined();
    expect(findByText(tree, 'Daily Summary — Today')).toBeDefined();
  });

  it('renders the barber summary card', () => {
    const tree = renderHomeContent({ context: BARBER_CONTEXT, summary: BARBER_SUMMARY });
    expect(findByTestId(tree, 'home-barber-summary')).toBeDefined();
    expect(findByText(tree, 'Daily Summary — Today')).toBeDefined();
  });

  it('renders a records loading state', () => {
    const tree = renderHomeContent({ isRecordsLoading: true, records: [] });
    expect(findByText(tree, 'Loading records…')).toBeDefined();
  });

  it('renders a records error state', () => {
    const tree = renderHomeContent({ recordsError: 'Records failed' });
    expect(findByTestId(tree, 'home-records-error')).toBeDefined();
    expect(findByText(tree, 'Records failed')).toBeDefined();
  });

  it('renders an empty records state', () => {
    const tree = renderHomeContent({ records: [] });
    expect(findByTestId(tree, 'home-records-empty')).toBeDefined();
  });

  it('renders service record cards with full details for owners', () => {
    const tree = renderHomeContent({ context: OWNER_CONTEXT, records: [RECORD] });
    expect(findByTestId(tree, 'home-records-section')).toBeDefined();
    const recordCard = findByTestId(tree, 'record-rec-1');
    expect(recordCard).toBeDefined();
    expect(findByText(recordCard, 'Haircut')).toBeDefined();
    expect(findByText(recordCard, '$30.00')).toBeDefined();
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
    const tree = renderHomeContent({ context: BARBER_CONTEXT, records: [RECORD] });
    expect(findByTestId(tree, 'record-rec-1')).toBeDefined();
    const recordCard = findByTestId(tree, 'record-rec-1');
    expect(queryByText(recordCard, 'Carlos')).toBeNull();
  });

  it('renders the flash message banner', () => {
    const tree = renderHomeContent({ flashMessage: 'Saved successfully' });
    expect(findByTestId(tree, 'home-flash-message')).toBeDefined();
    expect(findByText(tree, 'Saved successfully')).toBeDefined();
  });
});
