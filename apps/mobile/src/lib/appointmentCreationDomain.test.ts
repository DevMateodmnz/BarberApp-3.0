import { describe, expect, it } from 'vitest';

import {
  applyAppointmentCreationCustomerPrefill,
  buildCreateStaffAppointmentPayload,
  createInitialAppointmentCreationState,
  syncAppointmentCreationContext,
} from '@/lib/appointmentCreationDomain.js';

describe('appointmentCreationDomain customer prefill', () => {
  it('preserves customer identity across a context sync', () => {
    const initial = createInitialAppointmentCreationState({
      role: 'OWNER',
      barbershopId: 'shop-1',
      authenticatedEmployeeId: null,
    });
    const prefilled = applyAppointmentCreationCustomerPrefill(initial, {
      customerId: 'cust-1',
      clientName: 'Juan Pérez',
      clientPhone: '+54 381 555 1111',
    });

    const synced = syncAppointmentCreationContext(prefilled, {
      role: 'OWNER',
      barbershopId: 'shop-2',
      authenticatedEmployeeId: null,
    });

    expect(synced.customerId).toBe('cust-1');
    expect(synced.clientName).toBe('Juan Pérez');
    expect(synced.clientPhone).toBe('+54 381 555 1111');
  });

  it('includes customerId in the staff appointment payload when prefilled', () => {
    const base = createInitialAppointmentCreationState({
      role: 'OWNER',
      barbershopId: 'shop-1',
      authenticatedEmployeeId: null,
    });
    const state = {
      ...applyAppointmentCreationCustomerPrefill(base, {
        customerId: 'cust-1',
        clientName: 'Juan Pérez',
        clientPhone: '+54 381 555 1111',
      }),
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      localDate: '2026-07-20',
      selectedSlotStartAt: '2026-07-20T13:00:00.000Z',
      availability: {
        localDate: '2026-07-20',
        barbershopTimezone: 'America/Argentina/Tucuman',
        slotIntervalMinutes: 30,
        serviceDurationMinutes: 30,
        slots: [
          {
            startAt: '2026-07-20T13:00:00.000Z',
            endAt: '2026-07-20T13:30:00.000Z',
            localStartTime: '10:00',
            localEndTime: '10:30',
          },
        ],
      },
    };

    const result = buildCreateStaffAppointmentPayload(state);

    expect(result.ok).toBe(true);
    expect('payload' in result).toBe(true);
    if (!('payload' in result)) {
      throw new Error('Expected appointment payload to be built');
    }

    expect(result.payload.customerId).toBe('cust-1');
    expect(result.payload.employeeId).toBe('emp-1');
    expect(result.payload.clientPhone).toBe('+54 381 555 1111');
  });
});
