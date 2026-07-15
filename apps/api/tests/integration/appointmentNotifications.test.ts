import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { TEST_BARBERSHOP_TIMEZONE, getNextLocalWeekdayDate } from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  client: { id: string; clerkUserId: string };
  shop: { id: string; slug: string };
  service: { id: string; name: string; durationMinutes: number };
  ownerOther: { id: string; clerkUserId: string };
  shopOther: { id: string };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function nextWeekdayLocalDate() {
  return getNextLocalWeekdayDate(1, new Date(), TEST_BARBERSHOP_TIMEZONE);
}

function isoAtLocal(localDate: string, localTime: string) {
  return localDateTimeToUtc(localDate, localTime, TEST_BARBERSHOP_TIMEZONE).toISOString();
}

beforeAll(async () => {
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
      clerkUserId: 'notifications_owner_clerk',
      email: 'notifications-owner@test.com',
      name: 'Owner Notifications',
      role: 'OWNER',
    },
  });
  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'notifications_barber_clerk',
      email: 'notifications-barber@test.com',
      name: 'Carlos',
      role: 'BARBER',
    },
  });
  const client = await prisma.user.create({
    data: {
      clerkUserId: 'notifications_client_clerk',
      email: 'notifications-client@test.com',
      name: 'Client User',
      role: 'CLIENT',
    },
  });
  const ownerOther = await prisma.user.create({
    data: {
      clerkUserId: 'notifications_other_owner_clerk',
      email: 'notifications-other-owner@test.com',
      name: 'Other Owner',
      role: 'OWNER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Notification Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'notification-shop',
      isActive: true,
    },
  });
  const shopOther = await prisma.barbershop.create({
    data: {
      ownerId: ownerOther.id,
      name: 'Other Notification Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'other-notification-shop',
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
  fixtures.barber = {
    id: barberUser.id,
    clerkUserId: barberUser.clerkUserId,
    employeeId: barber.id,
  };
  fixtures.client = { id: client.id, clerkUserId: client.clerkUserId };
  fixtures.shop = { id: shop.id, slug: shop.publicSlug ?? 'notification-shop' };
  fixtures.service = {
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
  };
  fixtures.ownerOther = { id: ownerOther.id, clerkUserId: ownerOther.clerkUserId };
  fixtures.shopOther = { id: shopOther.id };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
});

afterAll(async () => {
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

describe('appointment notification scheduling and visibility', () => {
  it('schedules booking confirmation and 24h reminder for staff-created appointments with email', async () => {
    const localDate = nextWeekdayLocalDate();
    const startAt = isoAtLocal(localDate, '10:00');

    const response = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt,
        clientName: 'Mateo',
        clientPhone: '+543811234567',
        clientEmail: 'mateo@example.com',
        notes: 'Prefiere tijera',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.notifications).toHaveLength(2);

    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: response.body.data.id },
      orderBy: { scheduledFor: 'asc' },
    });

    expect(notifications.map((item) => item.type)).toEqual([
      'BOOKING_CONFIRMATION',
      'REMINDER_24H',
    ]);
    expect(notifications[0]?.recipientEmail).toBe('mateo@example.com');

    const ownerSummary = await request(app)
      .get(`/api/v1/appointments/${response.body.data.id}/notifications`)
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(ownerSummary.status).toBe(200);
    expect(ownerSummary.body.data).toHaveLength(2);
    expect(ownerSummary.body.data[0]).not.toHaveProperty('recipientEmail');
    expect(ownerSummary.body.data[0]).not.toHaveProperty('payload');

    const barberSummary = await request(app)
      .get(`/api/v1/appointments/${response.body.data.id}/notifications`)
      .set(authHeader(fixtures.barber.clerkUserId));

    expect(barberSummary.status).toBe(200);

    const clientSummary = await request(app)
      .get(`/api/v1/appointments/${response.body.data.id}/notifications`)
      .set(authHeader(fixtures.client.clerkUserId));

    expect(clientSummary.status).toBe(403);

    const crossTenantSummary = await request(app)
      .get(`/api/v1/appointments/${response.body.data.id}/notifications`)
      .set(authHeader(fixtures.ownerOther.clerkUserId));

    expect(crossTenantSummary.status).toBe(404);
  });

  it('does not schedule notifications when no email is provided', async () => {
    const localDate = nextWeekdayLocalDate();
    const startAt = isoAtLocal(localDate, '11:00');

    const response = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt,
        clientName: 'Walk In',
        clientPhone: '+543811234568',
      });

    expect(response.status).toBe(201);
    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: response.body.data.id },
    });
    expect(notifications).toHaveLength(0);
  });

  it('reschedules reminders and cancels obsolete pending rows', async () => {
    const localDate = nextWeekdayLocalDate();
    const initialStartAt = isoAtLocal(localDate, '12:00');
    const createResponse = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: initialStartAt,
        clientName: 'Reschedule Me',
        clientPhone: '+543811234569',
        clientEmail: 'reschedule@example.com',
      });

    expect(createResponse.status).toBe(201);
    const appointmentId = createResponse.body.data.id as string;
    const before = await prisma.appointmentNotification.findMany({
      where: { appointmentId, type: 'REMINDER_24H' },
      orderBy: { scheduledFor: 'asc' },
    });
    expect(before).toHaveLength(1);

    const nextDate = getNextLocalWeekdayDate(2, new Date(), TEST_BARBERSHOP_TIMEZONE);
    const rescheduleResponse = await request(app)
      .put(`/api/v1/appointments/${appointmentId}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        startAt: isoAtLocal(nextDate, '13:00'),
      });

    expect(rescheduleResponse.status).toBe(200);
    const reminders = await prisma.appointmentNotification.findMany({
      where: { appointmentId, type: 'REMINDER_24H' },
      orderBy: { createdAt: 'asc' },
    });

    expect(reminders).toHaveLength(2);
    expect(reminders[0]?.status).toBe('CANCELLED');
    expect(reminders[1]?.status).toBe('PENDING');
    expect(reminders[0]?.idempotencyKey).not.toBe(reminders[1]?.idempotencyKey);
  });

  it('keeps public booking idempotency to one notification set and cancels pending rows on public cancellation', async () => {
    const localDate = nextWeekdayLocalDate();
    const startAt = isoAtLocal(localDate, '14:00');
    const payload = {
      serviceId: fixtures.service.id,
      barberId: fixtures.barber.employeeId,
      startAt,
      clientName: 'Public Guest',
      clientPhone: '+543811234570',
      clientEmail: 'public@example.com',
      consentAccepted: true,
      consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
    };

    const first = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', 'public_notification_same_key')
      .send(payload);
    const replay = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', 'public_notification_same_key')
      .send(payload);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { publicReference: first.body.data.bookingReference },
    });
    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(notifications).toHaveLength(2);

    const cancelResponse = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${first.body.data.bookingReference}/cancel`)
      .send({});

    expect(cancelResponse.status).toBe(200);

    const cancelledNotifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: appointment.id },
      orderBy: { type: 'asc' },
    });
    expect(cancelledNotifications.every((item) => item.status === 'CANCELLED')).toBe(true);
  });
});
