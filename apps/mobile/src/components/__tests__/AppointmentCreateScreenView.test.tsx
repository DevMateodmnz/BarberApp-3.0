import { describe, expect, it, vi } from 'vitest';

import {
  AppointmentCreateScreenView,
  buildAppointmentSummaryViewModel,
  buildAppointmentServiceDetail,
  type AppointmentBookingSummaryViewModel,
} from '@/components/AppointmentCreateScreenView.js';
import {
  findAll,
  findByTestId,
  findByText,
  getDisplayName,
  press,
} from '@/testing/elementTree.js';

const OWNER_CONTEXT = {
  userId: 'owner-1',
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: null,
  employeeName: null,
};

const BARBER_CONTEXT = {
  userId: 'barber-1',
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  barbershopName: 'Main St Barber',
  employeeId: 'emp-1',
  employeeName: 'Carlos',
};

function makeSummary(): AppointmentBookingSummaryViewModel {
  return buildAppointmentSummaryViewModel({
    clientName: 'Mateo',
    employeeName: 'Carlos',
    localDate: '2026-06-27',
    localStartTime: '09:30',
    localEndTime: '10:00',
    priceCents: 800000,
    currency: 'ARS',
    serviceName: 'Classic Haircut',
    durationMinutes: 30,
    t: (key, options) => {
      if (key === 'appointmentCreation.summary.timeRange') {
        return `${options?.start}–${options?.end}`;
      }

      if (key === 'services.durationLabel') {
        return `${options?.count} min`;
      }

      return key;
    },
  });
}

function renderView(overrides: Partial<Parameters<typeof AppointmentCreateScreenView>[0]> = {}) {
  return AppointmentCreateScreenView({
    context: OWNER_CONTEXT,
    isContextLoading: false,
    contextError: null,
    blockingTitle: null,
    blockingMessage: null,
    employeesStatus: 'success',
    employeesError: null,
    employeeOptions: [
      {
        id: 'emp-1',
        label: 'Carlos',
        selected: true,
        testID: 'appointment-create-employee-emp-1',
        accessibilityLabel: 'Select employee Carlos',
        onPress: vi.fn(),
      },
    ],
    servicesStatus: 'success',
    servicesError: null,
    serviceOptions: [
      {
        id: 'svc-1',
        label: 'Classic Haircut',
        detail: buildAppointmentServiceDetail({
          durationMinutes: 30,
          priceCents: 800000,
          currency: 'ARS',
          t: (key, options) => (key === 'services.durationLabel' ? `${options?.count} min` : key),
        }),
        selected: true,
        testID: 'appointment-create-service-svc-1',
        accessibilityLabel: 'Select service Classic Haircut',
        onPress: vi.fn(),
      },
    ],
    selectedEmployeeName: 'Carlos',
    selectedDate: '2026-06-27',
    canMoveToPreviousDate: true,
    isDateSectionEnabled: true,
    availabilityStatus: 'success',
    availabilityErrorKey: null,
    slotOptions: [
      {
        startAt: '2026-06-27T12:30:00.000Z',
        label: '09:30',
        selected: true,
        testID: 'appointment-create-slot-1',
        accessibilityLabel: 'Selected time 09:30',
        onPress: vi.fn(),
      },
    ],
    clientName: 'Mateo',
    clientPhone: '+54 381 555 1234',
    clientEmail: 'mateo@example.com',
    notes: 'Walk-in guest',
    promotionCode: '',
    promotionQuote: null,
    promotionMessage: null,
    isQuotingPromotion: false,
    customerWarning: null,
    fieldErrors: {},
    submissionErrorKey: null,
    summary: makeSummary(),
    isSubmitting: false,
    onBack: vi.fn(),
    onRetryEmployees: vi.fn(),
    onRetryServices: vi.fn(),
    onSelectToday: vi.fn(),
    onSelectPreviousDate: vi.fn(),
    onSelectNextDate: vi.fn(),
    onRetryAvailability: vi.fn(),
    onClientNameChange: vi.fn(),
    onClientPhoneChange: vi.fn(),
    onClientEmailChange: vi.fn(),
    onNotesChange: vi.fn(),
    onPromotionCodeChange: vi.fn(),
    onApplyPromotion: vi.fn(),
    onRemovePromotion: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  });
}

// Mirror the production pluralization rule for the warning copy so the
// assertion is robust to i18next upgrades. The test bootstrap sets the
// preference to English, so the resolved strings come from `en.ts`.
function expectedWarningBody(
  count: number,
  date: string | null,
): string {
  if (date) {
    return count === 1
      ? `This number has 1 prior no-show. The last one was on ${date}.`
      : `This number has ${count} prior no-shows. The last one was on ${date}.`;
  }
  return count === 1
    ? 'This number has 1 prior no-show.'
    : `This number has ${count} prior no-shows.`;
}

describe('AppointmentCreateScreenView', () => {
  it('renders the OWNER workflow with employee, service, slot, and summary sections', () => {
    const tree = renderView();

    expect(findByTestId(tree, 'appointment-create-employee-section')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-service-section')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-availability-section')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-summary-section')).toBeDefined();
    expect(findByText(tree, 'Classic Haircut')).toBeDefined();
    expect(findByText(tree, 'Carlos')).toBeDefined();
    expect(findByText(tree, 'Mateo')).toBeDefined();
  });

  it('renders BARBER mode without an employee selector and with read-only barber context', () => {
    const tree = renderView({
      context: BARBER_CONTEXT,
      employeeOptions: [],
      selectedEmployeeName: 'Carlos',
    });

    expect(findByText(tree, 'Assigned barber: Carlos')).toBeDefined();
    expect(() => findByTestId(tree, 'appointment-create-employee-section')).toThrow();
  });

  it('renders blocking copy when the barber is missing employee context', () => {
    const tree = renderView({
      context: {
        ...BARBER_CONTEXT,
        employeeId: null,
        employeeName: null,
      },
      blockingTitle: 'No barber profile available',
      blockingMessage: 'No employee context is linked to your account yet.',
      employeeOptions: [],
      servicesStatus: 'idle',
      serviceOptions: [],
      summary: null,
    });

    expect(findByTestId(tree, 'appointment-create-blocked')).toBeDefined();
    expect(findByText(tree, 'No barber profile available')).toBeDefined();
  });

  it('uses phone/email keyboard configuration and multiline notes input', () => {
    const tree = renderView();
    const phoneField = findByTestId(tree, 'appointment-create-client-phone');
    const emailField = findByTestId(tree, 'appointment-create-client-email');
    const notesField = findByTestId(tree, 'appointment-create-notes');
    const phoneInput = findAll(phoneField, (element) => getDisplayName(element) === 'TextInput')[0];
    const emailInput = findAll(emailField, (element) => getDisplayName(element) === 'TextInput')[0];
    const notesInput = findAll(notesField, (element) => getDisplayName(element) === 'TextInput')[0];

    expect((phoneInput?.props as { keyboardType?: string } | undefined)?.keyboardType).toBe('phone-pad');
    expect((emailInput?.props as { keyboardType?: string } | undefined)?.keyboardType).toBe('email-address');
    expect((notesInput?.props as { multiline?: boolean } | undefined)?.multiline).toBe(true);
  });

  it('shows field-level validation errors and lets slot presses fire their handlers', () => {
    const onSlotPress = vi.fn();
    const tree = renderView({
      fieldErrors: {
        clientName: 'clientNameRequired',
        selectedSlot: 'slotRequired',
      },
      slotOptions: [
        {
          startAt: '2026-06-27T12:30:00.000Z',
          label: '09:30',
          selected: false,
          testID: 'appointment-create-slot-1',
          accessibilityLabel: 'Select time 09:30',
          onPress: onSlotPress,
        },
      ],
    });

    expect(findByTestId(tree, 'appointment-create-slot-error')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-client-name')).toBeDefined();
    press(findByTestId(tree, 'appointment-create-slot-1'));
    expect(onSlotPress).toHaveBeenCalledTimes(1);
  });

  it('renders availability retry state and submission error feedback', () => {
    const onRetryAvailability = vi.fn();
    const tree = renderView({
      availabilityStatus: 'error',
      availabilityErrorKey: 'networkError',
      submissionErrorKey: 'appointmentSlotTaken',
      summary: null,
      onRetryAvailability,
    });

    expect(findByTestId(tree, 'appointment-create-availability-error')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-submit-error')).toBeDefined();
    press(findByTestId(tree, 'appointment-create-retry-availability'));
    expect(onRetryAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('AppointmentCreateScreenView customer history warning', () => {
  it('hides the warning when no history exists (null customerWarning)', () => {
    const tree = renderView({ customerWarning: null });
    expect(() => findByTestId(tree, 'appointment-create-customer-warning')).toThrow();
  });

  it('does NOT warn when the customer only has completed or cancelled visits (noShowCount === 0)', () => {
    // Even if a non-zero visitCount were returned, the warning contract
    // is noShowCount > 0 only. We pass noShowCount: 0 explicitly.
    const tree = renderView({
      customerWarning: { noShowCount: 0, lastNoShowAt: null },
    });
    expect(() => findByTestId(tree, 'appointment-create-customer-warning')).toThrow();
  });

  it('warns (singular) when the customer has exactly one prior no-show with a date', () => {
    const tree = renderView({
      customerWarning: {
        noShowCount: 1,
        lastNoShowAt: '2026-05-04T14:00:00.000Z',
      },
    });
    const banner = findByTestId(tree, 'appointment-create-customer-warning');
    expect(banner).toBeDefined();
    expect(
      (banner.props as { accessibilityRole?: string }).accessibilityRole
    ).toBe('alert');
    expect(findByText(tree, 'History associated with the number')).toBeDefined();
    // Singular form ("1 prior no-show") is rendered.
    expect(findByText(tree, expectedWarningBody(1, 'May 4, 2026'))).toBeDefined();
  });

  it('warns (plural) when the customer has multiple prior no-shows', () => {
    const tree = renderView({
      customerWarning: {
        noShowCount: 3,
        lastNoShowAt: '2026-05-04T14:00:00.000Z',
      },
    });
    const banner = findByTestId(tree, 'appointment-create-customer-warning');
    expect(banner).toBeDefined();
    expect(findByText(tree, expectedWarningBody(3, 'May 4, 2026'))).toBeDefined();
  });

  it('falls back to a generic body when no lastNoShowAt timestamp is available', () => {
    const tree = renderView({
      customerWarning: {
        noShowCount: 2,
        lastNoShowAt: null,
      },
    });
    const banner = findByTestId(tree, 'appointment-create-customer-warning');
    expect(banner).toBeDefined();
    expect(findByText(tree, expectedWarningBody(2, null))).toBeDefined();
  });
});

describe('AppointmentCreateScreenView promotion section', () => {
  it('renders the promotion quote breakdown and fires apply/remove callbacks', () => {
    const onApplyPromotion = vi.fn();
    const onRemovePromotion = vi.fn();
    const tree = renderView({
      promotionCode: 'BIENVENIDA25',
      promotionQuote: {
        eligible: true,
        servicePriceCents: 3200,
        discountCents: 800,
        finalPriceCents: 2400,
        policyValueSnapshot: 2500,
        promotion: {
          id: 'promo-1',
          name: 'Bienvenida 25%',
          code: 'bienvenida 25',
          codeNormalized: 'BIENVENIDA25',
          discountType: 'PERCENTAGE',
          fixedDiscountCents: null,
          percentageBasisPoints: 2500,
          maxRedemptionsPerCustomer: 1,
        },
      },
      promotionMessage: 'Promotion applied: Bienvenida 25%',
      onApplyPromotion,
      onRemovePromotion,
    });

    expect(findByTestId(tree, 'appointment-create-promotion-section')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-promotion-quote')).toBeDefined();
    expect(findByText(tree, 'Promotion applied: Bienvenida 25%')).toBeDefined();

    press(findByTestId(tree, 'appointment-create-apply-promotion'));
    press(findByTestId(tree, 'appointment-create-remove-promotion'));

    expect(onApplyPromotion).toHaveBeenCalledTimes(1);
    expect(onRemovePromotion).toHaveBeenCalledTimes(1);
  });

  it('shows a promotion validation error without hiding the ordinary booking flow', () => {
    const tree = renderView({
      fieldErrors: {
        promotionCode: 'promotionCodeInvalid',
      },
      promotionCode: '***',
    });

    expect(findByTestId(tree, 'appointment-create-promotion-code')).toBeDefined();
    expect(findByText(tree, 'Use 3 to 32 characters: letters, numbers, hyphen, or underscore.')).toBeDefined();
    expect(findByTestId(tree, 'appointment-create-summary-section')).toBeDefined();
  });
});
