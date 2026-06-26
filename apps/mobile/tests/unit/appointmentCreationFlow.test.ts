import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api.js';
import {
  applyAppointmentCreationDateChange,
  applyAppointmentCreationEmployeeChange,
  applyAppointmentCreationServiceChange,
  createInitialAppointmentCreationState,
  setAppointmentCreationServices,
  type AppointmentCreationState,
} from '@/lib/appointmentCreationDomain.js';
import { submitAppointmentCreationFlow } from '@/lib/appointmentCreationFlow.js';
import type { Appointment, Service } from '@/lib/types.js';

const OWNER_CONTEXT = {
  role: 'OWNER' as const,
  barbershopId: 'shop-1',
  authenticatedEmployeeId: null,
};

const BARBER_CONTEXT = {
  role: 'BARBER' as const,
  barbershopId: 'shop-1',
  authenticatedEmployeeId: 'emp-1',
};

const SERVICE: Service = {
  id: 'svc-1',
  name: 'Classic Haircut',
  description: null,
  durationMinutes: 30,
  priceCents: 800000,
  currency: 'ARS',
  isActive: true,
};

function makeAppointment(): Appointment {
  return {
    id: 'appt-1',
    barbershopId: 'shop-1',
    employeeId: 'emp-1',
    clientId: null,
    serviceId: 'svc-1',
    clientName: 'Mateo',
    clientPhone: null,
    serviceName: 'Classic Haircut',
    servicePriceCents: 800000,
    serviceDurationMinutes: 30,
    serviceCurrency: 'ARS',
    startAt: '2026-06-27T12:30:00.000Z',
    endAt: '2026-06-27T13:00:00.000Z',
    status: 'PENDING',
    notes: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    deletedAt: null,
    barbershop: { id: 'shop-1', name: 'Main Shop' },
    employee: { id: 'emp-1', user: { id: 'u-1', name: 'Carlos' } },
    client: null,
    service: {
      id: 'svc-1',
      name: 'Classic Haircut',
      durationMinutes: 30,
      priceCents: 800000,
      currency: 'ARS',
    },
  };
}

function buildReadyOwnerState(): AppointmentCreationState {
  let state = createInitialAppointmentCreationState(OWNER_CONTEXT);
  state = applyAppointmentCreationEmployeeChange(state, 'emp-1');
  state = applyAppointmentCreationServiceChange(state, 'svc-1');
  state = applyAppointmentCreationDateChange(state, '2026-06-27');
  state = setAppointmentCreationServices(state, [SERVICE]);

  return {
    ...state,
    clientName: 'Mateo',
    clientPhone: '   ',
    notes: '   ',
    availabilityStatus: 'success',
    availability: {
      localDate: '2026-06-27',
      barbershopTimezone: 'America/Argentina/Buenos_Aires',
      slotIntervalMinutes: 30,
      serviceDurationMinutes: 30,
      slots: [
        {
          startAt: '2026-06-27T12:30:00.000Z',
          endAt: '2026-06-27T13:00:00.000Z',
          localStartTime: '09:30',
          localEndTime: '10:00',
        },
      ],
    },
    selectedSlotStartAt: '2026-06-27T12:30:00.000Z',
  };
}

function buildReadyBarberState(): AppointmentCreationState {
  let state = createInitialAppointmentCreationState(BARBER_CONTEXT);
  state = applyAppointmentCreationServiceChange(state, 'svc-1');
  state = applyAppointmentCreationDateChange(state, '2026-06-27');
  state = setAppointmentCreationServices(state, [SERVICE]);

  return {
    ...state,
    clientName: 'Mateo',
    clientPhone: '',
    notes: '',
    availabilityStatus: 'success',
    availability: {
      localDate: '2026-06-27',
      barbershopTimezone: 'America/Argentina/Buenos_Aires',
      slotIntervalMinutes: 30,
      serviceDurationMinutes: 30,
      slots: [
        {
          startAt: '2026-06-27T12:30:00.000Z',
          endAt: '2026-06-27T13:00:00.000Z',
          localStartTime: '09:30',
          localEndTime: '10:00',
        },
      ],
    },
    selectedSlotStartAt: '2026-06-27T12:30:00.000Z',
  };
}

describe('submitAppointmentCreationFlow', () => {
  it('submits the exact OWNER payload, records the appointment once, and navigates only after success', async () => {
    const createAppointment = vi.fn(async () => makeAppointment());
    const recordCreatedAppointment = vi.fn();
    const onSuccess = vi.fn(async () => undefined);
    const refreshAvailability = vi.fn(async () => undefined);

    const nextState = await submitAppointmentCreationFlow({
      state: buildReadyOwnerState(),
      barbershopId: 'shop-1',
      createAppointment,
      recordCreatedAppointment,
      onSuccess,
      refreshAvailability,
    });

    expect(createAppointment).toHaveBeenCalledWith('shop-1', {
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      startAt: '2026-06-27T12:30:00.000Z',
      clientName: 'Mateo',
    });
    expect(recordCreatedAppointment).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(refreshAvailability).not.toHaveBeenCalled();
    expect(nextState.isSubmitting).toBe(false);
    expect(nextState.submissionError).toBeNull();
  });

  it('submits the BARBER payload without employeeId and without optional empty fields', async () => {
    const createAppointment = vi.fn(async () => makeAppointment());

    await submitAppointmentCreationFlow({
      state: buildReadyBarberState(),
      barbershopId: 'shop-1',
      createAppointment,
      recordCreatedAppointment: vi.fn(),
      onSuccess: vi.fn(async () => undefined),
      refreshAvailability: vi.fn(async () => undefined),
    });

    expect(createAppointment).toHaveBeenCalledWith('shop-1', {
      serviceId: 'svc-1',
      startAt: '2026-06-27T12:30:00.000Z',
      clientName: 'Mateo',
    });
  });

  it('preserves entered fields, clears only the slot, refreshes availability, and does not insert on appointmentSlotTaken', async () => {
    const recordCreatedAppointment = vi.fn();
    const onSuccess = vi.fn(async () => undefined);
    const refreshAvailability = vi.fn(async () => undefined);
    const state = buildReadyOwnerState();
    state.clientPhone = '+54 381 555 1234';
    state.notes = 'Walk-in guest';

    const nextState = await submitAppointmentCreationFlow({
      state,
      barbershopId: 'shop-1',
      createAppointment: vi.fn(async () => {
        throw new ApiError('slot taken', 'CONFLICT', 409);
      }),
      recordCreatedAppointment,
      onSuccess,
      refreshAvailability,
    });

    expect(nextState.submissionError?.key).toBe('appointmentSlotTaken');
    expect(nextState.selectedSlotStartAt).toBeNull();
    expect(nextState.employeeId).toBe('emp-1');
    expect(nextState.serviceId).toBe('svc-1');
    expect(nextState.localDate).toBe('2026-06-27');
    expect(nextState.clientName).toBe('Mateo');
    expect(nextState.clientPhone).toBe('+54 381 555 1234');
    expect(nextState.notes).toBe('Walk-in guest');
    expect(recordCreatedAppointment).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(refreshAvailability).toHaveBeenCalledTimes(1);
  });

  it('clears service state and avoids navigation on service-unassigned failures', async () => {
    const nextState = await submitAppointmentCreationFlow({
      state: buildReadyOwnerState(),
      barbershopId: 'shop-1',
      createAppointment: vi.fn(async () => {
        throw new ApiError('employee does not offer this service', 'BAD_REQUEST', 400);
      }),
      recordCreatedAppointment: vi.fn(),
      onSuccess: vi.fn(async () => undefined),
      refreshAvailability: vi.fn(async () => undefined),
    });

    expect(nextState.submissionError?.key).toBe('serviceNotAssigned');
    expect(nextState.serviceId).toBeNull();
    expect(nextState.availability).toBeNull();
    expect(nextState.selectedSlotStartAt).toBeNull();
  });

  it('returns localized field errors without submitting when required data is missing', async () => {
    const createAppointment = vi.fn(async () => makeAppointment());
    const nextState = await submitAppointmentCreationFlow({
      state: createInitialAppointmentCreationState(OWNER_CONTEXT),
      barbershopId: 'shop-1',
      createAppointment,
      recordCreatedAppointment: vi.fn(),
      onSuccess: vi.fn(async () => undefined),
      refreshAvailability: vi.fn(async () => undefined),
    });

    expect(createAppointment).not.toHaveBeenCalled();
    expect(nextState.fieldErrors.employeeId).toBe('employeeRequired');
    expect(nextState.fieldErrors.serviceId).toBe('serviceRequired');
    expect(nextState.fieldErrors.localDate).toBe('dateRequired');
    expect(nextState.fieldErrors.selectedSlot).toBe('slotRequired');
    expect(nextState.fieldErrors.clientName).toBe('clientNameRequired');
  });
});
