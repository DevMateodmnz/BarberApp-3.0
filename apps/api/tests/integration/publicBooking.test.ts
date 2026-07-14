import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { readApiRuntimeConfig } from '../../src/config/runtime.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import {
  getLocalTimeStringInTimeZone,
  localDateTimeToUtc,
} from '../../src/lib/dateUtils.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { prisma } from '../../src/lib/prisma.js';
import { createPublicCatalogRouter } from '../../src/routes/publicCatalog.js';
import { provisionBarbershopScheduleException } from '../../src/services/scheduleExceptionProvisioningService.js';
import { getNextLocalWeekdayDate } from '../helpers/timezone.js';

const app = createAppFromEnv();
const TEST_TIMEZONE = 'America/Argentina/Tucuman';

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  client: { id: string; clerkUserId: string };
  publishedShop: { id: string; slug: string };
  otherShop: { id: string; slug: string };
  service30: { id: string; name: string; durationMinutes: number };
  otherService30: { id: string; durationMinutes: number };
  barber: { id: string; name: string };
  otherBarber: { id: string; name: string };
}

const fixtures = {} as Fixtures;

function nextMonday(): string {
  return getNextLocalWeekdayDate(1, new Date(), TEST_TIMEZONE);
}

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

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
        max: 20,
        windowMs: 60_000,
      },
      bookingWriteRateLimit: {
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

async function seedDefaultWorkingHours(barbershopId: string) {
  for (const day of [1, 2, 3, 4, 5] as const) {
    await upsertWorkingHours(barbershopId, day, '09:00', '19:00');
  }

  await upsertWorkingHours(barbershopId, 6, '09:00', '14:00');
}

function buildPublicCreatePayload(startAt: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceId: fixtures.service30.id,
    barberId: fixtures.barber.id,
    startAt,
    clientName: 'Mateo Domínguez',
    clientPhone: '+543811234567',
    notes: 'Prefiere tijera',
    consentAccepted: true,
    consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
    ...overrides,
  };
}

async function getFirstPublicSlot(localDate: string) {
  const availability = await request(app)
    .get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.barber.id}/availability`
    )
    .query({
      serviceId: fixtures.service30.id,
      localDate,
    });

  expect(availability.status).toBe(200);
  expect(availability.body.data.slots.length).toBeGreaterThan(0);

  return availability.body.data.slots[0] as { startAt: string; endAt: string };
}

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.barbershopScheduleExceptionInterval.deleteMany();
  await prisma.barbershopScheduleException.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_booking_owner',
      email: 'public_booking_owner@example.com',
      name: 'Public Booking Owner',
      role: 'OWNER',
    },
  });

  const client = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_booking_client',
      email: 'public_booking_client@example.com',
      name: 'Public Booking Client',
      role: 'CLIENT',
    },
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.client = { id: client.id, clerkUserId: client.clerkUserId };

  const publishedShop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Booking Shop',
      timezone: TEST_TIMEZONE,
      publicSlug: 'booking-shop',
      isActive: true,
    },
  });
  const otherShop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Other Booking Shop',
      timezone: TEST_TIMEZONE,
      publicSlug: 'other-booking-shop',
      isActive: true,
    },
  });

  fixtures.publishedShop = { id: publishedShop.id, slug: 'booking-shop' };
  fixtures.otherShop = { id: otherShop.id, slug: 'other-booking-shop' };

  await seedDefaultWorkingHours(publishedShop.id);
  await seedDefaultWorkingHours(otherShop.id);

  const service30 = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Classic Cut',
      durationMinutes: 30,
      priceCents: 3200,
      currency: 'ARS',
      isActive: true,
    },
  });

  const otherService30 = await prisma.service.create({
    data: {
      barbershopId: otherShop.id,
      name: 'Other Classic Cut',
      durationMinutes: 30,
      priceCents: 3600,
      currency: 'ARS',
      isActive: true,
    },
  });

  fixtures.service30 = {
    id: service30.id,
    name: service30.name,
    durationMinutes: service30.durationMinutes,
  };
  fixtures.otherService30 = {
    id: otherService30.id,
    durationMinutes: otherService30.durationMinutes,
  };

  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_booking_barber',
      email: 'public_booking_barber@example.com',
      name: 'Barber Público',
      role: 'BARBER',
    },
  });
  const otherBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_booking_other_barber',
      email: 'public_booking_other_barber@example.com',
      name: 'Barber Alterno',
      role: 'BARBER',
    },
  });

  const barber = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: barberUser.id,
      isActive: true,
    },
  });
  const otherBarber = await prisma.employee.create({
    data: {
      barbershopId: otherShop.id,
      userId: otherBarberUser.id,
      isActive: true,
    },
  });

  await prisma.employeeService.createMany({
    data: [
      { employeeId: barber.id, serviceId: service30.id },
      { employeeId: otherBarber.id, serviceId: otherService30.id },
    ],
  });

  fixtures.barber = { id: barber.id, name: barberUser.name ?? 'Barber' };
  fixtures.otherBarber = {
    id: otherBarber.id,
    name: otherBarberUser.name ?? 'Barber',
  };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.barbershopScheduleExceptionInterval.deleteMany();
  await prisma.barbershopScheduleException.deleteMany();
  await seedDefaultWorkingHours(fixtures.publishedShop.id);
  await seedDefaultWorkingHours(fixtures.otherShop.id);
});

afterAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.barbershopScheduleExceptionInterval.deleteMany();
  await prisma.barbershopScheduleException.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/public/barbershops/:slug/appointments', () => {
  it('creates a confirmed public appointment from an availability slot and makes it visible to staff', async () => {
    const monday = nextMonday();
    const slot = await getFirstPublicSlot(monday);

    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'pubbook_success_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingReference).toMatch(/^pb_[A-Z2-7]{20}$/u);
    expect(res.body.data.barbershopName).toBe('Booking Shop');
    expect(res.body.data.serviceName).toBe(fixtures.service30.name);
    expect(res.body.data.barberName).toBe(fixtures.barber.name);
    expect(res.body.data.timezone).toBe(TEST_TIMEZONE);
    expect(res.body.data.startAt).toBe(slot.startAt);
    expect(res.body.data.endAt).toBe(slot.endAt);
    expect(res.body.data.localDate).toBe(monday);
    expect(res.body.data.localStartTime).toBe(
      getLocalTimeStringInTimeZone(TEST_TIMEZONE, new Date(slot.startAt))
    );
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.id).toBeUndefined();
    expect(res.body.data.barbershopId).toBeUndefined();
    expect(res.body.data.employeeId).toBeUndefined();
    expect(res.body.data.clientId).toBeUndefined();

    const stored = await prisma.appointment.findFirstOrThrow({
      where: { publicReference: res.body.data.bookingReference },
    });

    expect(stored.status).toBe('CONFIRMED');
    expect(stored.clientId).toBeNull();
    expect(stored.clientName).toBe('Mateo Domínguez');
    expect(stored.clientPhone).toBe('+543811234567');
    expect(stored.publicConsentVersion).toBe(
      CURRENT_PUBLIC_BOOKING_CONSENT_VERSION
    );
    expect(stored.publicConsentAcceptedAt).toBeInstanceOf(Date);

    const ownerList = await request(app)
      .get('/api/v1/appointments')
      .query({ date: monday })
      .set(authHeader(fixtures.owner.clerkUserId));

    expect(ownerList.status).toBe(200);
    expect(
      ownerList.body.data.some(
        (appointment: Record<string, unknown>) =>
          appointment.publicReference === res.body.data.bookingReference &&
          appointment.clientName === 'Mateo Domínguez' &&
          appointment.status === 'CONFIRMED'
      )
    ).toBe(true);
  });

  it('requires Idempotency-Key and rejects obsolete aliases or authoritative field injection', async () => {
    const monday = nextMonday();
    const slot = await getFirstPublicSlot(monday);

    const missingKey = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .send(buildPublicCreatePayload(slot.startAt));

    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.message).toMatch(/Idempotency-Key/i);

    const aliasPayload = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'pubbook_alias_1234')
      .send({
        ...buildPublicCreatePayload(slot.startAt),
        note: 'legacy alias',
        localDate: monday,
      });

    expect(aliasPayload.status).toBe(400);
    expect(aliasPayload.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('replays the same payload for the same idempotency key but rejects payload drift', async () => {
    const monday = nextMonday();
    const slot = await getFirstPublicSlot(monday);

    const first = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'pubbook_replay_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    const replay = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'pubbook_replay_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    const drift = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'pubbook_replay_1234')
      .send(buildPublicCreatePayload(slot.startAt, { notes: 'Otro texto' }));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(first.body.data);
    expect(drift.status).toBe(409);
    expect(drift.body.error.code).toBe('PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT');

    const stored = await prisma.appointment.findMany({
      where: {
        startAt: new Date(slot.startAt),
        employeeId: fixtures.barber.id,
      },
    });

    expect(stored).toHaveLength(1);
  });

  it('allows the same idempotency key in another shop but prevents concurrent double-booking on one slot', async () => {
    const monday = nextMonday();
    const slot = await getFirstPublicSlot(monday);
    const otherSlot = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.otherShop.slug}/barbers/${fixtures.otherBarber.id}/availability`
      )
      .query({
        serviceId: fixtures.otherService30.id,
        localDate: monday,
      });

    expect(otherSlot.status).toBe(200);
    const otherStartAt = otherSlot.body.data.slots[0].startAt as string;

    const firstShop = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'shared_key_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    const secondShop = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.otherShop.slug}/appointments`)
      .set('Idempotency-Key', 'shared_key_1234')
      .send({
        ...buildPublicCreatePayload(otherStartAt, {
          serviceId: fixtures.otherService30.id,
          barberId: fixtures.otherBarber.id,
        }),
      });

    expect(firstShop.status).toBe(201);
    expect(secondShop.status).toBe(201);

    const refreshedAvailability = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.barber.id}/availability`
      )
      .query({
        serviceId: fixtures.service30.id,
        localDate: monday,
      });

    expect(refreshedAvailability.status).toBe(200);
    const raceSlot = refreshedAvailability.body.data.slots.find(
      (candidate: { startAt: string }) => candidate.startAt !== slot.startAt
    ) as { startAt: string } | undefined;

    expect(raceSlot).toBeDefined();

    const racePayload = buildPublicCreatePayload(raceSlot!.startAt);
    const [raceA, raceB] = await Promise.all([
      request(app)
        .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
        .set('Idempotency-Key', 'race_key_a_1234')
        .send(racePayload),
      request(app)
        .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
        .set('Idempotency-Key', 'race_key_b_1234')
        .send(racePayload),
    ]);

    const statuses = [raceA.status, raceB.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect([raceA.body.error?.code, raceB.body.error?.code]).toContain(
      'PUBLIC_BOOKING_SLOT_UNAVAILABLE'
    );
  });

  it('enforces slot-boundary validation for public and authenticated client creates', async () => {
    const monday = nextMonday();

    await provisionBarbershopScheduleException({
      barbershopId: fixtures.publishedShop.id,
      dryRun: false,
      localDate: monday,
      mode: 'set_intervals',
      intervals: [{ openTime: '10:15', closeTime: '11:45', position: 0 }],
    });

    const availability = await request(app)
      .get(
        `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers/${fixtures.barber.id}/availability`
      )
      .query({
        serviceId: fixtures.service30.id,
        localDate: monday,
      });

    expect(availability.status).toBe(200);
    expect(
      availability.body.data.slots.map((slot: { startAt: string }) =>
        getLocalTimeStringInTimeZone(TEST_TIMEZONE, new Date(slot.startAt))
      )
    ).toEqual(['10:30', '11:00']);

    const invalidPublic = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'slot_boundary_public_1234')
      .send(
        buildPublicCreatePayload(
          localDateTimeToUtc(monday, '10:15', TEST_TIMEZONE).toISOString()
        )
      );

    expect(invalidPublic.status).toBe(400);
    expect(invalidPublic.body.error.code).toBe('INVALID_APPOINTMENT_TIME');

    const invalidClient = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.client.clerkUserId))
      .send({
        barbershopId: fixtures.publishedShop.id,
        employeeId: fixtures.barber.id,
        serviceId: fixtures.service30.id,
        startAt: localDateTimeToUtc(monday, '10:15', TEST_TIMEZONE).toISOString(),
      });

    expect(invalidClient.status).toBe(400);
    expect(invalidClient.body.error.code).toBe('INVALID_APPOINTMENT_TIME');
  });

  it('applies an isolated public booking write limiter', async () => {
    const rateLimitedApp = createRateLimitedPublicApp();
    const monday = nextMonday();
    const slot = await getFirstPublicSlot(monday);

    const first = await request(rateLimitedApp)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'rate_limit_a_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    const second = await request(rateLimitedApp)
      .post(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/appointments`)
      .set('Idempotency-Key', 'rate_limit_b_1234')
      .send(buildPublicCreatePayload(slot.startAt));

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('PUBLIC_BOOKING_WRITE_RATE_LIMITED');
  });
});
