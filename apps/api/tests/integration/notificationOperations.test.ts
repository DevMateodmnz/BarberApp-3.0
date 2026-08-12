import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createAppFromEnv } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  client: { id: string; clerkUserId: string };
  ownerOther: { id: string; clerkUserId: string };
  shop: { id: string; slug: string };
  shopOther: { id: string };
  service: { id: string; name: string; durationMinutes: number };
}

const fixtures = {} as Fixtures;
let appointmentCounter = 0;
let notificationCounter = 0;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function createAppointmentWithNotification(overrides: {
  status?: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
  type?: 'BOOKING_CONFIRMATION' | 'REMINDER_24H';
  attempts?: number;
  manualRetryCount?: number;
  recipientEmail?: string;
  scheduledFor?: Date;
  nextAttemptAt?: Date;
  lastError?: string | null;
  sentAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastManualRetryAt?: Date | null;
  lastManualRetryByUserId?: string | null;
} = {}) {
  appointmentCounter += 1;
  notificationCounter += 1;

  const startAt = new Date(`2026-07-2${appointmentCounter}T15:00:00.000Z`);
  const endAt = new Date(`2026-07-2${appointmentCounter}T15:30:00.000Z`);
  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barber.employeeId,
      serviceId: fixtures.service.id,
      clientName: `Notification Client ${appointmentCounter}`,
      clientPhone: `+54381123${String(appointmentCounter).padStart(4, '0')}`,
      clientEmail: overrides.recipientEmail ?? `client${appointmentCounter}@example.com`,
      serviceName: fixtures.service.name,
      servicePriceCents: 3200,

      discountCents: 0,

      finalPriceCents: 3200,
      serviceDurationMinutes: fixtures.service.durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status: 'CONFIRMED',
    },
  });

  const status = overrides.status ?? 'FAILED';

  const notification = await prisma.appointmentNotification.create({
    data: {
      barbershopId: fixtures.shop.id,
      appointmentId: appointment.id,
      type: overrides.type ?? 'BOOKING_CONFIRMATION',
      channel: 'EMAIL',
      status,
      recipientEmail: overrides.recipientEmail ?? `client${appointmentCounter}@example.com`,
      scheduledFor: overrides.scheduledFor ?? new Date(`2026-07-1${appointmentCounter}T12:00:00.000Z`),
      nextAttemptAt: overrides.nextAttemptAt ?? new Date(`2026-07-1${appointmentCounter}T12:05:00.000Z`),
      attempts: overrides.attempts ?? 2,
      manualRetryCount: overrides.manualRetryCount ?? 0,
      lastManualRetryAt: overrides.lastManualRetryAt ?? null,
      lastManualRetryByUserId: overrides.lastManualRetryByUserId ?? null,
      lastError: overrides.lastError ?? 'smtp timeout',
      sentAt: overrides.sentAt ?? null,
      cancelledAt: overrides.cancelledAt ?? null,
      providerMessageId: status === 'SENT' ? 'provider-hash' : null,
      ...(status === 'PROCESSING'
        ? {
            lockToken: `processing-lock-${notificationCounter}`,
            lockedAt: overrides.updatedAt ?? new Date(`2026-07-1${appointmentCounter}T12:04:00.000Z`),
          }
        : {}),
      idempotencyKey: `appointment:${appointment.id}:${notificationCounter}:${overrides.type ?? 'BOOKING_CONFIRMATION'}:EMAIL`,
      payload: {
        customerName: `Notification Client ${appointmentCounter}`,
        barbershopName: 'Notification Ops Shop',
        serviceName: fixtures.service.name,
        employeeName: 'Carlos',
        timezone: 'America/Argentina/Tucuman',
        startAt: startAt.toISOString(),
        publicSlug: null,
        publicReference: null,
      },
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
    },
  });

  return { appointment, notification };
}

beforeAll(async () => {
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'notification_ops_owner',
      email: 'notification-ops-owner@test.com',
      name: 'Owner Ops',
      role: 'OWNER',
    },
  });
  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'notification_ops_barber',
      email: 'notification-ops-barber@test.com',
      name: 'Barber Ops',
      role: 'BARBER',
    },
  });
  const client = await prisma.user.create({
    data: {
      clerkUserId: 'notification_ops_client',
      email: 'notification-ops-client@test.com',
      name: 'Client Ops',
      role: 'CLIENT',
    },
  });
  const ownerOther = await prisma.user.create({
    data: {
      clerkUserId: 'notification_ops_other_owner',
      email: 'notification-ops-other-owner@test.com',
      name: 'Other Owner Ops',
      role: 'OWNER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Notification Ops Shop',
      timezone: 'America/Argentina/Tucuman',
      publicSlug: 'notification-ops-shop',
      isActive: true,
    },
  });
  const shopOther = await prisma.barbershop.create({
    data: {
      ownerId: ownerOther.id,
      name: 'Other Notification Ops Shop',
      timezone: 'America/Argentina/Tucuman',
      publicSlug: 'other-notification-ops-shop',
      isActive: true,
    },
  });

  await setupDefaultWorkingHours(shop.id);
  await setupDefaultWorkingHours(shopOther.id);

  const barber = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberUser.id,
      isActive: true,
    },
  });

  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 3200,
      currency: 'ARS',
      isActive: true,
    },
  });

  await prisma.employeeService.create({
    data: {
      employeeId: barber.id,
      serviceId: service.id,
    },
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barber = { id: barberUser.id, clerkUserId: barberUser.clerkUserId, employeeId: barber.id };
  fixtures.client = { id: client.id, clerkUserId: client.clerkUserId };
  fixtures.ownerOther = { id: ownerOther.id, clerkUserId: ownerOther.clerkUserId };
  fixtures.shop = { id: shop.id, slug: shop.publicSlug ?? 'notification-ops-shop' };
  fixtures.shopOther = { id: shopOther.id };
  fixtures.service = { id: service.id, name: service.name, durationMinutes: service.durationMinutes };
});

beforeEach(async () => {
  appointmentCounter = 0;
  notificationCounter = 0;
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
});

afterAll(async () => {
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('notification operations API', () => {
  it('returns owner summary counts and hides cross-tenant existence', async () => {
    await createAppointmentWithNotification({ status: 'PENDING', attempts: 0, nextAttemptAt: new Date('2026-07-15T10:00:00.000Z') });
    await createAppointmentWithNotification({ status: 'PENDING', attempts: 2, nextAttemptAt: new Date('2026-07-15T10:00:00.000Z') });
    await createAppointmentWithNotification({ status: 'PROCESSING', attempts: 1 });
    await createAppointmentWithNotification({ status: 'SENT', attempts: 1, sentAt: new Date('2026-07-15T12:05:00.000Z'), lastError: null });
    await createAppointmentWithNotification({ status: 'FAILED', attempts: 4 });
    await createAppointmentWithNotification({ status: 'CANCELLED', attempts: 0, cancelledAt: new Date('2026-07-15T12:10:00.000Z'), lastError: null });

    const response = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/notifications/summary`)
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      pending: 2,
      processing: 1,
      sent: 1,
      failed: 1,
      cancelled: 1,
      dueNow: 2,
      retrying: 1,
    });

    const barberResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/notifications/summary`)
      .set(authHeader(fixtures.barber.clerkUserId));
    expect(barberResponse.status).toBe(403);

    const otherOwnerResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/notifications/summary`)
      .set(authHeader(fixtures.ownerOther.clerkUserId));
    expect(otherOwnerResponse.status).toBe(404);
  });

  it('lists masked notification operations with filters and pagination', async () => {
    await createAppointmentWithNotification({
      status: 'FAILED',
      recipientEmail: 'maria@example.com',
      attempts: 4,
      createdAt: new Date('2026-07-15T10:00:00.000Z'),
      updatedAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await createAppointmentWithNotification({
      status: 'FAILED',
      recipientEmail: 'mateo@example.com',
      attempts: 2,
      createdAt: new Date('2026-07-15T11:00:00.000Z'),
      updatedAt: new Date('2026-07-15T13:00:00.000Z'),
    });
    await createAppointmentWithNotification({ status: 'SENT', attempts: 1, sentAt: new Date('2026-07-15T12:05:00.000Z'), lastError: null });

    const response = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/notifications`)
      .query({ status: 'FAILED', limit: 1, page: 1, sort: 'failed' })
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(2);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].maskedRecipient).toBe('m***@example.com');
    expect(response.body.data.items[0]).not.toHaveProperty('recipientEmail');
    expect(response.body.data.items[0]).not.toHaveProperty('payload');
    expect(response.body.data.items[0]).not.toHaveProperty('providerMessageId');
  });

  it('returns safe detail with append-only attempt history', async () => {
    const { notification } = await createAppointmentWithNotification({
      status: 'FAILED',
      attempts: 4,
      manualRetryCount: 1,
      lastManualRetryAt: new Date('2026-07-15T14:00:00.000Z'),
      lastManualRetryByUserId: fixtures.owner.id,
      lastError: 'smtp timeout [redacted-email]',
    });

    await prisma.appointmentNotificationAttempt.createMany({
      data: [
        {
          barbershopId: fixtures.shop.id,
          appointmentNotificationId: notification.id,
          attemptNumber: 1,
          outcome: 'TEMPORARY_FAILURE',
          attemptedAt: new Date('2026-07-15T12:00:00.000Z'),
          completedAt: new Date('2026-07-15T12:00:01.000Z'),
          errorCode: 'ETIMEDOUT',
          sanitizedError: 'timeout [redacted-email]',
          durationMs: 1000,
        },
        {
          barbershopId: fixtures.shop.id,
          appointmentNotificationId: notification.id,
          attemptNumber: 2,
          outcome: 'PERMANENT_FAILURE',
          attemptedAt: new Date('2026-07-15T12:05:00.000Z'),
          completedAt: new Date('2026-07-15T12:05:02.000Z'),
          errorCode: 'E550',
          sanitizedError: 'mailbox unavailable',
          durationMs: 2000,
        },
      ],
    });

    const response = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${notification.id}`)
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(response.status).toBe(200);
    expect(response.body.data.retryEligible).toBe(true);
    expect(response.body.data.maskedRecipient).toBe('c***@example.com');
    expect(response.body.data.attemptsHistory).toHaveLength(2);
    expect(response.body.data.attemptsHistory[0].attemptNumber).toBe(2);
    expect(response.body.data).not.toHaveProperty('recipientEmail');
    expect(response.body.data).not.toHaveProperty('payload');
    expect(response.body.data).not.toHaveProperty('providerMessageId');
  });

  it('allows OWNER manual retry for FAILED notifications without sending inline', async () => {
    const { notification } = await createAppointmentWithNotification({
      status: 'FAILED',
      attempts: 4,
      manualRetryCount: 0,
      lastError: 'smtp timeout [redacted-email]',
    });

    await prisma.appointmentNotificationAttempt.create({
      data: {
        barbershopId: fixtures.shop.id,
        appointmentNotificationId: notification.id,
        attemptNumber: 1,
        outcome: 'PERMANENT_FAILURE',
        attemptedAt: new Date('2026-07-15T12:05:00.000Z'),
        completedAt: new Date('2026-07-15T12:05:02.000Z'),
        errorCode: 'E550',
        sanitizedError: 'mailbox unavailable',
        durationMs: 2000,
      },
    });

    const response = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${notification.id}/retry`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.manualRetryCount).toBe(1);

    const updated = await prisma.appointmentNotification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(updated.status).toBe('PENDING');
    expect(updated.attempts).toBe(0);
    expect(updated.lastError).toBeNull();
    expect(updated.manualRetryCount).toBe(1);
    expect(updated.lastManualRetryByUserId).toBe(fixtures.owner.id);

    const attempts = await prisma.appointmentNotificationAttempt.findMany({
      where: { appointmentNotificationId: notification.id },
    });
    expect(attempts).toHaveLength(1);
  });

  it('rejects retry for non-failed statuses and non-owner callers', async () => {
    const pending = await createAppointmentWithNotification({ status: 'PENDING', attempts: 0, lastError: null });
    const processing = await createAppointmentWithNotification({ status: 'PROCESSING', attempts: 1 });
    const sent = await createAppointmentWithNotification({ status: 'SENT', attempts: 1, sentAt: new Date('2026-07-15T12:05:00.000Z'), lastError: null });
    const cancelled = await createAppointmentWithNotification({ status: 'CANCELLED', attempts: 0, cancelledAt: new Date('2026-07-15T12:10:00.000Z'), lastError: null });

    for (const notificationId of [pending.notification.id, processing.notification.id, sent.notification.id, cancelled.notification.id]) {
      const response = await request(app)
        .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${notificationId}/retry`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({});
      expect(response.status).toBe(400);
    }

    const { notification: failed } = await createAppointmentWithNotification({ status: 'FAILED', attempts: 4 });

    const barberResponse = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${failed.id}/retry`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({});
    expect(barberResponse.status).toBe(403);

    const clientResponse = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${failed.id}/retry`)
      .set(authHeader(fixtures.client.clerkUserId))
      .send({});
    expect(clientResponse.status).toBe(403);

    const otherOwnerResponse = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${failed.id}/retry`)
      .set(authHeader(fixtures.ownerOther.clerkUserId))
      .send({});
    expect(otherOwnerResponse.status).toBe(404);
  });

  it('handles concurrent retry requests with one success and one deterministic conflict', async () => {
    const { notification } = await createAppointmentWithNotification({ status: 'FAILED', attempts: 4 });

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${notification.id}/retry`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({}),
      request(app)
        .post(`/api/v1/barbershops/${fixtures.shop.id}/notifications/${notification.id}/retry`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({}),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const updated = await prisma.appointmentNotification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(updated.status).toBe('PENDING');
    expect(updated.manualRetryCount).toBe(1);
  });
});
