import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createTestAppointment,
  createTestBarbershop,
  createTestEmployee,
  createTestEmployeeService,
  createTestService,
  createTestUser,
  prisma,
} from './helpers';

async function createNotificationFixture() {
  const owner = await createTestUser({ role: 'OWNER', email: 'owner-attempts@test.com' });
  const { barbershop } = await createTestBarbershop({
    name: 'Attempt Audit Shop',
    ownerId: owner.user.id,
  });
  const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
  const { service } = await createTestService({ barbershopId: barbershop.id, durationMinutes: 30 });
  await createTestEmployeeService({ employeeId: employee.id, serviceId: service.id });
  const appointment = await createTestAppointment({
    barbershopId: barbershop.id,
    employeeId: employee.id,
    serviceId: service.id,
    clientName: 'Audit Client',
    clientEmail: 'audit@example.com',
    startAt: new Date('2026-07-25T15:00:00.000Z'),
    endAt: new Date('2026-07-25T15:30:00.000Z'),
    status: 'CONFIRMED',
  });

  const notification = await prisma.appointmentNotification.create({
    data: {
      barbershopId: barbershop.id,
      appointmentId: appointment.id,
      type: 'BOOKING_CONFIRMATION',
      channel: 'EMAIL',
      recipientEmail: 'audit@example.com',
      scheduledFor: new Date('2026-07-24T12:00:00.000Z'),
      nextAttemptAt: new Date('2026-07-24T12:00:00.000Z'),
      idempotencyKey: `appointment:${appointment.id}:BOOKING_CONFIRMATION:EMAIL`,
      payload: {
        customerName: 'Audit Client',
        barbershopName: 'Attempt Audit Shop',
        serviceName: service.name,
        employeeName: 'Audit Barber',
        timezone: 'America/Argentina/Tucuman',
        startAt: '2026-07-25T15:00:00.000Z',
        publicSlug: null,
        publicReference: null,
      },
    },
  });

  return { owner, barbershop, appointment, notification };
}

describe('AppointmentNotificationAttempt model', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('defaults manual retry metadata on notifications and stores append-only attempts', async () => {
    const { barbershop, notification } = await createNotificationFixture();

    expect(notification.manualRetryCount).toBe(0);
    expect(notification.lastManualRetryAt).toBeNull();
    expect(notification.lastManualRetryByUserId).toBeNull();

    const attempt = await prisma.appointmentNotificationAttempt.create({
      data: {
        barbershopId: barbershop.id,
        appointmentNotificationId: notification.id,
        attemptNumber: 1,
        outcome: 'SENT',
        attemptedAt: new Date('2026-07-24T12:00:00.000Z'),
        completedAt: new Date('2026-07-24T12:00:01.000Z'),
        workerTokenHash: 'worker-hash',
        providerMessageIdHash: 'provider-hash',
        durationMs: 1000,
      },
    });

    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.outcome).toBe('SENT');
  });

  it('rejects duplicate attempt numbers for one notification', async () => {
    const { barbershop, notification } = await createNotificationFixture();

    const baseData = {
      barbershopId: barbershop.id,
      appointmentNotificationId: notification.id,
      attemptNumber: 1,
      outcome: 'TEMPORARY_FAILURE' as const,
      attemptedAt: new Date('2026-07-24T12:00:00.000Z'),
      completedAt: new Date('2026-07-24T12:00:01.000Z'),
      sanitizedError: 'smtp timeout',
      durationMs: 1000,
    };

    await prisma.appointmentNotificationAttempt.create({ data: baseData });

    await expect(
      prisma.appointmentNotificationAttempt.create({ data: baseData })
    ).rejects.toThrow();
  });

  it('rejects cross-tenant attempt links', async () => {
    const { notification } = await createNotificationFixture();
    const otherOwner = await createTestUser({ role: 'OWNER', email: 'other-owner-attempts@test.com' });
    const { barbershop: otherShop } = await createTestBarbershop({
      name: 'Other Attempt Shop',
      ownerId: otherOwner.user.id,
    });

    await expect(
      prisma.appointmentNotificationAttempt.create({
        data: {
          barbershopId: otherShop.id,
          appointmentNotificationId: notification.id,
          attemptNumber: 1,
          outcome: 'PERMANENT_FAILURE',
          attemptedAt: new Date('2026-07-24T12:00:00.000Z'),
          completedAt: new Date('2026-07-24T12:00:01.000Z'),
          sanitizedError: 'permanent failure',
        },
      })
    ).rejects.toThrow();
  });

  it('prevents deleting a notification with durable attempt history', async () => {
    const { barbershop, notification } = await createNotificationFixture();

    await prisma.appointmentNotificationAttempt.create({
      data: {
        barbershopId: barbershop.id,
        appointmentNotificationId: notification.id,
        attemptNumber: 1,
        outcome: 'SENT',
        attemptedAt: new Date('2026-07-24T12:00:00.000Z'),
        completedAt: new Date('2026-07-24T12:00:01.000Z'),
      },
    });

    await expect(
      prisma.appointmentNotification.delete({ where: { id: notification.id } })
    ).rejects.toThrow();
  });
});
