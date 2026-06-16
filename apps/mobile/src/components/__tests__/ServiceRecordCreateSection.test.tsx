import { describe, it, expect, vi } from 'vitest';

import {
  ServiceRecordCreateSectionView,
} from '@/components/ServiceRecordCreateSection.js';
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
import type { EmployeeListItem, PaymentMethod, Service } from '@/lib/types.js';

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

const EMPLOYEES: EmployeeListItem[] = [
  {
    id: 'emp-1',
    barbershopId: 'shop-1',
    userId: 'user-1',
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    user: { id: 'user-1', email: 'carlos@example.com', name: 'Carlos', role: 'BARBER' },
  },
  {
    id: 'emp-2',
    barbershopId: 'shop-1',
    userId: 'user-2',
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    user: { id: 'user-2', email: 'ana@example.com', name: null, role: 'BARBER' },
  },
];

const SERVICES: Service[] = [
  {
    id: 'svc-1',
    name: 'Classic Cut',
    description: null,
    durationMinutes: 30,
    priceCents: 300000,
    currency: 'ARS',
    isActive: true,
  },
  {
    id: 'svc-2',
    name: 'Beard Trim',
    description: null,
    durationMinutes: 15,
    priceCents: 150000,
    currency: 'ARS',
    isActive: true,
  },
];

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

function renderView(
  overrides: Partial<Parameters<typeof ServiceRecordCreateSectionView>[0]> = {},
) {
  return ServiceRecordCreateSectionView({
    testID: 'owner-service-record-create',
    mode: 'OWNER',
    barbershopId: 'shop-1',
    employees: EMPLOYEES,
    services: SERVICES,
    isEmployeesLoading: false,
    isServicesLoading: false,
    selectedEmployeeId: null,
    selectedServiceId: null,
    selectedPaymentMethod: null,
    selectedService: null,
    priceDiffersFromDefault: false,
    clientNameInput: '',
    notesInput: '',
    priceCentsInput: '',
    formError: null,
    formSuccess: null,
    isSubmitting: false,
    helpText: 'Choose an employee, then choose one of their assigned services.',
    servicesEmptyText: 'No assigned active services found for this employee.',
    onEmployeeSelect: vi.fn(),
    onServiceSelect: vi.fn(),
    onPaymentMethodSelect: vi.fn(),
    onClientNameChange: vi.fn(),
    onNotesChange: vi.fn(),
    onPriceChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  });
}

describe('ServiceRecordCreateSectionView', () => {
  it('renders the owner root testID and help text', () => {
    const tree = renderView();
    expect(findByTestId(tree, 'owner-service-record-create')).toBeDefined();
    expect(
      findByText(tree, 'Choose an employee, then choose one of their assigned services.'),
    ).toBeDefined();
  });

  it('renders the barber root testID and help text', () => {
    const tree = renderView({
      testID: 'barber-service-record-create',
      mode: 'BARBER',
      employees: [],
      helpText: 'Choose one of your assigned services.',
    });
    expect(findByTestId(tree, 'barber-service-record-create')).toBeDefined();
    expect(findByText(tree, 'Choose one of your assigned services.')).toBeDefined();
  });

  it('renders employee options for owner', () => {
    const tree = renderView();
    expect(findByTestId(tree, 'employee-option-emp-1')).toBeDefined();
    expect(findByTestId(tree, 'employee-option-emp-2')).toBeDefined();
    expect(findByText(tree, 'Carlos')).toBeDefined();
    expect(findByText(tree, 'ana@example.com')).toBeDefined();
  });

  it('calls onEmployeeSelect when an employee option is pressed', () => {
    const onEmployeeSelect = vi.fn();
    const tree = renderView({ onEmployeeSelect });
    pressButton(tree, 'employee-option-emp-1');
    expect(onEmployeeSelect).toHaveBeenCalledTimes(1);
    expect(onEmployeeSelect).toHaveBeenCalledWith('emp-1');
  });

  it('does not render employee selection for barber', () => {
    const tree = renderView({
      mode: 'BARBER',
      testID: 'barber-service-record-create',
      employees: [],
    });
    expect(queryByTestId(tree, 'employee-option-emp-1')).toBeNull();
  });

  it('renders service options when an employee is selected', () => {
    const tree = renderView({ selectedEmployeeId: 'emp-1' });
    expect(findByTestId(tree, 'service-option-svc-1')).toBeDefined();
    expect(findByTestId(tree, 'service-option-svc-2')).toBeDefined();
    expect(findByText(tree, 'Classic Cut')).toBeDefined();
    expect(findByText(tree, 'Beard Trim')).toBeDefined();
  });

  it('calls onServiceSelect when a service option is pressed', () => {
    const onServiceSelect = vi.fn();
    const tree = renderView({ selectedEmployeeId: 'emp-1', onServiceSelect });
    pressButton(tree, 'service-option-svc-1');
    expect(onServiceSelect).toHaveBeenCalledTimes(1);
    expect(onServiceSelect).toHaveBeenCalledWith(SERVICES[0]);
  });

  it('renders the empty service message when no services are available', () => {
    const tree = renderView({
      selectedEmployeeId: 'emp-1',
      services: [],
      servicesEmptyText: 'No assigned active services found for this employee.',
    });
    expect(
      findByText(tree, 'No assigned active services found for this employee.'),
    ).toBeDefined();
  });

  it('renders selected service context with default price and duration', () => {
    const tree = renderView({ selectedService: SERVICES[0]! });
    const context = findByTestId(tree, 'service-record-selected-context');
    expect(context).toBeDefined();
    expect(findByText(context, 'Classic Cut')).toBeDefined();
    expect(findByText(context, '$3000.00')).toBeDefined();
    expect(findByText(context, '30 min')).toBeDefined();
  });

  it('renders the price diff hint when the price differs from the default', () => {
    const tree = renderView({
      selectedService: SERVICES[0]!,
      priceDiffersFromDefault: true,
    });
    expect(findByTestId(tree, 'service-record-price-diff')).toBeDefined();
    expect(findByText(tree, 'Price differs from the service default.')).toBeDefined();
  });

  it('does not render the price diff hint when the price matches the default', () => {
    const tree = renderView({
      selectedService: SERVICES[0]!,
      priceDiffersFromDefault: false,
    });
    expect(queryByTestId(tree, 'service-record-price-diff')).toBeNull();
  });

  it('renders the price input and calls onPriceChange', () => {
    const onPriceChange = vi.fn();
    const tree = renderView({ priceCentsInput: '2500', onPriceChange });
    const inputWrapper = findByTestId(tree, 'service-record-price-cents');
    expect(inputWrapper).toBeDefined();
    const input = findByDisplayName(inputWrapper, 'TextInput');
    expect((input as { props: { value: string } }).props.value).toBe('2500');
    changeText(input, '3000');
    expect(onPriceChange).toHaveBeenCalledTimes(1);
    expect(onPriceChange).toHaveBeenCalledWith('3000');
  });

  it('renders payment method options and calls onPaymentMethodSelect', () => {
    const onPaymentMethodSelect = vi.fn();
    const tree = renderView({ onPaymentMethodSelect });
    expect(findByTestId(tree, 'payment-method-unspecified')).toBeDefined();
    for (const method of PAYMENT_METHODS) {
      expect(findByTestId(tree, `payment-method-${method.toLowerCase()}`)).toBeDefined();
    }
    pressButton(tree, 'payment-method-card');
    expect(onPaymentMethodSelect).toHaveBeenCalledTimes(1);
    expect(onPaymentMethodSelect).toHaveBeenCalledWith('CARD');
  });

  it('selects unspecified payment method when the unspecified option is pressed', () => {
    const onPaymentMethodSelect = vi.fn();
    const tree = renderView({
      selectedPaymentMethod: 'CASH',
      onPaymentMethodSelect,
    });
    pressButton(tree, 'payment-method-unspecified');
    expect(onPaymentMethodSelect).toHaveBeenCalledWith(null);
  });

  it('renders client name input and calls onClientNameChange', () => {
    const onClientNameChange = vi.fn();
    const tree = renderView({ clientNameInput: 'Jane', onClientNameChange });
    const inputWrapper = findByTestId(tree, 'service-record-client-name');
    expect(inputWrapper).toBeDefined();
    const input = findByDisplayName(inputWrapper, 'TextInput');
    expect((input as { props: { value: string } }).props.value).toBe('Jane');
    changeText(input, 'John');
    expect(onClientNameChange).toHaveBeenCalledWith('John');
  });

  it('renders notes input and calls onNotesChange', () => {
    const onNotesChange = vi.fn();
    const tree = renderView({ notesInput: 'VIP', onNotesChange });
    const inputWrapper = findByTestId(tree, 'service-record-notes');
    expect(inputWrapper).toBeDefined();
    const input = findByDisplayName(inputWrapper, 'TextInput');
    expect((input as { props: { value: string } }).props.value).toBe('VIP');
    changeText(input, 'Regular');
    expect(onNotesChange).toHaveBeenCalledWith('Regular');
  });

  it('renders the submit button and calls onSubmit', () => {
    const onSubmit = vi.fn();
    const tree = renderView({ onSubmit });
    pressButton(tree, 'service-record-submit');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submit while services are loading', () => {
    const onSubmit = vi.fn();
    const tree = renderView({ isServicesLoading: true, onSubmit });
    pressButton(tree, 'service-record-submit');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit while employees are loading', () => {
    const onSubmit = vi.fn();
    const tree = renderView({ isEmployeesLoading: true, onSubmit });
    pressButton(tree, 'service-record-submit');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit while submitting', () => {
    const onSubmit = vi.fn();
    const tree = renderView({ isSubmitting: true, onSubmit });
    pressButton(tree, 'service-record-submit');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders form error and success messages', () => {
    const tree = renderView({
      formError: 'Select a service.',
      formSuccess: 'Saved.',
    });
    expect(findByTestId(tree, 'service-record-error')).toBeDefined();
    expect(findByText(tree, 'Select a service.')).toBeDefined();
    expect(findByTestId(tree, 'service-record-success')).toBeDefined();
    expect(findByText(tree, 'Saved.')).toBeDefined();
  });

  it('shows loading indicators for employees and services', () => {
    const tree = renderView({
      isEmployeesLoading: true,
      isServicesLoading: true,
      selectedEmployeeId: 'emp-1',
    });
    expect(findByDisplayName(tree, 'ActivityIndicator')).toBeDefined();
    expect(findByText(tree, 'Loading employees…')).toBeDefined();
    expect(findByText(tree, 'Loading assigned services…')).toBeDefined();
  });
});
