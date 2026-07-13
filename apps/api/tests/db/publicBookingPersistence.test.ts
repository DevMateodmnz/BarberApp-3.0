import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createTestAppointment,
  createTestBarbershop,
  createTestEmployee,
  createTestEmployeeService,
  createTestService,
  prisma,
} from './helpers';

describe('Public booking persistence foundations', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('allows legacy appointments to keep null public fields but rejects duplicate public references', async () => {
    const { barbershop } = await createTestBarbershop();
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id });
    await createTestEmployeeService({
      employeeId: employee.id,
      serviceId: service.id,
    });

    await createTestAppointment({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      serviceId: service.id,
      clientId: null,
      clientName: 'Legacy Guest A',
    });

    await createTestAppointment({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      serviceId: service.id,
      clientId: null,
      clientName: 'Legacy Guest B',
      startAt: new Date('2026-07-21T14:00:00.000Z'),
      endAt: new Date('2026-07-21T14:30:00.000Z'),
    });

    const first = await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        clientId: null,
        serviceId: service.id,
        clientName: 'Public Guest A',
        clientPhone: '+543811234567',
        publicReference: 'pb_ABCDEFGHJKLMNPQ',
        publicConsentAcceptedAt: new Date('2026-07-13T12:00:00.000Z'),
        publicConsentVersion: 'public-booking-v1',
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDurationMinutes: service.durationMinutes,
        serviceCurrency: service.currency,
        startAt: new Date('2026-07-22T14:00:00.000Z'),
        endAt: new Date('2026-07-22T14:30:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    expect(first.publicReference).toBe('pb_ABCDEFGHJKLMNPQ');
    expect(first.publicConsentVersion).toBe('public-booking-v1');

    await expect(
      prisma.appointment.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          clientId: null,
          serviceId: service.id,
          clientName: 'Public Guest B',
          clientPhone: '+543811234568',
          publicReference: 'pb_ABCDEFGHJKLMNPQ',
          publicConsentAcceptedAt: new Date('2026-07-13T12:05:00.000Z'),
          publicConsentVersion: 'public-booking-v1',
          serviceName: service.name,
          servicePriceCents: service.priceCents,
          serviceDurationMinutes: service.durationMinutes,
          serviceCurrency: service.currency,
          startAt: new Date('2026-07-22T15:00:00.000Z'),
          endAt: new Date('2026-07-22T15:30:00.000Z'),
          status: 'CONFIRMED',
        },
      })
    ).rejects.toThrow();
  });

  it('scopes idempotency keys by shop and operation and detaches them safely from deleted appointments', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Shop A' });
    const { barbershop: otherBarbershop } = await createTestBarbershop({
      name: 'Shop B',
    });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id });
    const appointment = await createTestAppointment({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      serviceId: service.id,
      clientId: null,
      clientName: 'Replay Guest',
      startAt: new Date('2026-07-23T14:00:00.000Z'),
      endAt: new Date('2026-07-23T14:30:00.000Z'),
    });

    await prisma.publicBookingIdempotency.create({
      data: {
        barbershopId: barbershop.id,
        operation: 'public-booking-create',
        idempotencyKey: 'IdemKey_12345678',
        requestFingerprint:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        appointmentId: appointment.id,
        expiresAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    });

    await prisma.publicBookingIdempotency.create({
      data: {
        barbershopId: otherBarbershop.id,
        operation: 'public-booking-create',
        idempotencyKey: 'IdemKey_12345678',
        requestFingerprint:
          '1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        expiresAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    });

    await prisma.publicBookingIdempotency.create({
      data: {
        barbershopId: barbershop.id,
        operation: 'public-booking-confirmation',
        idempotencyKey: 'IdemKey_12345678',
        requestFingerprint:
          '2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        expiresAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    });

    await expect(
      prisma.publicBookingIdempotency.create({
        data: {
          barbershopId: barbershop.id,
          operation: 'public-booking-create',
          idempotencyKey: 'IdemKey_12345678',
          requestFingerprint:
            '3123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          expiresAt: new Date('2026-07-15T12:00:00.000Z'),
        },
      })
    ).rejects.toThrow();

    await prisma.appointment.delete({
      where: { id: appointment.id },
    });

    const persisted = await prisma.publicBookingIdempotency.findFirstOrThrow({
      where: {
        barbershopId: barbershop.id,
        operation: 'public-booking-create',
        idempotencyKey: 'IdemKey_12345678',
      },
    });

    expect(persisted.appointmentId).toBeNull();
    expect(persisted.expiresAt.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});
