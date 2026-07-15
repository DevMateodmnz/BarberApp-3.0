import { describe, expect, it, vi } from 'vitest';

import { CustomerDetailScreenView } from '@/components/CustomerDetailScreenView.js';
import type { CustomerDetail } from '@/lib/types.js';
import {
  changeText,
  findByDisplayName,
  findByTestId,
  findByText,
  press,
} from '@/testing/elementTree.js';

function makeDetail(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: 'cust-1',
    name: 'Juan Pérez',
    phone: '+54 381 555 1111',
    email: 'juan@example.com',
    internalNotes: 'Prefers morning appointments',
    firstSeenAt: '2026-07-01T10:00:00.000Z',
    lastSeenAt: '2026-07-10T10:00:00.000Z',
    completedCount: 3,
    cancelledCount: 1,
    noShowCount: 2,
    upcomingCount: 1,
    lastServiceName: 'Classic Cut',
    lastEmployeeName: 'Carlos',
    recentAppointments: [
      {
        id: 'appt-past-1',
        startAt: '2026-07-10T10:00:00.000Z',
        endAt: '2026-07-10T10:30:00.000Z',
        status: 'COMPLETED',
        serviceName: 'Classic Cut',
        employeeName: 'Carlos',
        confirmedAt: '2026-07-09T10:00:00.000Z',
        startedAt: '2026-07-10T10:00:00.000Z',
        completedAt: '2026-07-10T10:30:00.000Z',
        cancelledAt: null,
        noShowAt: null,
        cancellationSource: null,
      },
    ],
    upcomingAppointments: [
      {
        id: 'appt-next-1',
        startAt: '2026-07-20T10:00:00.000Z',
        endAt: '2026-07-20T10:30:00.000Z',
        status: 'CONFIRMED',
        serviceName: 'Beard Trim',
        employeeName: 'Ana',
      },
    ],
    ...overrides,
  };
}

function renderView(
  overrides: Partial<Parameters<typeof CustomerDetailScreenView>[0]> = {}
) {
  return CustomerDetailScreenView({
    detail: makeDetail(),
    isLoading: false,
    isSaving: false,
    error: null,
    nameInput: 'Juan Pérez',
    emailInput: 'juan@example.com',
    notesInput: 'Prefers morning appointments',
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onNotesChange: vi.fn(),
    onSave: vi.fn(),
    onCreateAppointment: vi.fn(),
    ...overrides,
  });
}

describe('CustomerDetailScreenView', () => {
  it('renders loading and error states without detail data', () => {
    const loadingTree = renderView({ detail: null, isLoading: true });
    expect(findByTestId(loadingTree, 'customer-detail-loading')).toBeDefined();
    expect(findByText(loadingTree, 'Loading customer profile…')).toBeDefined();

    const onRetry = vi.fn();
    const errorTree = renderView({
      detail: null,
      isLoading: false,
      error: 'Lookup failed',
      onRetry,
    });
    expect(findByTestId(errorTree, 'customer-detail-error')).toBeDefined();
    press(findByTestId(errorTree, 'customer-detail-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders detail content and edit controls', () => {
    const onNameChange = vi.fn();
    const onEmailChange = vi.fn();
    const onNotesChange = vi.fn();
    const onSave = vi.fn();
    const onCreateAppointment = vi.fn();
    const tree = renderView({
      onNameChange,
      onEmailChange,
      onNotesChange,
      onSave,
      onCreateAppointment,
    });

    expect(findByTestId(tree, 'customer-detail-summary')).toBeDefined();
    expect(findByText(tree, 'Juan Pérez')).toBeDefined();
    expect(findByText(tree, '+54 381 555 1111')).toBeDefined();
    expect(findByText(tree, 'Classic Cut')).toBeDefined();
    expect(findByText(tree, 'Beard Trim')).toBeDefined();

    changeText(
      findByDisplayName(findByTestId(tree, 'customer-detail-name-input'), 'TextInput'),
      'Juan Updated'
    );
    changeText(
      findByDisplayName(findByTestId(tree, 'customer-detail-email-input'), 'TextInput'),
      'updated@example.com'
    );
    changeText(
      findByDisplayName(findByTestId(tree, 'customer-detail-notes-input'), 'TextInput'),
      'VIP client'
    );
    press(findByTestId(tree, 'customer-detail-save'));
    press(findByTestId(tree, 'customer-detail-create-appointment'));

    expect(onNameChange).toHaveBeenCalledWith('Juan Updated');
    expect(onEmailChange).toHaveBeenCalledWith('updated@example.com');
    expect(onNotesChange).toHaveBeenCalledWith('VIP client');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCreateAppointment).toHaveBeenCalledTimes(1);
  });
});
