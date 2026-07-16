import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import {
  getLocalDateStringInTimeZone,
  localDateTimeToUtc,
} from '../../src/lib/dateUtils.js';
import { getAppointmentAvailability } from '../../src/services/appointmentService.js';
import type { Barbershop, Employee, Service, User } from '@prisma/client';
import {
  FIXED_TEST_NOW,
  getNextLocalWeekdayDate,
  TEST_BARBERSHOP_TIMEZONE,
} from '../helpers/timezone.js';
import { provisionBarbershopScheduleException } from '../../src/services/scheduleExceptionProvisioningService.js';

const app = createAppFromEnv();

interface Fixtures {
  ownerA: User;
  shopA: Barbershop;
  barberA1: { user: User; employee: Employee };
  barberA2: { user: User; employee: Employee };
  ownerService30: Service;
  ownerService45: Service;
  clientA: User;
  ownerB: User;
  shopB: Barbershop;
  barberB1: { user: User; employee: Employee };
  serviceB1: Service;
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function isoAtLocal(dateStr: string, timeStr: string, timezone = TEST_BARBERSHOP_TIMEZONE): string {
  return localDateTimeToUtc(dateStr, timeStr, timezone).toISOString();
}

function nextLocalWeekdayDate(targetDayOfWeek: number): string {
  return getNextLocalWeekdayDate(targetDayOfWeek, new Date(), TEST_BARBERSHOP_TIMEZONE);
}

function previousDateString(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const prev = new Date(Date.UTC(year, month - 1, day - 1));
  return `${String(prev.getUTCFullYear()).padStart(4, '0')}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
}

async function resetShopAWorkingHours(): Promise<void> {
  const days = [
    { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00', isActive: true },
    { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00', isActive: true },
    { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00', isActive: true },
    { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00', isActive: true },
    { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00', isActive: true },
    { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', isActive: true },
  ];

  for (const day of days) {
    await prisma.workingHours.upsert({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: fixtures.shopA.id,
          dayOfWeek: day.dayOfWeek,
        },
      },
      create: {
        barbershopId: fixtures.shopA.id,
        dayOfWeek: day.dayOfWeek,
        openTime: day.openTime,
        closeTime: day.closeTime,
        isActive: day.isActive,
      },
      update: {
        openTime: day.openTime,
        closeTime: day.closeTime,
        isActive: day.isActive,
      },
    });
  }
}

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'staff_ownerA_clerk',
      email: 'staff-ownerA@test.com',
      name: 'Staff Owner A',
      role: 'OWNER',
    },
  });

  fixtures.shopA = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerA.id,
      name: 'Staff Shop A',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      phone: '+54 381 555 0001',
    },
  });

  const barberA1User = await prisma.user.create({
    data: {
      clerkUserId: 'staff_barberA1_clerk',
      email: 'staff-barberA1@test.com',
      name: 'Staff Barber A1',
      role: 'BARBER',
    },
  });
  const barberA1Employee = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopA.id,
      userId: barberA1User.id,
    },
  });
  fixtures.barberA1 = { user: barberA1User, employee: barberA1Employee };

  const barberA2User = await prisma.user.create({
    data: {
      clerkUserId: 'staff_barberA2_clerk',
      email: 'staff-barberA2@test.com',
      name: 'Staff Barber A2',
      role: 'BARBER',
    },
  });
  const barberA2Employee = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopA.id,
      userId: barberA2User.id,
    },
  });
  fixtures.barberA2 = { user: barberA2User, employee: barberA2Employee };

  fixtures.ownerService30 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });

  fixtures.ownerService45 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Cut + Beard',
      durationMinutes: 45,
      priceCents: 4200,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.createMany({
    data: [
      {
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
      },
      {
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService45.id,
      },
      {
        employeeId: fixtures.barberA2.employee.id,
        serviceId: fixtures.ownerService30.id,
      },
    ],
  });

  await resetShopAWorkingHours();

  fixtures.clientA = await prisma.user.create({
    data: {
      clerkUserId: 'staff_clientA_clerk',
      email: 'staff-clientA@test.com',
      name: 'Client Snapshot A',
      role: 'CLIENT',
    },
  });

  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'staff_ownerB_clerk',
      email: 'staff-ownerB@test.com',
      name: 'Staff Owner B',
      role: 'OWNER',
    },
  });

  fixtures.shopB = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerB.id,
      name: 'Staff Shop B',
      timezone: TEST_BARBERSHOP_TIMEZONE,
    },
  });

  const barberB1User = await prisma.user.create({
    data: {
      clerkUserId: 'staff_barberB1_clerk',
      email: 'staff-barberB1@test.com',
      name: 'Staff Barber B1',
      role: 'BARBER',
    },
  });
  const barberB1Employee = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopB.id,
      userId: barberB1User.id,
    },
  });
  fixtures.barberB1 = { user: barberB1User, employee: barberB1Employee };

  fixtures.serviceB1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopB.id,
      name: 'Other Tenant Service',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.create({
    data: {
      employeeId: fixtures.barberB1.employee.id,
      serviceId: fixtures.serviceB1.id,
    },
  });
});

beforeEach(async () => {
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.barbershopScheduleException.deleteMany();
  await prisma.employee.updateMany({
    where: { id: { in: [fixtures.barberA1.employee.id, fixtures.barberA2.employee.id] } },
    data: { isActive: true, deletedAt: null },
  });
  await prisma.service.updateMany({
    where: { id: fixtures.ownerService30.id },
    data: {
      name: fixtures.ownerService30.name,
      durationMinutes: fixtures.ownerService30.durationMinutes,
      priceCents: fixtures.ownerService30.priceCents,
      currency: fixtures.ownerService30.currency,
      isActive: true,
      deletedAt: null,
    },
  });
  await prisma.service.updateMany({
    where: { id: fixtures.ownerService45.id },
    data: {
      name: fixtures.ownerService45.name,
      durationMinutes: fixtures.ownerService45.durationMinutes,
      priceCents: fixtures.ownerService45.priceCents,
      currency: fixtures.ownerService45.currency,
      isActive: true,
      deletedAt: null,
    },
  });
  await resetShopAWorkingHours();
});

afterAll(async () => {
  await prisma.photo.deleteMany();
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

describe('staff appointment creation', () => {
  it('OWNER creates a guest appointment with frozen snapshots', async () => {
    const monday = nextLocalWeekdayDate(1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService45.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Walk In Guest',
        clientPhone: '+54 381 555 7777',
        notes: 'First visit',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.clientId).toBeNull();
    expect(res.body.data.employeeId).toBe(fixtures.barberA1.employee.id);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.clientName).toBe('Walk In Guest');
    expect(res.body.data.clientPhone).toBe('+54 381 555 7777');
    expect(res.body.data.serviceName).toBe('Cut + Beard');
    expect(res.body.data.servicePriceCents).toBe(4200);
    expect(res.body.data.serviceDurationMinutes).toBe(45);
    expect(res.body.data.serviceCurrency).toBe('ARS');
    expect(res.body.data.notes).toBe('First visit');
  });

  it('OWNER rejects blank guest client name after trimming', async () => {
    const monday = nextLocalWeekdayDate(1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: '   ',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('OWNER rejects foreign employee and foreign service IDs', async () => {
    const monday = nextLocalWeekdayDate(1);

    const foreignEmployee = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberB1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Tenant Test',
      });

    expect(foreignEmployee.status).toBe(400);
    expect(foreignEmployee.body.error.message).toContain('Employee does not belong');

    const foreignService = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.serviceB1.id,
        startAt: isoAtLocal(monday, '11:00'),
        clientName: 'Tenant Test',
      });

    expect(foreignService.status).toBe(400);
    expect(foreignService.body.error.message).toContain('Service does not belong');
  });

  it('OWNER rejects inactive employee, inactive service, and unassigned service', async () => {
    const monday = nextLocalWeekdayDate(1);

    await prisma.employee.update({
      where: { id: fixtures.barberA1.employee.id },
      data: { isActive: false },
    });

    const inactiveEmployee = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Inactive Employee',
      });

    expect(inactiveEmployee.status).toBe(400);
    expect(inactiveEmployee.body.error.message).toContain('Employee is not active');

    await prisma.employee.update({
      where: { id: fixtures.barberA1.employee.id },
      data: { isActive: true },
    });
    await prisma.service.update({
      where: { id: fixtures.ownerService30.id },
      data: { isActive: false },
    });

    const inactiveService = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '11:00'),
        clientName: 'Inactive Service',
      });

    expect(inactiveService.status).toBe(400);
    expect(inactiveService.body.error.message).toContain('Service is not available');

    await prisma.service.update({
      where: { id: fixtures.ownerService30.id },
      data: { isActive: true },
    });

    const unassigned = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA2.employee.id,
        serviceId: fixtures.ownerService45.id,
        startAt: isoAtLocal(monday, '12:00'),
        clientName: 'Unassigned Service',
      });

    expect(unassigned.status).toBe(400);
    expect(unassigned.body.error.message).toContain('does not offer');
  });

  it('OWNER rejects past times, outside-hours bookings, overlaps, and allows cancelled slots to reopen', async () => {
    const today = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, new Date());
    const yesterday = previousDateString(today);

    const pastRes = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(yesterday, '10:00'),
        clientName: 'Past Guest',
      });

    expect(pastRes.status).toBe(400);
    expect(pastRes.body.error.code).toBe('INVALID_APPOINTMENT_TIME');

    const monday = nextLocalWeekdayDate(1);
    const beforeOpening = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '08:30'),
        clientName: 'Too Early',
      });

    expect(beforeOpening.status).toBe(400);
    expect(beforeOpening.body.error.message).toContain('before opening hours');

    const firstBooking = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Conflict A',
      });

    expect(firstBooking.status).toBe(201);

    const overlapping = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Conflict B',
      });

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('CONFLICT');

    await prisma.appointment.update({
      where: { id: firstBooking.body.data.id },
      data: { status: 'CANCELLED' },
    });

    const reopened = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Reopened Slot',
      });

    expect(reopened.status).toBe(201);
  });

  it('rejects request attempts to control forbidden booking fields', async () => {
    const monday = nextLocalWeekdayDate(1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:30'),
        clientName: 'Strict Payload',
        status: 'CONFIRMED',
        endAt: isoAtLocal(monday, '11:00'),
        servicePriceCents: 1,

        discountCents: 0,

        finalPriceCents: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('BARBER creates appointments only for their authenticated employee scope', async () => {
    const monday = nextLocalWeekdayDate(1);

    const ownBooking = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.barberA1.user.clerkUserId))
      .send({
        serviceId: fixtures.ownerService45.id,
        startAt: isoAtLocal(monday, '13:00'),
        clientName: 'Barber Guest',
      });

    expect(ownBooking.status).toBe(201);
    expect(ownBooking.body.data.employeeId).toBe(fixtures.barberA1.employee.id);

    const impersonation = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.barberA1.user.clerkUserId))
      .send({
        employeeId: fixtures.barberA2.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '14:00'),
        clientName: 'Impersonation Attempt',
      });

    expect(impersonation.status).toBe(403);
    expect(impersonation.body.error.code).toBe('FORBIDDEN_EMPLOYEE_SCOPE');
  });

  it('BARBER rejects unassigned or inactive assigned services', async () => {
    const monday = nextLocalWeekdayDate(1);

    const unassigned = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.barberA2.user.clerkUserId))
      .send({
        serviceId: fixtures.ownerService45.id,
        startAt: isoAtLocal(monday, '15:00'),
        clientName: 'No Assignment',
      });

    expect(unassigned.status).toBe(400);
    expect(unassigned.body.error.message).toContain('does not offer');

    await prisma.service.update({
      where: { id: fixtures.ownerService30.id },
      data: { isActive: false },
    });

    const inactive = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.barberA1.user.clerkUserId))
      .send({
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '15:30'),
        clientName: 'Inactive Assigned',
      });

    expect(inactive.status).toBe(400);
    expect(inactive.body.error.message).toContain('Service is not available');
  });
});

describe('client snapshot compatibility', () => {
  it('CLIENT booking keeps the existing route and stores immutable snapshots', async () => {
    const monday = nextLocalWeekdayDate(1);
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '16:00'),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.clientId).toBe(fixtures.clientA.id);
    expect(res.body.data.client?.id).toBe(fixtures.clientA.id);
    expect(res.body.data.clientName).toBe('Client Snapshot A');
    expect(res.body.data.serviceName).toBe('Classic Cut');
    expect(res.body.data.servicePriceCents).toBe(2500);
    expect(res.body.data.serviceDurationMinutes).toBe(30);

    await prisma.service.update({
      where: { id: fixtures.ownerService30.id },
      data: {
        name: 'Renamed Service',
        priceCents: 9999,
        durationMinutes: 90,
      },
    });

    const fetchRes = await request(app)
      .get(`/api/v1/appointments/${res.body.data.id}`)
      .set(authHeader(fixtures.clientA.clerkUserId));

    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.data.serviceName).toBe('Classic Cut');
    expect(fetchRes.body.data.servicePriceCents).toBe(2500);
    expect(fetchRes.body.data.serviceDurationMinutes).toBe(30);
    expect(fetchRes.body.data.service.name).toBe('Renamed Service');
  });

  it('CLIENT booking rejects fully closed schedule exception dates', async () => {
    const monday = nextLocalWeekdayDate(1);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.shopA.id,
      dryRun: false,
      localDate: monday,
      mode: 'closed',
    });

    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('closed');
  });
});

describe('availability', () => {
  it('returns ordered 30-minute slots with timezone-aware authoritative instants', async () => {
    const monday = nextLocalWeekdayDate(1);
    await prisma.workingHours.update({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: fixtures.shopA.id,
          dayOfWeek: 1,
        },
      },
      data: {
        openTime: '09:00',
        closeTime: '11:00',
      },
    });

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.barberA1.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.ownerService30.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.ownerService30.name,
        servicePriceCents: fixtures.ownerService30.priceCents,

        discountCents: 0,

        finalPriceCents: fixtures.ownerService30.priceCents,
        serviceDurationMinutes: fixtures.ownerService30.durationMinutes,
        serviceCurrency: fixtures.ownerService30.currency,
        startAt: localDateTimeToUtc(monday, '09:30', TEST_BARBERSHOP_TIMEZONE),
        endAt: localDateTimeToUtc(monday, '10:00', TEST_BARBERSHOP_TIMEZONE),
        status: 'CONFIRMED',
      },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.barberA1.employee.id}/appointments/availability`)
      .query({
        serviceId: fixtures.ownerService45.id,
        localDate: monday,
      })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.localDate).toBe(monday);
    expect(res.body.data.barbershopTimezone).toBe(TEST_BARBERSHOP_TIMEZONE);
    expect(res.body.data.slotIntervalMinutes).toBe(30);
    expect(res.body.data.serviceDurationMinutes).toBe(45);
    expect(res.body.data.slots).toEqual([
      {
        startAt: isoAtLocal(monday, '10:00'),
        endAt: isoAtLocal(monday, '10:45'),
        localStartTime: '10:00',
        localEndTime: '10:45',
      },
    ]);
  });

  it('does not let cancelled appointments block and returns empty arrays for valid no-availability days', async () => {
    const monday = nextLocalWeekdayDate(1);
    await prisma.workingHours.update({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: fixtures.shopA.id,
          dayOfWeek: 1,
        },
      },
      data: {
        openTime: '09:00',
        closeTime: '09:30',
      },
    });

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.barberA1.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.ownerService30.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.ownerService30.name,
        servicePriceCents: fixtures.ownerService30.priceCents,

        discountCents: 0,

        finalPriceCents: fixtures.ownerService30.priceCents,
        serviceDurationMinutes: fixtures.ownerService30.durationMinutes,
        serviceCurrency: fixtures.ownerService30.currency,
        startAt: localDateTimeToUtc(monday, '09:00', TEST_BARBERSHOP_TIMEZONE),
        endAt: localDateTimeToUtc(monday, '09:30', TEST_BARBERSHOP_TIMEZONE),
        status: 'CANCELLED',
      },
    });

    const cancelledOnly = await getAppointmentAvailability({
      barbershopId: fixtures.shopA.id,
      employeeId: fixtures.barberA1.employee.id,
      query: {
        serviceId: fixtures.ownerService30.id,
        localDate: monday,
      },
      userId: fixtures.ownerA.id,
      userRole: 'OWNER',
      now: localDateTimeToUtc(previousDateString(monday), '10:00', TEST_BARBERSHOP_TIMEZONE),
    });

    expect(cancelledOnly.slots).toEqual([
      {
        startAt: isoAtLocal(monday, '09:00'),
        endAt: isoAtLocal(monday, '09:30'),
        localStartTime: '09:00',
        localEndTime: '09:30',
      },
    ]);

    await prisma.workingHours.update({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: fixtures.shopA.id,
          dayOfWeek: 1,
        },
      },
      data: {
        openTime: '09:00',
        closeTime: '09:15',
      },
    });

    const empty = await getAppointmentAvailability({
      barbershopId: fixtures.shopA.id,
      employeeId: fixtures.barberA1.employee.id,
      query: {
        serviceId: fixtures.ownerService30.id,
        localDate: monday,
      },
      userId: fixtures.ownerA.id,
      userRole: 'OWNER',
      now: localDateTimeToUtc(previousDateString(monday), '10:00', TEST_BARBERSHOP_TIMEZONE),
    });

    expect(empty.slots).toEqual([]);
  });

  it('enforces past-date rejection, owner/barber scope, and revalidates on submission race', async () => {
    const today = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, new Date());
    const yesterday = previousDateString(today);

    const pastDate = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.barberA1.employee.id}/appointments/availability`)
      .query({
        serviceId: fixtures.ownerService30.id,
        localDate: yesterday,
      })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(pastDate.status).toBe(400);
    expect(pastDate.body.error.code).toBe('INVALID_APPOINTMENT_DATE');

    const monday = nextLocalWeekdayDate(1);
    const barberForbidden = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.barberA2.employee.id}/appointments/availability`)
      .query({
        serviceId: fixtures.ownerService30.id,
        localDate: monday,
      })
      .set(authHeader(fixtures.barberA1.user.clerkUserId));

    expect(barberForbidden.status).toBe(403);
    expect(barberForbidden.body.error.code).toBe('FORBIDDEN_EMPLOYEE_SCOPE');

    const availability = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.barberA1.employee.id}/appointments/availability`)
      .query({
        serviceId: fixtures.ownerService30.id,
        localDate: monday,
      })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(availability.status).toBe(200);
    const chosenSlot = availability.body.data.slots[0];
    expect(chosenSlot).toBeDefined();

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.barberA1.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.ownerService30.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.ownerService30.name,
        servicePriceCents: fixtures.ownerService30.priceCents,

        discountCents: 0,

        finalPriceCents: fixtures.ownerService30.priceCents,
        serviceDurationMinutes: fixtures.ownerService30.durationMinutes,
        serviceCurrency: fixtures.ownerService30.currency,
        startAt: new Date(chosenSlot.startAt),
        endAt: new Date(chosenSlot.endAt),
        status: 'CONFIRMED',
      },
    });

    const createAfterRace = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: chosenSlot.startAt,
        clientName: 'Race Condition Guest',
      });

    expect(createAfterRace.status).toBe(409);
    expect(createAfterRace.body.error.code).toBe('CONFLICT');
  });

  it('filters past slots for today using the barbershop timezone', async () => {
    const localToday = getLocalDateStringInTimeZone(TEST_BARBERSHOP_TIMEZONE, FIXED_TEST_NOW);

    await prisma.workingHours.update({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId: fixtures.shopA.id,
          dayOfWeek: new Date(`${localToday}T00:00:00.000Z`).getUTCDay(),
        },
      },
      data: {
        openTime: '09:00',
        closeTime: '11:00',
      },
    });

    const availability = await getAppointmentAvailability({
      barbershopId: fixtures.shopA.id,
      employeeId: fixtures.barberA1.employee.id,
      query: {
        serviceId: fixtures.ownerService30.id,
        localDate: localToday,
      },
      userId: fixtures.ownerA.id,
      userRole: 'OWNER',
      now: localDateTimeToUtc(localToday, '09:20', TEST_BARBERSHOP_TIMEZONE),
    });

    expect(availability.slots[0]?.localStartTime).toBe('09:30');
    expect(availability.slots.every((slot) => new Date(slot.startAt) > localDateTimeToUtc(localToday, '09:20', TEST_BARBERSHOP_TIMEZONE))).toBe(true);
  });

  it('applies date-specific closures and custom intervals to staff availability', async () => {
    const monday = nextLocalWeekdayDate(1);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.shopA.id,
      dryRun: false,
      localDate: monday,
      mode: 'closed',
    });

    const closed = await getAppointmentAvailability({
      barbershopId: fixtures.shopA.id,
      employeeId: fixtures.barberA1.employee.id,
      query: {
        serviceId: fixtures.ownerService30.id,
        localDate: monday,
      },
      userId: fixtures.ownerA.id,
      userRole: 'OWNER',
      now: localDateTimeToUtc(previousDateString(monday), '10:00', TEST_BARBERSHOP_TIMEZONE),
    });

    expect(closed.slots).toEqual([]);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.shopA.id,
      dryRun: false,
      localDate: monday,
      mode: 'set_intervals',
      intervals: [
        { openTime: '10:00', closeTime: '13:00', position: 0 },
        { openTime: '15:00', closeTime: '18:00', position: 1 },
      ],
    });

    const custom = await getAppointmentAvailability({
      barbershopId: fixtures.shopA.id,
      employeeId: fixtures.barberA1.employee.id,
      query: {
        serviceId: fixtures.ownerService45.id,
        localDate: monday,
      },
      userId: fixtures.ownerA.id,
      userRole: 'OWNER',
      now: localDateTimeToUtc(previousDateString(monday), '10:00', TEST_BARBERSHOP_TIMEZONE),
    });

    expect(custom.slots.map((slot) => slot.localStartTime)).toEqual([
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
    ]);
  });

  it('rejects staff creation and rescheduling onto fully closed dates', async () => {
    const monday = nextLocalWeekdayDate(1);
    const tuesday = nextLocalWeekdayDate(2);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.shopA.id,
      dryRun: false,
      localDate: monday,
      mode: 'closed',
    });

    const createOnClosed = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(monday, '10:00'),
        clientName: 'Closed Day Guest',
      });

    expect(createOnClosed.status).toBe(400);
    expect(createOnClosed.body.error.message).toContain('closed');

    const existing = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        employeeId: fixtures.barberA1.employee.id,
        serviceId: fixtures.ownerService30.id,
        startAt: isoAtLocal(tuesday, '10:00'),
        clientName: 'Reschedule Source',
      });

    expect(existing.status).toBe(201);

    const movedToClosed = await request(app)
      .put(`/api/v1/appointments/${existing.body.data.id}`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        startAt: isoAtLocal(monday, '10:00'),
      });

    expect(movedToClosed.status).toBe(400);
    expect(movedToClosed.body.error.message).toContain('closed');
  });
});
