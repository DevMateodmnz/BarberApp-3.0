import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createAppFromEnv } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import { getNextLocalWeekdayDate } from '../helpers/timezone.js';

const app = createAppFromEnv();
const TIMEZONE = 'America/Argentina/Tucuman';

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barberAUser: { id: string; clerkUserId: string };
  barberBUser: { id: string; clerkUserId: string };
  clientUser: { id: string; clerkUserId: string };
  shop: { id: string; slug: string };
  otherShop: { id: string };
  barberA: { id: string };
  barberB: { id: string };
  service30: { id: string; durationMinutes: number };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function setDefaultWorkingHours(barbershopId: string) {
  await prisma.workingHours.deleteMany({ where: { barbershopId } });
  await prisma.workingHours.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      barbershopId,
      dayOfWeek,
      openTime: '09:00',
      closeTime: '19:00',
      isActive: true,
    })).concat({
      barbershopId,
      dayOfWeek: 6,
      openTime: '09:00',
      closeTime: '14:00',
      isActive: true,
    }),
  });
}

function localUtc(localDate: string, localTime: string) {
  return localDateTimeToUtc(localDate, localTime, TIMEZONE).toISOString();
}

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'employee_schedule_owner',
      email: 'employee_schedule_owner@example.com',
      name: 'Schedule Owner',
      role: 'OWNER',
    },
  });
  const barberAUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_schedule_barber_a',
      email: 'employee_schedule_barber_a@example.com',
      name: 'Barber A',
      role: 'BARBER',
    },
  });
  const barberBUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_schedule_barber_b',
      email: 'employee_schedule_barber_b@example.com',
      name: 'Barber B',
      role: 'BARBER',
    },
  });
  const clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'employee_schedule_client',
      email: 'employee_schedule_client@example.com',
      name: 'Schedule Client',
      role: 'CLIENT',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Employee Schedule Shop',
      timezone: TIMEZONE,
      publicSlug: 'employee-schedule-shop',
    },
  });
  const otherShop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Employee Schedule Other Shop',
      timezone: TIMEZONE,
    },
  });

  const barberA = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberAUser.id,
    },
  });
  const barberB = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberBUser.id,
    },
  });

  const service30 = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Employee Schedule Cut',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
      isActive: true,
    },
  });

  await prisma.employeeService.createMany({
    data: [
      { employeeId: barberA.id, serviceId: service30.id },
      { employeeId: barberB.id, serviceId: service30.id },
    ],
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barberAUser = { id: barberAUser.id, clerkUserId: barberAUser.clerkUserId };
  fixtures.barberBUser = { id: barberBUser.id, clerkUserId: barberBUser.clerkUserId };
  fixtures.clientUser = { id: clientUser.id, clerkUserId: clientUser.clerkUserId };
  fixtures.shop = { id: shop.id, slug: 'employee-schedule-shop' };
  fixtures.otherShop = { id: otherShop.id };
  fixtures.barberA = { id: barberA.id };
  fixtures.barberB = { id: barberB.id };
  fixtures.service30 = { id: service30.id, durationMinutes: service30.durationMinutes };

  await setDefaultWorkingHours(shop.id);
  await setDefaultWorkingHours(otherShop.id);
});

beforeEach(async () => {
  await prisma.appointmentNotificationAttempt.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointmentNotification.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointmentChange.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointment.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.employeeScheduleExceptionInterval.deleteMany();
  await prisma.employeeScheduleException.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.employeeWorkingInterval.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.employee.updateMany({
    where: { barbershopId: fixtures.shop.id },
    data: { scheduleMode: 'INHERIT_BARBERSHOP' },
  });
  await setDefaultWorkingHours(fixtures.shop.id);
});

afterAll(async () => {
  await prisma.appointmentNotificationAttempt.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointmentNotification.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointmentChange.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.appointment.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.employeeScheduleExceptionInterval.deleteMany();
  await prisma.employeeScheduleException.deleteMany();
  await prisma.employeeWorkingInterval.deleteMany();
  await prisma.employeeService.deleteMany({
    where: { employeeId: { in: [fixtures.barberA.id, fixtures.barberB.id] } },
  });
  await prisma.service.deleteMany({ where: { barbershopId: fixtures.shop.id } });
  await prisma.employee.deleteMany({ where: { id: { in: [fixtures.barberA.id, fixtures.barberB.id] } } });
  await prisma.workingHours.deleteMany({ where: { barbershopId: { in: [fixtures.shop.id, fixtures.otherShop.id] } } });
  await prisma.barbershop.deleteMany({ where: { id: { in: [fixtures.shop.id, fixtures.otherShop.id] } } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          fixtures.owner.id,
          fixtures.barberAUser.id,
          fixtures.barberBUser.id,
          fixtures.clientUser.id,
        ],
      },
    },
  });
});

describe('employee schedules API', () => {
  it('lets owners update employee schedules and returns future conflicts without mutating appointments', async () => {
    const localDate = getNextLocalWeekdayDate(1, new Date(), TIMEZONE);
    const startAt = localUtc(localDate, '16:00');
    const endAt = localUtc(localDate, '16:30');

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shop.id,
        employeeId: fixtures.barberA.id,
        clientId: fixtures.clientUser.id,
        serviceId: fixtures.service30.id,
        clientName: 'Future Client',
        clientEmail: 'future@example.com',
        serviceName: 'Employee Schedule Cut',
        servicePriceCents: 3000,
        serviceDurationMinutes: 30,
        serviceCurrency: 'ARS',
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        status: 'CONFIRMED',
      },
    });

    const baseline = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/employees/${fixtures.barberA.id}/schedule`)
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(baseline.status).toBe(200);

    const response = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shop.id}/employees/${fixtures.barberA.id}/schedule`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        mode: 'CUSTOM',
        expectedUpdatedAt: baseline.body.data.expectedUpdatedAt,
        weeklyIntervals: [
          { dayOfWeek: 1, start: '10:00', end: '14:00' },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.scheduleMode).toBe('CUSTOM');
    expect(response.body.data.conflictingFutureAppointmentsCount).toBe(1);
    expect(response.body.data.conflictingFutureAppointments[0]).toMatchObject({
      customerDisplayName: 'Future Client',
      reasonCode: 'OUTSIDE_CUSTOM_HOURS',
    });

    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { employeeId: fixtures.barberA.id, barbershopId: fixtures.shop.id },
      select: { startAt: true, endAt: true, status: true },
    });
    expect(appointment.startAt.toISOString()).toBe(startAt);
    expect(appointment.endAt.toISOString()).toBe(endAt);
    expect(appointment.status).toBe('CONFIRMED');
  });

  it('lets barbers read only their own schedule and hides private reasons', async () => {
    const localDate = getNextLocalWeekdayDate(1, new Date(), TIMEZONE);
    await prisma.employeeScheduleException.create({
      data: {
        barbershopId: fixtures.shop.id,
        employeeId: fixtures.barberA.id,
        localDate,
        type: 'FULL_DAY_OFF',
        reason: 'Vacaciones privadas',
      },
    });

    const ownSchedule = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/employees/${fixtures.barberA.id}/schedule`)
      .set(authHeader(fixtures.barberAUser.clerkUserId));

    expect(ownSchedule.status).toBe(200);
    expect(ownSchedule.body.data.upcomingExceptions[0].reason).toBeNull();

    const otherSchedule = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/employees/${fixtures.barberB.id}/schedule`)
      .set(authHeader(fixtures.barberAUser.clerkUserId));

    expect(otherSchedule.status).toBe(404);
  });

  it('makes public availability respect custom employee schedules and rejects crafted public bookings outside them', async () => {
    const localDate = getNextLocalWeekdayDate(1, new Date(), TIMEZONE);

    await prisma.employee.update({
      where: { id: fixtures.barberA.id },
      data: { scheduleMode: 'CUSTOM' },
    });
    await prisma.employeeWorkingInterval.create({
      data: {
        barbershopId: fixtures.shop.id,
        employeeId: fixtures.barberA.id,
        dayOfWeek: 1,
        openTime: '10:00',
        closeTime: '12:00',
      },
    });

    const availability = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.shop.slug}/barbers/${fixtures.barberA.id}/availability`)
      .query({
        serviceId: fixtures.service30.id,
        localDate,
      });

    expect(availability.status).toBe(200);
    expect(availability.body.data.slots.length).toBeGreaterThan(0);
    expect(availability.body.data.slots[0].startAt).toBe(localUtc(localDate, '10:00'));
    expect(
      availability.body.data.slots.every((slot: { startAt: string }) => slot.startAt < localUtc(localDate, '12:00')),
    ).toBe(true);

    const craftedBooking = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', `outside-hours-${Date.now()}`)
      .send({
        serviceId: fixtures.service30.id,
        barberId: fixtures.barberA.id,
        startAt: localUtc(localDate, '15:00'),
        clientName: 'Public Client',
        clientPhone: '+543811234567',
        consentAccepted: true,
        consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
      });

    expect(craftedBooking.status).toBe(409);
    expect(craftedBooking.body.error.code).toBe('PUBLIC_BOOKING_SLOT_UNAVAILABLE');
  });

  it('blocks staff booking and rescheduling outside the effective employee schedule', async () => {
    const localDate = getNextLocalWeekdayDate(1, new Date(), TIMEZONE);

    await prisma.employee.update({
      where: { id: fixtures.barberA.id },
      data: { scheduleMode: 'CUSTOM' },
    });
    await prisma.employeeWorkingInterval.create({
      data: {
        barbershopId: fixtures.shop.id,
        employeeId: fixtures.barberA.id,
        dayOfWeek: 1,
        openTime: '10:00',
        closeTime: '12:00',
      },
    });

    const createOutside = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barberA.id,
        serviceId: fixtures.service30.id,
        startAt: localUtc(localDate, '15:00'),
        clientName: 'Walk-in Client',
      });

    expect(createOutside.status).toBe(400);
    expect(createOutside.body.error.code).toBe('EMPLOYEE_SCHEDULE_CONFLICT');

    const validAppointment = await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shop.id,
        employeeId: fixtures.barberA.id,
        clientId: fixtures.clientUser.id,
        serviceId: fixtures.service30.id,
        clientName: 'Reschedule Client',
        clientEmail: 'reschedule@example.com',
        serviceName: 'Employee Schedule Cut',
        servicePriceCents: 3000,
        serviceDurationMinutes: 30,
        serviceCurrency: 'ARS',
        startAt: localDateTimeToUtc(localDate, '10:00', TIMEZONE),
        endAt: localDateTimeToUtc(localDate, '10:30', TIMEZONE),
        status: 'CONFIRMED',
      },
    });

    const rescheduleOutside = await request(app)
      .patch(`/api/v1/appointments/${validAppointment.id}/reschedule`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        startAt: localUtc(localDate, '16:00'),
      });

    expect(rescheduleOutside.status).toBe(400);
    expect(rescheduleOutside.body.error.code).toBe('EMPLOYEE_SCHEDULE_CONFLICT');

    const unchanged = await prisma.appointment.findUniqueOrThrow({
      where: { id: validAppointment.id },
      select: { startAt: true, endAt: true },
    });
    expect(unchanged.startAt.toISOString()).toBe(localUtc(localDate, '10:00'));
    expect(unchanged.endAt.toISOString()).toBe(localUtc(localDate, '10:30'));
  });
});
