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

describe('AppointmentNotification model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function createAppointmentFixture() {
    const { barbershop } = await createTestBarbershop({ name: 'Notifications Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
    const { service } = await createTestService({ barbershopId: barbershop.id, durationMinutes: 30 });
    await createTestEmployeeService({ employeeId: employee.id, serviceId: service.id });
    const appointment = await createTestAppointment({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      serviceId: service.id,
      clientName: 'Mateo',
      clientEmail: 'mateo@example.com',
      startAt: new Date('2026-07-22T15:00:00.000Z'),
      endAt: new Date('2026-07-22T15:30:00.000Z'),
      status: 'CONFIRMED',
    });

    return { barbershop, employee, service, appointment };
  }

  it('stores tenant-safe appointment notifications', async () => {
    const { appointment, barbershop } = await createAppointmentFixture();

    const notification = await prisma.appointmentNotification.create({
      data: {
        barbershopId: barbershop.id,
        appointmentId: appointment.id,
        type: 'BOOKING_CONFIRMATION',
        channel: 'EMAIL',
        recipientEmail: 'mateo@example.com',
        scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
        nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
        idempotencyKey: 'appointment:appt_1:BOOKING_CONFIRMATION:EMAIL',
        payload: {
          customerName: 'Mateo',
          barbershopName: 'Notifications Shop',
          serviceName: 'Test Service',
          employeeName: 'Barber',
          timezone: 'America/Argentina/Tucuman',
          startAt: '2026-07-22T15:00:00.000Z',
          publicSlug: null,
          publicReference: null,
        },
      },
    });

    expect(notification.barbershopId).toBe(barbershop.id);
    expect(notification.appointmentId).toBe(appointment.id);
    expect(notification.status).toBe('PENDING');
  });

  it('rejects duplicate idempotency keys', async () => {
    const { appointment, barbershop } = await createAppointmentFixture();

    const baseData = {
      barbershopId: barbershop.id,
      appointmentId: appointment.id,
      type: 'BOOKING_CONFIRMATION' as const,
      channel: 'EMAIL' as const,
      recipientEmail: 'mateo@example.com',
      scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
      nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
      idempotencyKey: 'appointment:duplicate:BOOKING_CONFIRMATION:EMAIL',
      payload: {
        customerName: 'Mateo',
        barbershopName: 'Notifications Shop',
        serviceName: 'Test Service',
        employeeName: 'Barber',
        timezone: 'America/Argentina/Tucuman',
        startAt: '2026-07-22T15:00:00.000Z',
        publicSlug: null,
        publicReference: null,
      },
    };

    await prisma.appointmentNotification.create({ data: baseData });

    await expect(
      prisma.appointmentNotification.create({ data: baseData })
    ).rejects.toThrow();
  });

  it('rejects cross-barbershop appointment links', async () => {
    const { appointment } = await createAppointmentFixture();
    const { barbershop: otherShop } = await createTestBarbershop({ name: 'Other Shop' });

    await expect(
      prisma.appointmentNotification.create({
        data: {
          barbershopId: otherShop.id,
          appointmentId: appointment.id,
          type: 'BOOKING_CONFIRMATION',
          channel: 'EMAIL',
          recipientEmail: 'mateo@example.com',
          scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
          nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
          idempotencyKey: 'appointment:cross-tenant:BOOKING_CONFIRMATION:EMAIL',
          payload: {
            customerName: 'Mateo',
            barbershopName: 'Other Shop',
            serviceName: 'Test Service',
            employeeName: 'Barber',
            timezone: 'America/Argentina/Tucuman',
            startAt: '2026-07-22T15:00:00.000Z',
            publicSlug: null,
            publicReference: null,
          },
        },
      })
    ).rejects.toThrow();
  });

  it('prevents hard-deleting appointments with notification history', async () => {
    const { appointment, barbershop } = await createAppointmentFixture();

    await prisma.appointmentNotification.create({
      data: {
        barbershopId: barbershop.id,
        appointmentId: appointment.id,
        type: 'BOOKING_CONFIRMATION',
        channel: 'EMAIL',
        recipientEmail: 'mateo@example.com',
        scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
        nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
        idempotencyKey: 'appointment:restrict-delete:BOOKING_CONFIRMATION:EMAIL',
        payload: {
          customerName: 'Mateo',
          barbershopName: 'Notifications Shop',
          serviceName: 'Test Service',
          employeeName: 'Barber',
          timezone: 'America/Argentina/Tucuman',
          startAt: '2026-07-22T15:00:00.000Z',
          publicSlug: null,
          publicReference: null,
        },
      },
    });

    await expect(
      prisma.appointment.delete({ where: { id: appointment.id } })
    ).rejects.toThrow();
  });

  it('rejects processing rows without a lock token and timestamp', async () => {
    const { appointment, barbershop } = await createAppointmentFixture();

    await expect(
      prisma.appointmentNotification.create({
        data: {
          barbershopId: barbershop.id,
          appointmentId: appointment.id,
          type: 'BOOKING_CONFIRMATION',
          channel: 'EMAIL',
          status: 'PROCESSING',
          recipientEmail: 'mateo@example.com',
          scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
          nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
          idempotencyKey: 'appointment:bad-processing:BOOKING_CONFIRMATION:EMAIL',
          payload: {
            customerName: 'Mateo',
            barbershopName: 'Notifications Shop',
            serviceName: 'Test Service',
            employeeName: 'Barber',
            timezone: 'America/Argentina/Tucuman',
            startAt: '2026-07-22T15:00:00.000Z',
            publicSlug: null,
            publicReference: null,
          },
        },
      })
    ).rejects.toThrow();
  });
});
