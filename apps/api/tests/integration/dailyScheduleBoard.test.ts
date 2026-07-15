import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type {
  Appointment,
  Barbershop,
  Employee,
  Prisma,
  Service,
  User,
} from '@prisma/client';

import { createAppFromEnv } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { getLocalDateStringInTimeZone, localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { getDailyScheduleBoard } from '../../src/services/scheduleBoardService.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();
const FROZEN_NOW = new Date('2026-07-20T13:15:00.000Z');
const RUN_ID = `daily-schedule-board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Fixtures {
  owner: User;
  ownerOther: User;
  barberA: { user: User; employee: Employee };
  barberB: { user: User; employee: Employee };
  client: User;
  shop: Barbershop;
  otherShop: Barbershop;
  service30: Service;
  service45: Service;
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function isoAtLocal(date: string, time: string): string {
  return localDateTimeToUtc(date, time, TEST_BARBERSHOP_TIMEZONE).toISOString();
}

async function setDefaultWorkingHours(barbershopId: string) {
  await prisma.workingHours.deleteMany({ where: { barbershopId } });

  await prisma.workingHours.createMany({
    data: [
      { barbershopId, dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', isActive: true },
      { barbershopId, dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', isActive: true },
      { barbershopId, dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', isActive: true },
      { barbershopId, dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', isActive: true },
      { barbershopId, dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', isActive: true },
      { barbershopId, dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', isActive: true },
    ],
  });
}

async function createCustomer(input: {
  barbershopId: string;
  name: string;
  phone: string;
  email?: string | null;
  firstSeenAt: Date;
  lastSeenAt?: Date;
}) {
  return prisma.customer.create({
    data: {
      barbershopId: input.barbershopId,
      name: input.name,
      phone: input.phone,
      phoneNormalized: input.phone,
      email: input.email ?? null,
      firstSeenAt: input.firstSeenAt,
      lastSeenAt: input.lastSeenAt ?? input.firstSeenAt,
    },
  });
}

async function createAppointment(input: {
  barbershopId: string;
  employeeId: string;
  service: Service;
  customerId?: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  startAt: string;
  status: Prisma.AppointmentCreateInput['status'];
  clientId?: string | null;
  notes?: string | null;
}): Promise<Appointment> {
  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + input.service.durationMinutes * 60_000);

  return prisma.appointment.create({
    data: {
      barbershopId: input.barbershopId,
      employeeId: input.employeeId,
      clientId: input.clientId ?? null,
      customerId: input.customerId ?? null,
      serviceId: input.service.id,
      clientName: input.clientName,
      clientPhone: input.clientPhone ?? null,
      clientPhoneNormalized: input.clientPhone ?? null,
      clientEmail: input.clientEmail ?? null,
      serviceName: input.service.name,
      servicePriceCents: input.service.priceCents,
      serviceDurationMinutes: input.service.durationMinutes,
      serviceCurrency: input.service.currency,
      startAt,
      endAt,
      status: input.status,
      notes: input.notes ?? null,
      confirmedAt: input.status === 'CONFIRMED' ? startAt : null,
      startedAt: input.status === 'IN_PROGRESS' ? startAt : null,
      completedAt: input.status === 'COMPLETED' ? endAt : null,
      noShowAt: input.status === 'NO_SHOW' ? endAt : null,
      cancelledAt: input.status === 'CANCELLED' ? endAt : null,
      cancelledByRole: input.status === 'CANCELLED' ? 'OWNER' : null,
      cancellationSource: input.status === 'CANCELLED' ? 'STAFF' : null,
    },
  });
}

beforeAll(async () => {
  fixtures.owner = await prisma.user.create({
    data: {
      clerkUserId: `schedule-owner-${RUN_ID}`,
      email: `schedule-owner-${RUN_ID}@test.com`,
      name: 'Schedule Owner',
      role: 'OWNER',
    },
  });

  fixtures.ownerOther = await prisma.user.create({
    data: {
      clerkUserId: `schedule-owner-other-${RUN_ID}`,
      email: `schedule-owner-other-${RUN_ID}@test.com`,
      name: 'Schedule Owner Other',
      role: 'OWNER',
    },
  });

  fixtures.shop = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.owner.id,
      name: 'Agenda Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
    },
  });

  fixtures.otherShop = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerOther.id,
      name: 'Other Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
    },
  });

  const barberAUser = await prisma.user.create({
    data: {
      clerkUserId: `schedule-barber-a-${RUN_ID}`,
      email: `schedule-barber-a-${RUN_ID}@test.com`,
      name: 'Barber A',
      role: 'BARBER',
    },
  });
  const barberBUser = await prisma.user.create({
    data: {
      clerkUserId: `schedule-barber-b-${RUN_ID}`,
      email: `schedule-barber-b-${RUN_ID}@test.com`,
      name: 'Barber B',
      role: 'BARBER',
    },
  });
  fixtures.barberA = {
    user: barberAUser,
    employee: await prisma.employee.create({
      data: {
        barbershopId: fixtures.shop.id,
        userId: barberAUser.id,
      },
    }),
  };
  fixtures.barberB = {
    user: barberBUser,
    employee: await prisma.employee.create({
      data: {
        barbershopId: fixtures.shop.id,
        userId: barberBUser.id,
      },
    }),
  };

  fixtures.client = await prisma.user.create({
    data: {
      clerkUserId: `schedule-client-${RUN_ID}`,
      email: `schedule-client-${RUN_ID}@test.com`,
      name: 'Schedule Client',
      role: 'CLIENT',
    },
  });

  fixtures.service30 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shop.id,
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 2000,
      currency: 'ARS',
    },
  });

  fixtures.service45 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shop.id,
      name: 'Cut + Beard',
      durationMinutes: 45,
      priceCents: 3200,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.createMany({
    data: [
      { employeeId: fixtures.barberA.employee.id, serviceId: fixtures.service30.id },
      { employeeId: fixtures.barberA.employee.id, serviceId: fixtures.service45.id },
      { employeeId: fixtures.barberB.employee.id, serviceId: fixtures.service45.id },
    ],
  });

  await setDefaultWorkingHours(fixtures.shop.id);
  await setDefaultWorkingHours(fixtures.otherShop.id);
});

beforeEach(async () => {
  const barbershopIds = [fixtures.shop.id, fixtures.otherShop.id];

  await prisma.appointmentNotificationAttempt.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointmentNotification.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointmentChange.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.serviceRecord.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointment.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.customer.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.barbershopScheduleExceptionInterval.deleteMany({
    where: {
      scheduleException: {
        barbershopId: { in: barbershopIds },
      },
    },
  });
  await prisma.barbershopScheduleException.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await setDefaultWorkingHours(fixtures.shop.id);
  await setDefaultWorkingHours(fixtures.otherShop.id);
});

afterAll(async () => {
  const barbershopIds = [fixtures.shop.id, fixtures.otherShop.id];
  const employeeIds = [fixtures.barberA.employee.id, fixtures.barberB.employee.id];
  const userIds = [
    fixtures.owner.id,
    fixtures.ownerOther.id,
    fixtures.barberA.user.id,
    fixtures.barberB.user.id,
    fixtures.client.id,
  ];
  const serviceIds = [fixtures.service30.id, fixtures.service45.id];

  await prisma.appointmentNotificationAttempt.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointmentNotification.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointmentChange.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.serviceRecord.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.appointment.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.customer.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.barbershopScheduleExceptionInterval.deleteMany({
    where: {
      scheduleException: {
        barbershopId: { in: barbershopIds },
      },
    },
  });
  await prisma.barbershopScheduleException.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.workingHours.deleteMany({
    where: { barbershopId: { in: barbershopIds } },
  });
  await prisma.employeeService.deleteMany({
    where: {
      OR: [
        { employeeId: { in: employeeIds } },
        { serviceId: { in: serviceIds } },
      ],
    },
  });
  await prisma.service.deleteMany({
    where: { id: { in: serviceIds } },
  });
  await prisma.employee.deleteMany({
    where: { id: { in: employeeIds } },
  });
  await prisma.barbershop.deleteMany({
    where: { id: { in: barbershopIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
});

describe('daily schedule board', () => {
  it('returns a privacy-safe operational payload with customer context, clipped gaps, and exception closures', async () => {
    const localDate = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FROZEN_NOW);

    const scheduleException = await prisma.barbershopScheduleException.create({
      data: {
        barbershopId: fixtures.shop.id,
        localDate,
        isClosed: false,
      },
    });
    await prisma.barbershopScheduleExceptionInterval.createMany({
      data: [
        {
          scheduleExceptionId: scheduleException.id,
          openTime: '09:00',
          closeTime: '12:00',
          position: 0,
        },
        {
          scheduleExceptionId: scheduleException.id,
          openTime: '13:00',
          closeTime: '18:00',
          position: 1,
        },
      ],
    });

    const returningCustomer = await createCustomer({
      barbershopId: fixtures.shop.id,
      name: 'Returning Customer',
      phone: '+5493815000001',
      firstSeenAt: new Date('2026-06-10T13:00:00.000Z'),
    });
    const noShowCustomer = await createCustomer({
      barbershopId: fixtures.shop.id,
      name: 'No Show Customer',
      phone: '+5493815000002',
      firstSeenAt: new Date('2026-06-11T13:00:00.000Z'),
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      customerId: returningCustomer.id,
      clientName: returningCustomer.name,
      clientPhone: returningCustomer.phone,
      clientEmail: 'returning@test.com',
      startAt: '2026-06-11T13:00:00.000Z',
      status: 'COMPLETED',
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      customerId: noShowCustomer.id,
      clientName: noShowCustomer.name,
      clientPhone: noShowCustomer.phone,
      clientEmail: 'no-show@test.com',
      startAt: '2026-06-12T13:00:00.000Z',
      status: 'NO_SHOW',
    });

    const firstAppointment = await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      customerId: returningCustomer.id,
      clientName: returningCustomer.name,
      clientPhone: returningCustomer.phone,
      clientEmail: 'returning@test.com',
      startAt: isoAtLocal(localDate, '09:00'),
      status: 'CONFIRMED',
    });

    const inProgressAppointment = await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service45,
      customerId: noShowCustomer.id,
      clientName: noShowCustomer.name,
      clientPhone: noShowCustomer.phone,
      clientEmail: 'no-show@test.com',
      startAt: isoAtLocal(localDate, '11:00'),
      status: 'IN_PROGRESS',
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      clientName: 'Cancelled Customer',
      clientPhone: '+5493815000999',
      clientEmail: 'cancelled@test.com',
      startAt: isoAtLocal(localDate, '15:00'),
      status: 'CANCELLED',
    });

    await prisma.appointmentNotification.create({
      data: {
        barbershopId: fixtures.shop.id,
        appointmentId: firstAppointment.id,
        type: 'BOOKING_CONFIRMATION',
        channel: 'EMAIL',
        status: 'FAILED',
        recipientEmail: 'returning@test.com',
        scheduledFor: firstAppointment.startAt,
        nextAttemptAt: firstAppointment.startAt,
        attempts: 2,
        idempotencyKey: 'schedule-board-failed-confirmation',
        payload: { type: 'BOOKING_CONFIRMATION' },
      },
    });

    const payload = await getDailyScheduleBoard({
      barbershopId: fixtures.shop.id,
      query: { date: localDate },
      userId: fixtures.owner.id,
      userRole: 'OWNER',
      now: FROZEN_NOW,
    }) as {
      date: string;
      timezone: string;
      currentTime: { iso: string; localTime: string } | null;
      employees: Array<{
        id: string;
        name: string;
        summary: {
          confirmed: number;
          inProgress: number;
          completed: number;
          noShow: number;
          cancelled: number;
          occupiedMinutes: number;
        };
        workingDay: {
          source: string;
          intervals: Array<{ startTime: string; endTime: string }>;
          closedIntervals: Array<{ startTime: string; endTime: string; reason: string }>;
        };
        availableGaps: Array<{
          startAt: string;
          localStartTime: string;
          localEndTime: string;
          minimumBookableDuration: number | null;
        }>;
        appointments: Array<{
          id: string;
          clientDisplayName: string;
          startAt: string;
          status: string;
          notificationSummary?: { hasFailures: boolean; failedCount: number } | null;
          completedVisitCount: number;
          isReturningCustomer: boolean;
          noShowCount: number;
          hasPreviousNoShows: boolean;
          customerId?: string | null;
          clientPhone?: string | null;
          clientEmail?: string | null;
        }>;
      }>;
    };

    expect(payload.date).toBe(localDate);
    expect(payload.timezone).toBe(TEST_BARBERSHOP_TIMEZONE);
    expect(payload.currentTime).toEqual({
      iso: FROZEN_NOW.toISOString(),
      localTime: '10:15',
    });
    expect(payload.employees).toHaveLength(2);

    const barberA = payload.employees.find((employee) => employee.id === fixtures.barberA.employee.id);
    expect(barberA).toBeDefined();
    expect(barberA?.workingDay.source).toBe('date_exception_custom');
    expect(barberA?.workingDay.intervals).toMatchObject([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '18:00' },
    ]);
    expect(barberA?.workingDay.closedIntervals).toMatchObject([
      { startTime: '12:00', endTime: '13:00', reason: 'SCHEDULE_EXCEPTION' },
    ]);
    expect(barberA?.summary).toMatchObject({
      confirmed: 1,
      inProgress: 1,
      completed: 0,
      noShow: 0,
      cancelled: 1,
      occupiedMinutes: 75,
    });
    expect(barberA?.appointments.map((appointment) => appointment.id)).toEqual([
      firstAppointment.id,
      inProgressAppointment.id,
      expect.any(String),
    ]);
    expect(barberA?.appointments[0]).toMatchObject({
      id: firstAppointment.id,
      clientDisplayName: 'Returning Customer',
      status: 'CONFIRMED',
      isReturningCustomer: true,
      completedVisitCount: 1,
      noShowCount: 0,
      hasPreviousNoShows: false,
      customerId: returningCustomer.id,
      notificationSummary: {
        hasFailures: true,
        failedCount: 1,
      },
    });
    expect(barberA?.appointments[0]).not.toHaveProperty('clientPhone');
    expect(barberA?.appointments[0]).not.toHaveProperty('clientEmail');
    expect(barberA?.appointments[1]).toMatchObject({
      id: inProgressAppointment.id,
      status: 'IN_PROGRESS',
      isReturningCustomer: false,
      completedVisitCount: 0,
      noShowCount: 1,
      hasPreviousNoShows: true,
      customerId: noShowCustomer.id,
    });
    expect(barberA?.availableGaps.map((gap) => gap.localStartTime)).toContain('10:30');
    expect(barberA?.availableGaps[0]?.minimumBookableDuration).toBe(30);

    const barberB = payload.employees.find((employee) => employee.id === fixtures.barberB.employee.id);
    expect(barberB?.availableGaps[0]).toMatchObject({
      localStartTime: '10:30',
      localEndTime: '12:00',
      minimumBookableDuration: 45,
    });
  });

  it('supports owner employee filtering', async () => {
    const localDate = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FROZEN_NOW);

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      clientName: 'A Customer',
      startAt: isoAtLocal(localDate, '11:00'),
      status: 'CONFIRMED',
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberB.employee.id,
      service: fixtures.service45,
      clientName: 'B Customer',
      startAt: isoAtLocal(localDate, '14:00'),
      status: 'CONFIRMED',
    });

    const response = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/schedule/day`)
      .query({
        date: localDate,
        employeeId: fixtures.barberB.employee.id,
      })
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(response.status).toBe(200);
    expect(response.body.data.employees).toHaveLength(1);
    expect(response.body.data.employees[0].id).toBe(fixtures.barberB.employee.id);
  });

  it('keeps barbers scoped to their own employee profile', async () => {
    const localDate = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FROZEN_NOW);

    const ownResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/schedule/day`)
      .query({ date: localDate })
      .set(authHeader(fixtures.barberA.user.clerkUserId));

    expect(ownResponse.status).toBe(200);
    expect(ownResponse.body.data.employees).toHaveLength(1);
    expect(ownResponse.body.data.employees[0].id).toBe(fixtures.barberA.employee.id);

    const forbiddenResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/schedule/day`)
      .query({
        date: localDate,
        employeeId: fixtures.barberB.employee.id,
      })
      .set(authHeader(fixtures.barberA.user.clerkUserId));

    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenResponse.body.error?.code).toBe('FORBIDDEN_EMPLOYEE_SCOPE');
  });

  it('rejects invalid dates and hides cross-tenant barbershops', async () => {
    const invalidDateResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/schedule/day`)
      .query({ date: '2026-13-40' })
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(invalidDateResponse.status).toBe(400);

    const crossTenantResponse = await request(app)
      .get(`/api/v1/barbershops/${fixtures.otherShop.id}/schedule/day`)
      .query({ date: '2026-07-20' })
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(crossTenantResponse.status).toBe(404);
  });

  it('returns an empty working day on closed dates', async () => {
    const localDate = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FROZEN_NOW);

    await prisma.barbershopScheduleException.create({
      data: {
        barbershopId: fixtures.shop.id,
        localDate,
        isClosed: true,
      },
    });

    const payload = await getDailyScheduleBoard({
      barbershopId: fixtures.shop.id,
      query: { date: localDate, employeeId: fixtures.barberA.employee.id },
      userId: fixtures.owner.id,
      userRole: 'OWNER',
      now: FROZEN_NOW,
    });

    expect(payload.employees).toHaveLength(1);
    expect(payload.employees[0]?.workingDay.intervals).toEqual([]);
    expect(payload.employees[0]?.workingDay.closedIntervals).toEqual([]);
    expect(payload.employees[0]?.availableGaps).toEqual([]);
    expect(payload.employees[0]?.appointments).toEqual([]);
  });

  it('keeps tiny gaps non-actionable when no assigned service can fit', async () => {
    const localDate = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FROZEN_NOW);

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberB.employee.id,
      service: fixtures.service45,
      clientName: 'Morning Client',
      startAt: isoAtLocal(localDate, '09:00'),
      status: 'CONFIRMED',
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberB.employee.id,
      service: fixtures.service45,
      clientName: 'Late Morning Client',
      startAt: isoAtLocal(localDate, '10:15'),
      status: 'CONFIRMED',
    });

    const payload = await getDailyScheduleBoard({
      barbershopId: fixtures.shop.id,
      query: { date: localDate, employeeId: fixtures.barberB.employee.id },
      userId: fixtures.owner.id,
      userRole: 'OWNER',
      now: new Date('2026-07-20T10:00:00.000Z'),
    });

    expect(payload.employees).toHaveLength(1);
    expect(payload.employees[0]?.minimumBookableDuration).toBe(45);
    expect(payload.employees[0]?.availableGaps.some((gap) => gap.localStartTime === '09:45')).toBe(false);
    expect(payload.employees[0]?.availableGaps.some((gap) => gap.localStartTime === '11:00')).toBe(true);
  });

  it('keeps local-day appointment inclusion correct across UTC date boundaries', async () => {
    const localDate = '2026-07-21';

    await prisma.workingHours.deleteMany({ where: { barbershopId: fixtures.shop.id } });
    await prisma.workingHours.create({
      data: {
        barbershopId: fixtures.shop.id,
        dayOfWeek: 2,
        openTime: '22:00',
        closeTime: '23:30',
        isActive: true,
      },
    });

    await createAppointment({
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barberA.employee.id,
      service: fixtures.service30,
      clientName: 'Late Client',
      startAt: isoAtLocal(localDate, '22:30'),
      status: 'CONFIRMED',
    });

    const payload = await getDailyScheduleBoard({
      barbershopId: fixtures.shop.id,
      query: { date: localDate, employeeId: fixtures.barberA.employee.id },
      userId: fixtures.owner.id,
      userRole: 'OWNER',
      now: new Date('2026-07-21T12:00:00.000Z'),
    });

    expect(payload.date).toBe(localDate);
    expect(payload.employees[0]?.appointments).toHaveLength(1);
    expect(payload.employees[0]?.appointments[0]?.localStartTime).toBe('22:30');
    expect(payload.employees[0]?.appointments[0]?.startAt.slice(0, 10)).toBe('2026-07-22');
  });
});
