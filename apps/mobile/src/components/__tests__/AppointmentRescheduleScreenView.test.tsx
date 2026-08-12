import { describe, expect, it, vi } from 'vitest';

import { AppointmentRescheduleScreenView } from '@/components/AppointmentRescheduleScreenView.js';
import type { Appointment, AppointmentChange } from '@/lib/types.js';
import { findByTestId, findByText, press } from '@/testing/elementTree.js';

const CONTEXT = {
  userId: 'owner-1',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    barbershopId: 'shop-1',
    employeeId: 'emp-1',
    clientId: null,
    customerId: 'cust-1',
    serviceId: 'svc-1',
    clientName: 'Juan Pérez',
    clientPhone: '+543811234567',
    clientEmail: 'juan@example.com',
    serviceName: 'Classic Cut',
    servicePriceCents: 3200,
    serviceDurationMinutes: 30,
    serviceCurrency: 'ARS',
    startAt: '2026-07-22T13:00:00.000Z',
    endAt: '2026-07-22T13:30:00.000Z',
    status: 'CONFIRMED',
    notes: null,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    deletedAt: null,
    notifications: [],
    changes: [],
    barbershop: { id: 'shop-1', name: 'Main St Barber' },
    employee: { id: 'emp-1', user: { id: 'user-1', name: 'Carlos' } },
    client: null,
    service: { id: 'svc-1', name: 'Classic Cut', durationMinutes: 30, priceCents: 3200, currency: 'ARS' },
    ...overrides,
  };
}

function makeChange(overrides: Partial<AppointmentChange> = {}): AppointmentChange {
  return {
    id: 'change-1',
    type: 'RESCHEDULED',
    changedByDisplayName: 'Owner Reschedule',
    changedByRole: 'OWNER',
    previousEmployeeName: 'Carlos',
    previousServiceName: 'Classic Cut',
    previousStartAt: '2026-07-22T13:00:00.000Z',
    previousEndAt: '2026-07-22T13:30:00.000Z',
    newEmployeeName: 'María',
    newServiceName: 'Premium Cut',
    newStartAt: '2026-07-23T15:00:00.000Z',
    newEndAt: '2026-07-23T15:45:00.000Z',
    reason: 'Cliente pidió otro horario',
    createdAt: '2026-07-20T14:00:00.000Z',
    ...overrides,
  };
}

function renderView(overrides: Partial<Parameters<typeof AppointmentRescheduleScreenView>[0]> = {}) {
  return AppointmentRescheduleScreenView({
    context: CONTEXT,
    appointment: makeAppointment(),
    isLoading: false,
    employeesStatus: 'success',
    servicesStatus: 'success',
    availabilityStatus: 'success',
    employeesError: null,
    servicesError: null,
    availabilityError: null,
    employeeOptions: [
      { id: 'emp-1', label: 'Carlos', selected: true, testID: 'employee-carlos', onPress: vi.fn() },
      { id: 'emp-2', label: 'María', selected: false, testID: 'employee-maria', onPress: vi.fn() },
    ],
    serviceOptions: [
      { id: 'svc-1', label: 'Classic Cut', detail: '30 min · $3200', selected: true, testID: 'service-classic', onPress: vi.fn() },
    ],
    slotOptions: [
      { id: 'slot-1', label: '10:00', selected: true, testID: 'slot-10', onPress: vi.fn() },
    ],
    selectedDate: '2026-07-23',
    reason: 'Cliente pidió otro horario',
    changes: [makeChange()],
    submissionError: null,
    isSubmitting: false,
    beforeSummary: [
      { label: 'Barber', value: 'Carlos' },
      { label: 'Service', value: 'Classic Cut' },
    ],
    afterSummary: [
      { label: 'Barber', value: 'María' },
      { label: 'Service', value: 'Premium Cut' },
    ],
    onBack: vi.fn(),
    onSelectPreviousDate: vi.fn(),
    onSelectToday: vi.fn(),
    onSelectNextDate: vi.fn(),
    onReasonChange: vi.fn(),
    onRetryEmployees: vi.fn(),
    onRetryServices: vi.fn(),
    onRetryAvailability: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  });
}

describe('AppointmentRescheduleScreenView', () => {
  it('renders the current appointment, confirmation summary, and history', () => {
    const tree = renderView();

    expect(findByTestId(tree, 'appointment-reschedule-current')).toBeDefined();
    expect(findByText(tree, 'Juan Pérez')).toBeDefined();
    expect(findByText(tree, 'Previous schedule')).toBeDefined();
    expect(findByText(tree, 'New schedule')).toBeDefined();
    expect(findByTestId(tree, 'appointment-reschedule-history')).toBeDefined();
    expect(findByText(tree, 'Appointment rescheduled')).toBeDefined();
  });

  it('fires the submit callback', () => {
    const onSubmit = vi.fn();
    const tree = renderView({ onSubmit });

    press(findByTestId(tree, 'appointment-reschedule-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders a missing state when the appointment cannot be resolved', () => {
    const tree = renderView({ appointment: null, isLoading: false, changes: [], afterSummary: null });

    expect(findByTestId(tree, 'appointment-reschedule-missing')).toBeDefined();
  });
});
