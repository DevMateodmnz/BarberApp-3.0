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
  barberA: { userId: string; clerkUserId: string; employeeId: string };
  barberB: { userId: string; clerkUserId: string; employeeId: string };
  client: { id: string; clerkUserId: string };
  shop: { id: string; slug: string };
  serviceA: { id: string };
  serviceB: { id: string };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function isoAtLocal(localDate: string, localTime: string) {
  return localDateTimeToUtc(localDate, localTime, TEST_BARBERSHOP_TIMEZONE).toISOString();
}

async function createConfirmedStaffAppointment(input?: {
  employeeId?: string;
  serviceId?: string;
  startAt?: string;
  clientEmail?: string;
}) {
  const localDate = getNextLocalWeekdayDate(
    3,
    new Date(Date.now() + 5 * 24 * 60 * 60_000),
    TEST_BARBERSHOP_TIMEZONE
  );
  const createResponse = await request(app)
    .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
    .set(authHeader(fixtures.owner.clerkUserId))
    .send({
      employeeId: input?.employeeId ?? fixtures.barberA.employeeId,
      serviceId: input?.serviceId ?? fixtures.serviceA.id,
      startAt: input?.startAt ?? isoAtLocal(localDate, '10:00'),
      clientName: 'Reschedule Client',
      clientPhone: '+543811234599',
      clientEmail: input?.clientEmail ?? 'reschedule@test.com',
    });

  expect(createResponse.status).toBe(201);

  const confirmResponse = await request(app)
    .put(`/api/v1/appointments/${createResponse.body.data.id}/status`)
    .set(authHeader(fixtures.owner.clerkUserId))
    .send({ status: 'CONFIRMED' });

  expect(confirmResponse.status).toBe(200);
  return createResponse.body.data.id as string;
}

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointmentChange.deleteMany();
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
      clerkUserId: 'resched_owner_clerk',
      email: 'resched-owner@test.com',
      name: 'Owner Reschedule',
      role: 'OWNER',
    },
  });
  const barberAUser = await prisma.user.create({
    data: {
      clerkUserId: 'resched_barber_a_clerk',
      email: 'barber-a@test.com',
      name: 'Carlos',
      role: 'BARBER',
    },
  });
  const barberBUser = await prisma.user.create({
    data: {
      clerkUserId: 'resched_barber_b_clerk',
      email: 'barber-b@test.com',
      name: 'María',
      role: 'BARBER',
    },
  });
  const client = await prisma.user.create({
    data: {
      clerkUserId: 'resched_client_clerk',
      email: 'resched-client@test.com',
      name: 'Client User',
      role: 'CLIENT',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Reschedule Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'reschedule-shop',
      isActive: true,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const barberA = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberAUser.id,
      isActive: true,
    },
  });
  const barberB = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberBUser.id,
      isActive: true,
    },
  });

  const serviceA = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 3200,
      currency: 'ARS',
      isActive: true,
    },
  });
  const serviceB = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Premium Cut',
      durationMinutes: 45,
      priceCents: 4500,
      currency: 'ARS',
      isActive: true,
    },
  });

  await prisma.employeeService.createMany({
    data: [
      { employeeId: barberA.id, serviceId: serviceA.id },
      { employeeId: barberB.id, serviceId: serviceA.id },
      { employeeId: barberB.id, serviceId: serviceB.id },
    ],
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barberA = {
    userId: barberAUser.id,
    clerkUserId: barberAUser.clerkUserId,
    employeeId: barberA.id,
  };
  fixtures.barberB = {
    userId: barberBUser.id,
    clerkUserId: barberBUser.clerkUserId,
    employeeId: barberB.id,
  };
  fixtures.client = { id: client.id, clerkUserId: client.clerkUserId };
  fixtures.shop = { id: shop.id, slug: shop.publicSlug ?? 'reschedule-shop' };
  fixtures.serviceA = { id: serviceA.id };
  fixtures.serviceB = { id: serviceB.id };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointmentChange.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
});

afterAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotificationAttempt.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointmentChange.deleteMany();
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

describe('appointment rescheduling', () => {
  it('reschedules a confirmed appointment atomically, writes audit history, and schedules a reschedule email', async () => {
    const appointmentId = await createConfirmedStaffAppointment();
    const nextDate = getNextLocalWeekdayDate(
      4,
      new Date(Date.now() + 7 * 24 * 60 * 60_000),
      TEST_BARBERSHOP_TIMEZONE
    );

    const response = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/reschedule`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barberB.employeeId,
        serviceId: fixtures.serviceB.id,
        startAt: isoAtLocal(nextDate, '13:00'),
        reason: 'El cliente pidió otro horario',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.employeeId).toBe(fixtures.barberB.employeeId);
    expect(response.body.data.serviceId).toBe(fixtures.serviceB.id);
    expect(response.body.data.status).toBe('CONFIRMED');

    const changes = await prisma.appointmentChange.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'asc' },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.reason).toBe('El cliente pidió otro horario');
    expect(changes[0]?.previousEmployeeId).toBe(fixtures.barberA.employeeId);
    expect(changes[0]?.newEmployeeId).toBe(fixtures.barberB.employeeId);

    const history = await request(app)
      .get(`/api/v1/appointments/${appointmentId}/changes`)
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].reason).toBe('El cliente pidió otro horario');

    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });

    expect(notifications.some((item) => item.type === 'APPOINTMENT_RESCHEDULED')).toBe(true);
    expect(
      notifications.filter((item) => item.type === 'REMINDER_24H' && item.status === 'CANCELLED')
        .length
    ).toBe(1);
    expect(
      notifications.filter((item) => item.type === 'REMINDER_24H' && item.status === 'PENDING')
        .length
    ).toBe(1);
  });

  it('forbids clients and prevents barbers from moving appointments onto another barber schedule', async () => {
    const appointmentId = await createConfirmedStaffAppointment();
    const nextDate = getNextLocalWeekdayDate(4, new Date(), TEST_BARBERSHOP_TIMEZONE);

    const clientAttempt = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/reschedule`)
      .set(authHeader(fixtures.client.clerkUserId))
      .send({
        startAt: isoAtLocal(nextDate, '11:00'),
      });

    expect(clientAttempt.status).toBe(403);

    const barberAttempt = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/reschedule`)
      .set(authHeader(fixtures.barberA.clerkUserId))
      .send({
        employeeId: fixtures.barberB.employeeId,
        startAt: isoAtLocal(nextDate, '12:00'),
      });

    expect(barberAttempt.status).toBe(403);
    expect(barberAttempt.body.error.code).toBe('FORBIDDEN_EMPLOYEE_SCOPE');
  });

  it('allows only one winning concurrent reschedule for the same appointment', async () => {
    const appointmentId = await createConfirmedStaffAppointment();
    const targetDate = getNextLocalWeekdayDate(4, new Date(), TEST_BARBERSHOP_TIMEZONE);

    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/v1/appointments/${appointmentId}/reschedule`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ startAt: isoAtLocal(targetDate, '14:00') }),
      request(app)
        .patch(`/api/v1/appointments/${appointmentId}/reschedule`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ startAt: isoAtLocal(targetDate, '15:00') }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await prisma.appointmentChange.count({ where: { appointmentId } })).toBe(1);
  });

  it('lets only one appointment win a race for the same destination slot', async () => {
    const firstAppointmentId = await createConfirmedStaffAppointment({
      startAt: isoAtLocal(getNextLocalWeekdayDate(3, new Date(), TEST_BARBERSHOP_TIMEZONE), '10:00'),
    });
    const secondAppointmentId = await createConfirmedStaffAppointment({
      startAt: isoAtLocal(getNextLocalWeekdayDate(3, new Date(), TEST_BARBERSHOP_TIMEZONE), '11:00'),
      clientEmail: 'other-reschedule@test.com',
    });

    const targetStartAt = isoAtLocal(
      getNextLocalWeekdayDate(4, new Date(), TEST_BARBERSHOP_TIMEZONE),
      '16:00'
    );

    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/v1/appointments/${firstAppointmentId}/reschedule`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ startAt: targetStartAt }),
      request(app)
        .patch(`/api/v1/appointments/${secondAppointmentId}/reschedule`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ startAt: targetStartAt }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it('keeps public confirmation references valid after a staff reschedule', async () => {
    const createResponse = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', 'public-reschedule-reference')
      .send({
        serviceId: fixtures.serviceA.id,
        barberId: fixtures.barberA.employeeId,
        startAt: isoAtLocal(getNextLocalWeekdayDate(3, new Date(), TEST_BARBERSHOP_TIMEZONE), '12:00'),
        clientName: 'Public Client',
        clientPhone: '+543811234588',
        clientEmail: 'public-reschedule@test.com',
        consentAccepted: true,
        consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
      });

    expect(createResponse.status).toBe(201);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { publicReference: createResponse.body.data.bookingReference },
    });

    const rescheduleDate = getNextLocalWeekdayDate(5, new Date(), TEST_BARBERSHOP_TIMEZONE);
    const rescheduleResponse = await request(app)
      .patch(`/api/v1/appointments/${appointment.id}/reschedule`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        startAt: isoAtLocal(rescheduleDate, '13:30'),
      });

    expect(rescheduleResponse.status).toBe(200);

    const publicConfirmation = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${createResponse.body.data.bookingReference}`);

    expect(publicConfirmation.status).toBe(200);
    expect(publicConfirmation.body.data.bookingReference).toBe(createResponse.body.data.bookingReference);
    expect(publicConfirmation.body.data.startAt).toBe(rescheduleResponse.body.data.startAt);
  });
});
