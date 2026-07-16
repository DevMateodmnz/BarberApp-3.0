import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/api.js';
import {
  applyAppointmentCreationDateChange,
  applyAppointmentCreationCustomerPrefill,
  applyAppointmentCreationEmployeeChange,
  applyAppointmentCreationPromotionCodeChange,
  applyAppointmentCreationServiceChange,
  appointmentMatchesContext,
  beginAppointmentCreationAvailabilityRequest,
  buildAppointmentAvailabilityRequestKey,
  buildCreateStaffAppointmentPayload,
  createInitialAppointmentCreationState,
  failAppointmentCreationSubmission,
  getEffectiveAppointmentEmployeeId,
  getAppointmentCreationAvailabilityRequest,
  isValidLocalDateString,
  mapAppointmentCreationError,
  resolveAppointmentCreationAvailabilityFailure,
  resolveAppointmentCreationAvailabilitySuccess,
  selectAppointmentCreationSlot,
  setAppointmentCreationEmployees,
  setAppointmentCreationServices,
  syncAppointmentCreationContext,
  upsertAppointmentById,
  validateAppointmentCreationDraft,
} from '../../src/lib/appointmentCreationDomain.js';
import {
  getAppointmentClientDisplayName,
  getAppointmentServiceCurrency,
  getAppointmentServiceDisplayName,
  getAppointmentServiceDurationMinutes,
  getAppointmentServicePriceCents,
} from '../../src/lib/appointmentSelectors.js';
import type { Appointment, AppointmentAvailability, CurrentUserContext } from '../../src/lib/types.js';

const OWNER_CONTEXT = {
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  authenticatedEmployeeId: null,
};

const BARBER_CONTEXT = {
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  authenticatedEmployeeId: 'emp-barber',
};

function makeAvailability(overrides: Partial<AppointmentAvailability> = {}): AppointmentAvailability {
  return {
    localDate: '2026-06-29',
    barbershopTimezone: 'America/Argentina/Buenos_Aires',
    slotIntervalMinutes: 30,
    serviceDurationMinutes: 45,
    slots: [
      {
        startAt: '2026-06-29T13:00:00.000Z',
        endAt: '2026-06-29T13:45:00.000Z',
        localStartTime: '10:00',
        localEndTime: '10:45',
      },
      {
        startAt: '2026-06-29T13:30:00.000Z',
        endAt: '2026-06-29T14:15:00.000Z',
        localStartTime: '10:30',
        localEndTime: '11:15',
      },
    ],
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    barbershopId: 'shop-1',
    employeeId: 'emp-1',
    clientId: 'client-1',
    serviceId: 'svc-1',
    clientName: 'Snapshot Client',
    clientPhone: null,
    serviceName: 'Snapshot Service',
    servicePriceCents: 2500,
    serviceDurationMinutes: 30,
    serviceCurrency: 'ARS',
    startAt: '2026-06-29T13:00:00.000Z',
    endAt: '2026-06-29T13:30:00.000Z',
    status: 'PENDING',
    notes: null,
    createdAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
    deletedAt: null,
    barbershop: { id: 'shop-1', name: 'Main Shop' },
    employee: { id: 'emp-1', user: { id: 'u-1', name: 'Barber One' } },
    client: { id: 'client-1', name: 'Relational Client', email: 'client@example.com' },
    service: {
      id: 'svc-1',
      name: 'Relational Service',
      durationMinutes: 45,
      priceCents: 9999,
      currency: 'USD',
    },
    ...overrides,
  };
}

describe('appointment selectors', () => {
  it('prefers frozen snapshot fields and survives guest appointments', () => {
    const guest = makeAppointment({ clientId: null, client: null });

    expect(getAppointmentClientDisplayName(guest)).toBe('Snapshot Client');
    expect(getAppointmentServiceDisplayName(guest)).toBe('Snapshot Service');
    expect(getAppointmentServicePriceCents(guest)).toBe(2500);
    expect(getAppointmentServiceDurationMinutes(guest)).toBe(30);
    expect(getAppointmentServiceCurrency(guest)).toBe('ARS');
  });

  it('falls back to relational values when needed', () => {
    const legacy = makeAppointment({
      clientName: '',
      serviceName: '',
      servicePriceCents: Number.NaN,
      serviceDurationMinutes: Number.NaN,
      serviceCurrency: '',
    });

    expect(getAppointmentClientDisplayName(legacy)).toBe('Relational Client');
    expect(getAppointmentServiceDisplayName(legacy)).toBe('Relational Service');
    expect(getAppointmentServicePriceCents(legacy)).toBe(9999);
    expect(getAppointmentServiceDurationMinutes(legacy)).toBe(45);
    expect(getAppointmentServiceCurrency(legacy)).toBe('USD');
  });
});

describe('appointment creation validation and payload building', () => {
  it('requires OWNER employee selection and BARBER employee context', () => {
    const ownerState = createInitialAppointmentCreationState(OWNER_CONTEXT);
    const barberState = createInitialAppointmentCreationState({
      ...BARBER_CONTEXT,
      authenticatedEmployeeId: null,
    });

    expect(validateAppointmentCreationDraft(ownerState).fieldErrors.employeeId).toBe('employeeRequired');
    expect(validateAppointmentCreationDraft(barberState).fieldErrors.employeeId).toBe('employeeContextRequired');
  });

  it('validates required fields, lengths, local date format, and stale slots', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = applyAppointmentCreationEmployeeChange(state, 'emp-1');
    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-02-30');
    state = {
      ...state,
      clientName: '   ',
      clientPhone: 'x'.repeat(51),
      clientEmail: 'not-an-email',
      notes: 'y'.repeat(501),
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T15:00:00.000Z',
    };

    const result = validateAppointmentCreationDraft(state);
    expect(result.fieldErrors.localDate).toBe('invalidDate');
    expect(result.fieldErrors.clientName).toBe('clientNameRequired');
    expect(result.fieldErrors.clientPhone).toBe('clientPhoneTooLong');
    expect(result.fieldErrors.clientEmail).toBe('clientEmailInvalid');
    expect(result.fieldErrors.notes).toBe('notesTooLong');
    expect(result.fieldErrors.selectedSlot).toBe('staleSlot');
  });

  it('builds a normalized OWNER payload with slot-derived startAt', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = applyAppointmentCreationEmployeeChange(state, 'emp-1');
    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-06-29');
    state = {
      ...state,
      clientName: '  Walk In  ',
      clientPhone: '   +54 381 555 1000   ',
      clientEmail: '   walkin@example.com   ',
      notes: '  First visit  ',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:30:00.000Z',
    };

    const result = buildCreateStaffAppointmentPayload(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        startAt: '2026-06-29T13:30:00.000Z',
        clientName: 'Walk In',
        clientPhone: '+54 381 555 1000',
        clientEmail: 'walkin@example.com',
        notes: 'First visit',
      });
    }
  });

  it('builds a BARBER payload without employeeId and derives effective employee', () => {
    let state = createInitialAppointmentCreationState(BARBER_CONTEXT);
    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-06-29');
    state = {
      ...state,
      clientName: 'Guest',
      clientEmail: 'guest@example.com',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    expect(getEffectiveAppointmentEmployeeId({
      role: 'BARBER',
      selectedEmployeeId: state.employeeId,
      authenticatedEmployeeId: BARBER_CONTEXT.authenticatedEmployeeId,
    })).toBe('emp-barber');

    const result = buildCreateStaffAppointmentPayload(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        serviceId: 'svc-1',
        startAt: '2026-06-29T13:00:00.000Z',
        clientName: 'Guest',
        clientEmail: 'guest@example.com',
      });
      expect(result.effectiveEmployeeId).toBe('emp-barber');
    }
  });

  it('normalizes an optional promotion code into the final booking payload', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = applyAppointmentCreationEmployeeChange(state, 'emp-1');
    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-06-29');
    state = applyAppointmentCreationPromotionCodeChange(state, ' bienvenida 25 ');
    state = {
      ...state,
      clientName: 'Promo Guest',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    const result = buildCreateStaffAppointmentPayload(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(expect.objectContaining({
        promotionCode: 'BIENVENIDA25',
      }));
    }
  });

  it('flags malformed promotion codes without blocking empty-code bookings', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = applyAppointmentCreationEmployeeChange(state, 'emp-1');
    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-06-29');
    state = {
      ...state,
      clientName: 'Walk In',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    expect(validateAppointmentCreationDraft(state).fieldErrors.promotionCode).toBeUndefined();

    const invalidState = applyAppointmentCreationPromotionCodeChange(state, '***');
    expect(validateAppointmentCreationDraft(invalidState).fieldErrors.promotionCode).toBe('promotionCodeInvalid');
  });
});

describe('appointment creation dependency resets and context sync', () => {
  it('prefills customer name, phone, and email from customer detail', () => {
    const state = createInitialAppointmentCreationState(OWNER_CONTEXT);

    const next = applyAppointmentCreationCustomerPrefill(state, {
      customerId: 'cust-1',
      clientName: 'Mateo',
      clientPhone: '+54 381 555 9999',
      clientEmail: 'mateo@example.com',
    });

    expect(next.customerId).toBe('cust-1');
    expect(next.clientName).toBe('Mateo');
    expect(next.clientPhone).toBe('+54 381 555 9999');
    expect(next.clientEmail).toBe('mateo@example.com');
  });

  it('clears service, availability, and selected slot when employee changes', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = {
      ...applyAppointmentCreationEmployeeChange(state, 'emp-1'),
      serviceId: 'svc-1',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    const next = applyAppointmentCreationEmployeeChange(state, 'emp-2');
    expect(next.serviceId).toBeNull();
    expect(next.availability).toBeNull();
    expect(next.selectedSlotStartAt).toBeNull();
  });

  it('clears availability and selected slot when service or date changes', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = {
      ...state,
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      localDate: '2026-06-29',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    const serviceChanged = applyAppointmentCreationServiceChange(state, 'svc-2');
    expect(serviceChanged.availability).toBeNull();
    expect(serviceChanged.selectedSlotStartAt).toBeNull();

    const dateChanged = applyAppointmentCreationDateChange(state, '2026-06-30');
    expect(dateChanged.availability).toBeNull();
    expect(dateChanged.selectedSlotStartAt).toBeNull();
  });

  it('keeps valid empty availability distinct from API failure', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    const request = { employeeId: 'emp-1', serviceId: 'svc-1', localDate: '2026-06-29' };
    state = beginAppointmentCreationAvailabilityRequest(state, request);
    state = resolveAppointmentCreationAvailabilitySuccess(state, request, makeAvailability({ slots: [] }));
    expect(state.availabilityStatus).toBe('empty');
    expect(state.availabilityError).toBeNull();

    state = beginAppointmentCreationAvailabilityRequest(state, request);
    state = resolveAppointmentCreationAvailabilityFailure(state, request, {
      key: 'networkError',
      shouldClearSelectedSlot: false,
      shouldRefreshAvailability: false,
    });
    expect(state.availabilityStatus).toBe('error');
    expect(state.availabilityError?.key).toBe('networkError');
  });

  it('clears stale tenant/employee state when context changes', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = {
      ...state,
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      localDate: '2026-06-29',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
      availableEmployees: [
        {
          id: 'emp-1',
          barbershopId: 'shop-1',
          userId: 'u-1',
          isActive: true,
          createdAt: 'x',
          updatedAt: 'x',
          user: { id: 'u-1', email: 'a@test.com', name: 'Ana', role: 'BARBER' },
        },
      ],
      availableServices: [
        {
          id: 'svc-1',
          name: 'Cut',
          description: null,
          durationMinutes: 30,
          priceCents: 2500,
          currency: 'ARS',
          isActive: true,
        },
      ],
    };

    const next = syncAppointmentCreationContext(state, {
      role: 'BARBER',
      barbershopId: 'shop-2',
      authenticatedEmployeeId: 'emp-9',
    });

    expect(next.context.barbershopId).toBe('shop-2');
    expect(next.employeeId).toBe('emp-9');
    expect(next.serviceId).toBeNull();
    expect(next.selectedSlotStartAt).toBeNull();
    expect(next.availableEmployees).toEqual([]);
    expect(next.availableServices).toEqual([]);
    expect(next.clientName).toBe(state.clientName);
  });

  it('removes invalid employee/service selections when source lists change', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    state = {
      ...state,
      employeeId: 'emp-gone',
      serviceId: 'svc-gone',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    state = setAppointmentCreationEmployees(state, [
      {
        id: 'emp-1',
        barbershopId: 'shop-1',
        userId: 'u-1',
        isActive: true,
        createdAt: 'x',
        updatedAt: 'x',
        user: { id: 'u-1', email: 'a@test.com', name: 'Ana', role: 'BARBER' },
      },
    ]);
    expect(state.employeeId).toBeNull();
    expect(state.serviceId).toBeNull();

    state = {
      ...state,
      employeeId: 'emp-1',
      serviceId: 'svc-gone',
      availability: makeAvailability(),
      availabilityStatus: 'success',
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };
    state = setAppointmentCreationServices(state, [
      {
        id: 'svc-1',
        name: 'Cut',
        description: null,
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
        isActive: true,
      },
    ]);
    expect(state.serviceId).toBeNull();
    expect(state.selectedSlotStartAt).toBeNull();
  });
});

describe('appointment creation availability race protection', () => {
  it('ignores obsolete employee, service, and date responses', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    const requestA = { employeeId: 'emp-1', serviceId: 'svc-1', localDate: '2026-06-29' };
    const requestB = { employeeId: 'emp-2', serviceId: 'svc-2', localDate: '2026-06-30' };

    state = beginAppointmentCreationAvailabilityRequest(state, requestA);
    state = beginAppointmentCreationAvailabilityRequest(state, requestB);
    state = resolveAppointmentCreationAvailabilitySuccess(state, requestA, makeAvailability());
    expect(state.availability).toBeNull();
    expect(state.availabilityStatus).toBe('loading');

    state = resolveAppointmentCreationAvailabilitySuccess(state, requestB, makeAvailability({ localDate: '2026-06-30' }));
    expect(state.availability?.localDate).toBe('2026-06-30');
  });

  it('prevents earlier failure from overwriting later success and clears stale selected slots on reload', () => {
    let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
    const requestA = { employeeId: 'emp-1', serviceId: 'svc-1', localDate: '2026-06-29' };
    const requestB = { employeeId: 'emp-1', serviceId: 'svc-1', localDate: '2026-06-30' };

    state = beginAppointmentCreationAvailabilityRequest(state, requestA);
    state = beginAppointmentCreationAvailabilityRequest(state, requestB);
    state = resolveAppointmentCreationAvailabilityFailure(state, requestA, {
      key: 'networkError',
      shouldClearSelectedSlot: false,
      shouldRefreshAvailability: false,
    });
    expect(state.availabilityStatus).toBe('loading');

    state = resolveAppointmentCreationAvailabilitySuccess(state, requestB, makeAvailability({ localDate: '2026-06-30' }));
    expect(state.availabilityStatus).toBe('success');
    expect(state.availability?.localDate).toBe('2026-06-30');

    state = selectAppointmentCreationSlot(state, '2026-06-29T13:30:00.000Z');
    state = beginAppointmentCreationAvailabilityRequest(state, requestA);
    state = resolveAppointmentCreationAvailabilitySuccess(
      state,
      requestA,
      makeAvailability({
        slots: [
          {
            startAt: '2026-06-29T13:00:00.000Z',
            endAt: '2026-06-29T13:45:00.000Z',
            localStartTime: '10:00',
            localEndTime: '10:45',
          },
        ],
      }),
    );

    expect(state.selectedSlotStartAt).toBeNull();
    expect(state.fieldErrors.selectedSlot).toBe('staleSlot');
  });
});

describe('appointment creation error mapping', () => {
  it('maps committed backend conflicts and scope errors to semantic keys', () => {
    expect(mapAppointmentCreationError(new ApiError('This time slot is already booked', 'CONFLICT', 409))).toEqual({
      key: 'appointmentSlotTaken',
      shouldClearSelectedSlot: true,
      shouldRefreshAvailability: true,
    });

    expect(mapAppointmentCreationError(new ApiError(
      'Barbers can only create appointments for their own employee profile',
      'FORBIDDEN_EMPLOYEE_SCOPE',
      403,
    )).key).toBe('forbiddenEmployeeScope');
  });

  it('maps inactive employees, inactive services, missing assignment, and time/business-hour errors', () => {
    expect(mapAppointmentCreationError(new ApiError('Employee is not active', 'BAD_REQUEST', 400)).key).toBe('employeeUnavailable');
    expect(mapAppointmentCreationError(new ApiError('Service is not available', 'BAD_REQUEST', 400)).key).toBe('serviceUnavailable');
    expect(mapAppointmentCreationError(new ApiError('Employee does not offer this service', 'BAD_REQUEST', 400)).key).toBe('serviceNotAssigned');
    expect(mapAppointmentCreationError(new ApiError('Appointments must be scheduled in the future', 'INVALID_APPOINTMENT_TIME', 400)).key).toBe('appointmentTimeInvalid');
    expect(mapAppointmentCreationError(new ApiError('Appointment ends after closing hours (closes at 19:00)', 'BAD_REQUEST', 400)).key).toBe('appointmentOutsideWorkingHours');
  });

  it('falls back to generic network and unknown server errors', () => {
    expect(mapAppointmentCreationError(new Error('Network Error')).key).toBe('networkError');
    expect(mapAppointmentCreationError(new Error('Something odd happened')).key).toBe('unknownServerError');
  });

  it('marks slot-taken submission failures as recoverable for slot reset + refresh', () => {
    const state = {
      ...createInitialAppointmentCreationState(OWNER_CONTEXT),
      selectedSlotStartAt: '2026-06-29T13:00:00.000Z',
    };

    const next = failAppointmentCreationSubmission(state, {
      key: 'appointmentSlotTaken',
      shouldClearSelectedSlot: true,
      shouldRefreshAvailability: true,
    });

    expect(next.selectedSlotStartAt).toBeNull();
    expect(next.submissionError?.key).toBe('appointmentSlotTaken');
    expect(next.fieldErrors.selectedSlot).toBe('staleSlot');
  });
});

describe('local date and request helpers', () => {
  it('validates strict local YYYY-MM-DD strings and builds request identities', () => {
    expect(isValidLocalDateString('2026-06-29')).toBe(true);
    expect(isValidLocalDateString('2026-6-29')).toBe(false);
    expect(isValidLocalDateString('2026-02-30')).toBe(false);
    expect(buildAppointmentAvailabilityRequestKey({ employeeId: 'emp-1', serviceId: 'svc-1', localDate: '2026-06-29' }))
      .toBe('emp-1::svc-1::2026-06-29');
  });

  it('only creates availability request input when employee, service, and date are all ready', () => {
    let state = createInitialAppointmentCreationState(BARBER_CONTEXT);
    expect(getAppointmentCreationAvailabilityRequest(state)).toBeNull();

    state = applyAppointmentCreationServiceChange(state, 'svc-1');
    state = applyAppointmentCreationDateChange(state, '2026-06-29');
    expect(getAppointmentCreationAvailabilityRequest(state)).toEqual({
      employeeId: 'emp-barber',
      serviceId: 'svc-1',
      localDate: '2026-06-29',
    });
  });
});

describe('appointment list refresh helpers', () => {
  it('upserts without duplicates and respects loaded context scope', () => {
    const existing = [
      makeAppointment({ id: 'appt-1', startAt: '2026-06-29T12:00:00.000Z' }),
      makeAppointment({ id: 'appt-2', startAt: '2026-06-29T11:00:00.000Z' }),
    ];

    const updated = upsertAppointmentById(existing, makeAppointment({ id: 'appt-1', startAt: '2026-06-29T13:00:00.000Z' }));
    expect(updated).toHaveLength(2);
    expect(updated[0]?.id).toBe('appt-1');

    const ownerContext: CurrentUserContext = {
      userId: 'owner-1',
      role: 'OWNER',
      barbershopId: 'shop-1',
      barbershopName: 'Main Shop',
      employeeId: null,
      employeeName: null,
    };
    const barberContext: CurrentUserContext = {
      userId: 'barber-1',
      role: 'BARBER',
      barbershopId: 'shop-1',
      barbershopName: 'Main Shop',
      employeeId: 'emp-1',
      employeeName: 'Ana',
    };

    expect(appointmentMatchesContext(makeAppointment(), ownerContext)).toBe(true);
    expect(appointmentMatchesContext(makeAppointment(), barberContext)).toBe(true);
    expect(appointmentMatchesContext(makeAppointment({ employeeId: 'emp-2' }), barberContext)).toBe(false);
  });
});
