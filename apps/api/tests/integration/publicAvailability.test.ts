import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { readApiRuntimeConfig } from '../../src/config/runtime.js';
import {
  addDaysToDateString,
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
  localDateTimeToUtc,
} from '../../src/lib/dateUtils.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { prisma } from '../../src/lib/prisma.js';
import { createPublicCatalogRouter } from '../../src/routes/publicCatalog.js';
import { getPublicBarberAvailabilityBySlug } from '../../src/services/publicAvailabilityService.js';
import { provisionBarbershopScheduleException } from '../../src/services/scheduleExceptionProvisioningService.js';
import { FIXED_TEST_NOW, getNextLocalWeekdayDate } from '../helpers/timezone.js';

const app = createAppFromEnv();
const ARGENTINA_TIMEZONE = 'America/Argentina/Tucuman';

interface Fixtures {
  publishedShop: { id: string; slug: string; timezone: string };
  unpublishedShop: { id: string };
  inactiveShop: { id: string; slug: string };
  otherShop: { id: string; slug: string };
  dstShop: { id: string; slug: string; timezone: string };
  activeService30: { id: string };
  activeService45: { id: string };
  inactiveService: { id: string };
  foreignService: { id: string };
  eligibleBarber: { id: string };
  eligibleBarberTwo: { id: string };
  inactiveBarber: { id: string };
  unassignedBarber: { id: string };
  foreignBarber: { id: string };
  dstService30: { id: string };
  dstBarber: { id: string };
}

const fixtures = {} as Fixtures;

function createRateLimitedPublicApp() {
  const config = readApiRuntimeConfig({
    ...process.env,
    NODE_ENV: 'test',
    RATE_LIMIT_ENABLED: 'true',
  });

  const rateLimitedApp = express();
  rateLimitedApp.use(express.json());
  rateLimitedApp.use(
    '/api/v1/public',
    createPublicCatalogRouter(config, {
      catalogReadRateLimit: {
        max: 20,
        windowMs: 60_000,
      },
      availabilityReadRateLimit: {
        max: 1,
        windowMs: 60_000,
      },
    })
  );
  rateLimitedApp.use(errorHandler);

  return rateLimitedApp;
}

async function upsertWorkingHours(
  barbershopId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  isActive = true
) {
  await prisma.workingHours.upsert({
    where: {
      barbershopId_dayOfWeek: {
        barbershopId,
        dayOfWeek,
      },
    },
    create: {
      barbershopId,
      dayOfWeek,
      openTime,
      closeTime,
      isActive,
    },
    update: {
      openTime,
      closeTime,
      isActive,
    },
  });
}

async function seedDefaultWorkingHours(barbershopId: string, saturdayClose = '14:00') {
  for (const day of [1, 2, 3, 4, 5] as const) {
    await upsertWorkingHours(barbershopId, day, '09:00', '19:00');
  }

  await upsertWorkingHours(barbershopId, 6, '09:00', saturdayClose);
}

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_owner_a',
      email: 'public_availability_owner_a@example.com',
      name: 'Public Availability Owner A',
      role: 'OWNER',
    },
  });
  const ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_owner_b',
      email: 'public_availability_owner_b@example.com',
      name: 'Public Availability Owner B',
      role: 'OWNER',
    },
  });

  const publishedShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Availability Shop',
      timezone: ARGENTINA_TIMEZONE,
      publicSlug: 'availability-shop',
      isActive: true,
    },
  });
  fixtures.publishedShop = {
    id: publishedShop.id,
    slug: 'availability-shop',
    timezone: ARGENTINA_TIMEZONE,
  };

  const unpublishedShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Unpublished Availability Shop',
      timezone: ARGENTINA_TIMEZONE,
      isActive: true,
    },
  });
  fixtures.unpublishedShop = { id: unpublishedShop.id };

  const inactiveShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Inactive Availability Shop',
      timezone: ARGENTINA_TIMEZONE,
      publicSlug: 'inactive-availability-shop',
      isActive: false,
    },
  });
  fixtures.inactiveShop = {
    id: inactiveShop.id,
    slug: 'inactive-availability-shop',
  };

  const otherShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerB.id,
      name: 'Other Tenant Availability Shop',
      timezone: ARGENTINA_TIMEZONE,
      publicSlug: 'other-availability-shop',
      isActive: true,
    },
  });
  fixtures.otherShop = {
    id: otherShop.id,
    slug: 'other-availability-shop',
  };

  const dstShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'DST Shop',
      timezone: 'America/New_York',
      publicSlug: 'dst-shop',
      isActive: true,
    },
  });
  fixtures.dstShop = {
    id: dstShop.id,
    slug: 'dst-shop',
    timezone: 'America/New_York',
  };

  await seedDefaultWorkingHours(publishedShop.id);
  await seedDefaultWorkingHours(otherShop.id);
  await upsertWorkingHours(dstShop.id, 0, '00:00', '04:00');

  const activeService30 = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Availability Cut',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
      isActive: true,
    },
  });
  const activeService45 = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Availability Cut + Beard',
      durationMinutes: 45,
      priceCents: 4500,
      currency: 'ARS',
      isActive: true,
    },
  });
  const inactiveService = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Inactive Availability Service',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
      isActive: false,
      deletedAt: new Date(),
    },
  });
  const foreignService = await prisma.service.create({
    data: {
      barbershopId: otherShop.id,
      name: 'Foreign Availability Service',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
      isActive: true,
    },
  });
  const dstService30 = await prisma.service.create({
    data: {
      barbershopId: dstShop.id,
      name: 'DST Service',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'USD',
      isActive: true,
    },
  });

  fixtures.activeService30 = { id: activeService30.id };
  fixtures.activeService45 = { id: activeService45.id };
  fixtures.inactiveService = { id: inactiveService.id };
  fixtures.foreignService = { id: foreignService.id };
  fixtures.dstService30 = { id: dstService30.id };

  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_barber_a',
      email: 'public_availability_barber_a@example.com',
      name: 'Availability Barber A',
      role: 'BARBER',
    },
  });
  const barberUserTwo = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_barber_b',
      email: 'public_availability_barber_b@example.com',
      name: 'Availability Barber B',
      role: 'BARBER',
    },
  });
  const inactiveBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_barber_inactive',
      email: 'public_availability_barber_inactive@example.com',
      name: 'Inactive Availability Barber',
      role: 'BARBER',
    },
  });
  const unassignedBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_barber_unassigned',
      email: 'public_availability_barber_unassigned@example.com',
      name: 'Unassigned Availability Barber',
      role: 'BARBER',
    },
  });
  const foreignBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_barber_foreign',
      email: 'public_availability_barber_foreign@example.com',
      name: 'Foreign Availability Barber',
      role: 'BARBER',
    },
  });
  const dstBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_availability_dst_barber',
      email: 'public_availability_dst_barber@example.com',
      name: 'DST Barber',
      role: 'BARBER',
    },
  });

  const eligibleBarber = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: barberUser.id,
      isActive: true,
    },
  });
  const eligibleBarberTwo = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: barberUserTwo.id,
      isActive: true,
    },
  });
  const inactiveBarber = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: inactiveBarberUser.id,
      isActive: false,
      deletedAt: new Date(),
    },
  });
  const unassignedBarber = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: unassignedBarberUser.id,
      isActive: true,
    },
  });
  const foreignBarber = await prisma.employee.create({
    data: {
      barbershopId: otherShop.id,
      userId: foreignBarberUser.id,
      isActive: true,
    },
  });
  const dstBarber = await prisma.employee.create({
    data: {
      barbershopId: dstShop.id,
      userId: dstBarberUser.id,
      isActive: true,
    },
  });

  await prisma.employeeService.createMany({
    data: [
      { employeeId: eligibleBarber.id, serviceId: activeService30.id },
      { employeeId: eligibleBarber.id, serviceId: activeService45.id },
      { employeeId: eligibleBarberTwo.id, serviceId: activeService30.id },
      { employeeId: inactiveBarber.id, serviceId: activeService30.id },
      { employeeId: foreignBarber.id, serviceId: foreignService.id },
      { employeeId: dstBarber.id, serviceId: dstService30.id },
    ],
  });

  fixtures.eligibleBarber = { id: eligibleBarber.id };
  fixtures.eligibleBarberTwo = { id: eligibleBarberTwo.id };
  fixtures.inactiveBarber = { id: inactiveBarber.id };
  fixtures.unassignedBarber = { id: unassignedBarber.id };
  fixtures.foreignBarber = { id: foreignBarber.id };
  fixtures.dstBarber = { id: dstBarber.id };
});

beforeEach(async () => {
  await prisma.appointment.deleteMany();
  await prisma.barbershopScheduleException.deleteMany();
  await prisma.service.updateMany({
    where: {
      id: { in: [fixtures.activeService30.id, fixtures.activeService45.id] },
    },
    data: {
      isActive: true,
      deletedAt: null,
    },
  });
  await prisma.employee.updateMany({
    where: {
      id: { in: [fixtures.eligibleBarber.id, fixtures.eligibleBarberTwo.id] },
    },
    data: {
      isActive: true,
      deletedAt: null,
    },
  });

  await seedDefaultWorkingHours(fixtures.publishedShop.id);
  await upsertWorkingHours(fixtures.dstShop.id, 0, '00:00', '04:00');
});

afterAll(async () => {
  await prisma.photo.deleteMany();
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

describe('public availability route and DTO', () => {
  it('allows anonymous access and returns a privacy-safe DTO', async () => {
    const monday = getNextLocalWeekdayDate(1, new Date(), fixtures.publishedShop.timezone);

    const res = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      slug: fixtures.publishedShop.slug,
      serviceId: fixtures.activeService30.id,
      barberId: fixtures.eligibleBarber.id,
      localDate: monday,
      timezone: fixtures.publishedShop.timezone,
      slotIntervalMinutes: 30,
      serviceDurationMinutes: 30,
    });
    expect(Array.isArray(res.body.data.slots)).toBe(true);
    expect(res.body.data.privateNotes).toBeUndefined();
    expect(res.body.data.ownerId).toBeUndefined();
    expect(res.body.data.localStartTime).toBeUndefined();
    expect(res.body.data.slots[0]?.localStartTime).toBeUndefined();
  });

  it('rejects missing query parameters and extra tenant identifiers', async () => {
    const monday = getNextLocalWeekdayDate(1, new Date(), fixtures.publishedShop.timezone);

    const missing = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const extraTenantId = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
        barbershopId: fixtures.otherShop.id,
      });

    expect(extraTenantId.status).toBe(400);
    expect(extraTenantId.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('fails closed for unpublished, inactive, foreign, inactive, and noncanonical resources', async () => {
    const monday = getNextLocalWeekdayDate(1, new Date(), fixtures.publishedShop.timezone);

    const unpublished = await request(app)
      .get(
        `/api/v1/public/barbershops/missing-slug/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });
    expect(unpublished.status).toBe(404);

    const inactiveShop = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.inactiveShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });
    expect(inactiveShop.status).toBe(404);

    const foreignService = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.foreignService.id,
        localDate: monday,
      });
    expect(foreignService.status).toBe(404);

    const inactiveService = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.inactiveService.id,
        localDate: monday,
      });
    expect(inactiveService.status).toBe(404);

    const foreignBarber = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.foreignBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });
    expect(foreignBarber.status).toBe(404);

    const inactiveBarber = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.inactiveBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });
    expect(inactiveBarber.status).toBe(404);

    const nonCanonicalSlug = await request(app)
      .get(
        `/api/v1/public/barbershops/Availability-Shop/barbers/${fixtures.eligibleBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });
    expect(nonCanonicalSlug.status).toBe(404);
  });

  it('keeps the protected staff availability endpoint authenticated', async () => {
    const monday = getNextLocalWeekdayDate(1, new Date(), fixtures.publishedShop.timezone);

    const res = await request(app)
      .get(
        `/api/v1/barbershops/${fixtures.publishedShop.id}/employees/${fixtures.eligibleBarber.id}/appointments/availability`
      )
      .query({
        serviceId: fixtures.activeService30.id,
        localDate: monday,
      });

    expect(res.status).toBe(401);
  });

  it('returns 429 from the stricter availability limiter', async () => {
    const rateLimitedApp = createRateLimitedPublicApp();
    const monday = getNextLocalWeekdayDate(1, new Date(), fixtures.publishedShop.timezone);
    const path = `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.eligibleBarber.id}/availability`;

    const first = await request(rateLimitedApp).get(path).query({
      serviceId: fixtures.activeService30.id,
      localDate: monday,
    });
    expect(first.status).toBe(200);

    const second = await request(rateLimitedApp).get(path).query({
      serviceId: fixtures.activeService30.id,
      localDate: monday,
    });

    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('PUBLIC_AVAILABILITY_RATE_LIMITED');
  });
});

describe('public availability domain behavior', () => {
  it('uses weekly hours without exceptions and returns ascending 30-minute slots', async () => {
    const monday = getNextLocalWeekdayDate(1, FIXED_TEST_NOW, fixtures.publishedShop.timezone);
    await upsertWorkingHours(fixtures.publishedShop.id, 1, '09:00', '11:00');

    const availability = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: monday,
      now: localDateTimeToUtc(addDaysToDateString(monday, -1), '10:00', fixtures.publishedShop.timezone),
    });

    expect(availability.slots.map((slot) => slot.startAt)).toEqual([
      localDateTimeToUtc(monday, '09:00', fixtures.publishedShop.timezone).toISOString(),
      localDateTimeToUtc(monday, '09:30', fixtures.publishedShop.timezone).toISOString(),
      localDateTimeToUtc(monday, '10:00', fixtures.publishedShop.timezone).toISOString(),
      localDateTimeToUtc(monday, '10:30', fixtures.publishedShop.timezone).toISOString(),
    ]);
  });

  it('enforces past-date rejection, local today boundary near UTC midnight, and 30-day horizon', async () => {
    const localToday = getLocalDateStringInTimeZone(
      fixtures.publishedShop.timezone,
      FIXED_TEST_NOW
    );
    const past = addDaysToDateString(localToday, -1);
    const finalAllowed = addDaysToDateString(localToday, 30);
    const beyond = addDaysToDateString(localToday, 31);

    await expect(
      getPublicBarberAvailabilityBySlug({
        slug: fixtures.publishedShop.slug,
        barberId: fixtures.eligibleBarber.id,
        serviceId: fixtures.activeService30.id,
        localDate: past,
        now: FIXED_TEST_NOW,
      })
    ).rejects.toMatchObject({ code: 'INVALID_APPOINTMENT_DATE' });

    const allowed = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: finalAllowed,
      now: FIXED_TEST_NOW,
    });
    expect(allowed.localDate).toBe(finalAllowed);

    await expect(
      getPublicBarberAvailabilityBySlug({
        slug: fixtures.publishedShop.slug,
        barberId: fixtures.eligibleBarber.id,
        serviceId: fixtures.activeService30.id,
        localDate: beyond,
        now: FIXED_TEST_NOW,
      })
    ).rejects.toMatchObject({ code: 'INVALID_APPOINTMENT_DATE' });

    const boundaryDay = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: localToday,
      now: FIXED_TEST_NOW,
    });
    expect(boundaryDay.localDate).toBe(localToday);
  });

  it('enforces 60-minute minimum notice in the barbershop timezone', async () => {
    const localToday = getLocalDateStringInTimeZone(
      fixtures.publishedShop.timezone,
      FIXED_TEST_NOW
    );
    const dayOfWeek = new Date(`${localToday}T00:00:00.000Z`).getUTCDay();
    await upsertWorkingHours(fixtures.publishedShop.id, dayOfWeek, '21:30', '23:30');

    const availability = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: localToday,
      now: FIXED_TEST_NOW,
    });

    expect(availability.slots.map((slot) =>
      getLocalTimeStringInTimeZone(
        fixtures.publishedShop.timezone,
        new Date(slot.startAt)
      )
    )).toEqual(['23:00']);
  });

  it('applies closed and split-interval exceptions, and requires the full service to fit', async () => {
    const monday = getNextLocalWeekdayDate(1, FIXED_TEST_NOW, fixtures.publishedShop.timezone);
    const now = localDateTimeToUtc(addDaysToDateString(monday, -1), '10:00', fixtures.publishedShop.timezone);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.publishedShop.id,
      dryRun: false,
      localDate: monday,
      mode: 'closed',
    });

    const closed = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: monday,
      now,
    });
    expect(closed.slots).toEqual([]);

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.publishedShop.id,
      dryRun: false,
      localDate: monday,
      mode: 'set_intervals',
      intervals: [
        { openTime: '10:00', closeTime: '13:00', position: 0 },
        { openTime: '15:00', closeTime: '18:00', position: 1 },
      ],
    });

    const split = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService45.id,
      localDate: monday,
      now,
    });

    expect(split.slots.map((slot) =>
      getLocalTimeStringInTimeZone(
        fixtures.publishedShop.timezone,
        new Date(slot.startAt)
      )
    )).toEqual([
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

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.publishedShop.id,
      dryRun: false,
      localDate: monday,
      mode: 'set_intervals',
      intervals: [{ openTime: '10:00', closeTime: '10:30', position: 0 }],
    });

    const tooShort = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService45.id,
      localDate: monday,
      now,
    });
    expect(tooShort.slots).toEqual([]);
  });

  it('removes blocking appointments but ignores cancelled ones', async () => {
    const monday = getNextLocalWeekdayDate(1, FIXED_TEST_NOW, fixtures.publishedShop.timezone);
    const now = localDateTimeToUtc(addDaysToDateString(monday, -1), '10:00', fixtures.publishedShop.timezone);
    await upsertWorkingHours(fixtures.publishedShop.id, 1, '09:00', '11:00');

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.publishedShop.id,
        employeeId: fixtures.eligibleBarber.id,
        clientId: null,
        serviceId: fixtures.activeService30.id,
        clientName: 'Blocking Guest',
        serviceName: 'Availability Cut',
        servicePriceCents: 3000,
        serviceDurationMinutes: 30,
        serviceCurrency: 'ARS',
        startAt: localDateTimeToUtc(monday, '09:30', fixtures.publishedShop.timezone),
        endAt: localDateTimeToUtc(monday, '10:00', fixtures.publishedShop.timezone),
        status: 'CONFIRMED',
      },
    });

    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.publishedShop.id,
        employeeId: fixtures.eligibleBarber.id,
        clientId: null,
        serviceId: fixtures.activeService30.id,
        clientName: 'Cancelled Guest',
        serviceName: 'Availability Cut',
        servicePriceCents: 3000,
        serviceDurationMinutes: 30,
        serviceCurrency: 'ARS',
        startAt: localDateTimeToUtc(monday, '10:00', fixtures.publishedShop.timezone),
        endAt: localDateTimeToUtc(monday, '10:30', fixtures.publishedShop.timezone),
        status: 'CANCELLED',
      },
    });

    const availability = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.publishedShop.slug,
      barberId: fixtures.eligibleBarber.id,
      serviceId: fixtures.activeService30.id,
      localDate: monday,
      now,
    });

    expect(availability.slots.map((slot) =>
      getLocalTimeStringInTimeZone(
        fixtures.publishedShop.timezone,
        new Date(slot.startAt)
      )
    )).toEqual(['09:00', '10:00', '10:30']);
  });

  it('handles a DST spring-forward day without inventing missing local times', async () => {
    const availability = await getPublicBarberAvailabilityBySlug({
      slug: fixtures.dstShop.slug,
      barberId: fixtures.dstBarber.id,
      serviceId: fixtures.dstService30.id,
      localDate: '2026-03-08',
      now: new Date('2026-03-07T12:00:00.000Z'),
    });

    const localTimes = availability.slots.map((slot) =>
      getLocalTimeStringInTimeZone(
        fixtures.dstShop.timezone,
        new Date(slot.startAt)
      )
    );

    expect(localTimes).toEqual(['00:00', '00:30', '01:00', '01:30', '03:00', '03:30']);
    expect(localTimes).not.toContain('02:00');
    expect(localTimes).not.toContain('02:30');
  });
});
