import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { readApiRuntimeConfig } from '../../src/config/runtime.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import { prisma } from '../../src/lib/prisma.js';
import { createPublicCatalogRouter } from '../../src/routes/publicCatalog.js';

const app = createAppFromEnv();

interface Fixtures {
  publishedShop: { id: string; slug: string };
  unpublishedShop: { id: string };
  inactiveShop: { id: string; slug: string };
  otherShop: { id: string; slug: string };
  activeServiceA: { id: string; name: string };
  activeServiceB: { id: string; name: string };
  inactiveService: { id: string };
  foreignService: { id: string };
  eligibleBarberA: { employeeId: string; name: string };
  eligibleBarberB: { employeeId: string; name: string };
  inactiveBarber: { employeeId: string };
  unassignedBarber: { employeeId: string };
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
        max: 2,
        windowMs: 60_000,
      },
    })
  );
  rateLimitedApp.use(errorHandler);

  return rateLimitedApp;
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

  const ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_owner_a',
      email: 'public_catalog_owner_a@example.com',
      name: 'Public Owner A',
      role: 'OWNER',
    },
  });
  const ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_owner_b',
      email: 'public_catalog_owner_b@example.com',
      name: 'Public Owner B',
      role: 'OWNER',
    },
  });

  const publishedShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Public Shop',
      address: '123 Public St',
      phone: '+54 11 1111-1111',
      timezone: 'America/Argentina/Tucuman',
      publicSlug: 'public-shop',
      isActive: true,
    },
  });
  fixtures.publishedShop = { id: publishedShop.id, slug: 'public-shop' };

  const unpublishedShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Unpublished Shop',
      timezone: 'America/Argentina/Tucuman',
      isActive: true,
    },
  });
  fixtures.unpublishedShop = { id: unpublishedShop.id };

  const inactiveShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerA.id,
      name: 'Inactive Shop',
      timezone: 'America/Argentina/Tucuman',
      publicSlug: 'inactive-shop',
      isActive: false,
    },
  });
  fixtures.inactiveShop = { id: inactiveShop.id, slug: 'inactive-shop' };

  const otherShop = await prisma.barbershop.create({
    data: {
      ownerId: ownerB.id,
      name: 'Other Shop',
      timezone: 'America/Argentina/Tucuman',
      publicSlug: 'other-shop',
      isActive: true,
    },
  });
  fixtures.otherShop = { id: otherShop.id, slug: 'other-shop' };

  const activeServiceA = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Second Created',
      description: 'Second service created',
      durationMinutes: 45,
      priceCents: 4500,
      currency: 'ARS',
      isActive: true,
    },
  });
  const activeServiceB = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Third Created',
      description: null,
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
      isActive: true,
    },
  });
  const inactiveService = await prisma.service.create({
    data: {
      barbershopId: publishedShop.id,
      name: 'Inactive Service',
      description: 'Should stay hidden',
      durationMinutes: 60,
      priceCents: 6000,
      currency: 'ARS',
      isActive: false,
      deletedAt: new Date(),
    },
  });
  const foreignService = await prisma.service.create({
    data: {
      barbershopId: otherShop.id,
      name: 'Foreign Service',
      durationMinutes: 25,
      priceCents: 2500,
      currency: 'ARS',
      isActive: true,
    },
  });

  fixtures.activeServiceA = { id: activeServiceA.id, name: activeServiceA.name };
  fixtures.activeServiceB = { id: activeServiceB.id, name: activeServiceB.name };
  fixtures.inactiveService = { id: inactiveService.id };
  fixtures.foreignService = { id: foreignService.id };

  const barberUserA = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_barber_a',
      email: 'public_catalog_barber_a@example.com',
      name: 'Barber A',
      role: 'BARBER',
    },
  });
  const barberUserB = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_barber_b',
      email: 'public_catalog_barber_b@example.com',
      name: 'Barber B',
      role: 'BARBER',
    },
  });
  const inactiveBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_barber_inactive',
      email: 'public_catalog_barber_inactive@example.com',
      name: 'Inactive Barber',
      role: 'BARBER',
    },
  });
  const unassignedBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_barber_unassigned',
      email: 'public_catalog_barber_unassigned@example.com',
      name: 'Unassigned Barber',
      role: 'BARBER',
    },
  });
  const foreignBarberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_public_catalog_barber_foreign',
      email: 'public_catalog_barber_foreign@example.com',
      name: 'Foreign Barber',
      role: 'BARBER',
    },
  });

  const eligibleBarberA = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: barberUserA.id,
      isActive: true,
    },
  });
  const eligibleBarberB = await prisma.employee.create({
    data: {
      barbershopId: publishedShop.id,
      userId: barberUserB.id,
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

  await prisma.employeeService.createMany({
    data: [
      { employeeId: eligibleBarberA.id, serviceId: activeServiceA.id },
      { employeeId: eligibleBarberB.id, serviceId: activeServiceA.id },
      { employeeId: eligibleBarberB.id, serviceId: activeServiceB.id },
      { employeeId: inactiveBarber.id, serviceId: activeServiceA.id },
      { employeeId: foreignBarber.id, serviceId: foreignService.id },
    ],
  });

  fixtures.eligibleBarberA = {
    employeeId: eligibleBarberA.id,
    name: barberUserA.name!,
  };
  fixtures.eligibleBarberB = {
    employeeId: eligibleBarberB.id,
    name: barberUserB.name!,
  };
  fixtures.inactiveBarber = { employeeId: inactiveBarber.id };
  fixtures.unassignedBarber = { employeeId: unassignedBarber.id };
});

beforeEach(async () => {
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
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

describe('GET /api/v1/public/barbershops/:slug', () => {
  it('returns the public shop DTO anonymously for an active published shop', async () => {
    const res = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        slug: fixtures.publishedShop.slug,
        name: 'Public Shop',
        timezone: 'America/Argentina/Tucuman',
      },
    });
  });

  it('omits private barbershop fields', async () => {
    const res = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}`
    );

    expect(res.body.data.ownerId).toBeUndefined();
    expect(res.body.data.id).toBeUndefined();
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.address).toBeUndefined();
  });

  it('fails closed for missing, unpublished, inactive, or noncanonical slugs', async () => {
    const missing = await request(app).get('/api/v1/public/barbershops/missing-shop');
    const unpublished = await request(app).get('/api/v1/public/barbershops/unpublished-shop');
    const inactive = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.inactiveShop.slug}`
    );
    const noncanonical = await request(app).get('/api/v1/public/barbershops/Public-Shop');

    for (const res of [missing, unpublished, inactive, noncanonical]) {
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('does not require authentication', async () => {
    const res = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/public/barbershops/:slug/services', () => {
  it('returns only active services from the resolved shop in deterministic order', async () => {
    const res = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/services`
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        serviceId: fixtures.activeServiceA.id,
        name: fixtures.activeServiceA.name,
        description: 'Second service created',
        durationMinutes: 45,
        priceCents: 4500,
        currency: 'ARS',
      },
      {
        serviceId: fixtures.activeServiceB.id,
        name: fixtures.activeServiceB.name,
        description: null,
        durationMinutes: 30,
        priceCents: 3000,
        currency: 'ARS',
      },
    ]);
  });

  it('excludes inactive and foreign services and ignores injected tenant hints', async () => {
    const res = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/services`)
      .query({ barbershopId: fixtures.otherShop.id })
      .set('x-test-user-id', 'test_public_catalog_owner_b');

    const returnedServiceIds = res.body.data.map(
      (service: { serviceId: string }) => service.serviceId
    );

    expect(returnedServiceIds).toEqual([
      fixtures.activeServiceA.id,
      fixtures.activeServiceB.id,
    ]);
    expect(returnedServiceIds).not.toContain(fixtures.inactiveService.id);
    expect(returnedServiceIds).not.toContain(fixtures.foreignService.id);
  });

  it('omits private service fields and fails closed for unavailable shops', async () => {
    const visible = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/services`
    );
    const hidden = await request(app).get('/api/v1/public/barbershops/unpublished-shop/services');

    expect(visible.body.data[0].barbershopId).toBeUndefined();
    expect(visible.body.data[0].isActive).toBeUndefined();
    expect(visible.body.data[0].createdAt).toBeUndefined();
    expect(hidden.status).toBe(404);
  });
});

describe('GET /api/v1/public/barbershops/:slug/barbers', () => {
  it('requires serviceId', async () => {
    const res = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns only active eligible barbers in deterministic order', async () => {
    const res = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
      .query({ serviceId: fixtures.activeServiceA.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        barberId: fixtures.eligibleBarberA.employeeId,
        displayName: fixtures.eligibleBarberA.name,
      },
      {
        barberId: fixtures.eligibleBarberB.employeeId,
        displayName: fixtures.eligibleBarberB.name,
      },
    ]);
  });

  it('excludes inactive, unassigned, and foreign employees', async () => {
    const res = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
      .query({ serviceId: fixtures.activeServiceA.id });

    const ids = res.body.data.map((barber: { barberId: string }) => barber.barberId);
    expect(ids).not.toContain(fixtures.inactiveBarber.employeeId);
    expect(ids).not.toContain(fixtures.unassignedBarber.employeeId);
  });

  it('fails closed for inactive or foreign services', async () => {
    const inactive = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
      .query({ serviceId: fixtures.inactiveService.id });
    const foreign = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
      .query({ serviceId: fixtures.foreignService.id });

    expect(inactive.status).toBe(404);
    expect(foreign.status).toBe(404);
  });

  it('omits private employee fields', async () => {
    const res = await request(app)
      .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
      .query({ serviceId: fixtures.activeServiceA.id });

    expect(res.body.data[0].userId).toBeUndefined();
    expect(res.body.data[0].email).toBeUndefined();
    expect(res.body.data[0].isActive).toBeUndefined();
  });
});

describe('GET /api/v1/public/barbershops/:slug/booking-config', () => {
  it('returns the public consent copy and policy values for an active published shop', async () => {
    const res = await request(app).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}/booking-config`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        consent: {
          version: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
          text: expect.stringContaining('Acepto compartir mis datos'),
        },
        policy: {
          minimumNoticeMinutes: 60,
          maximumBookingHorizonDays: 30,
          slotIntervalMinutes: 30,
        },
      },
    });
  });

  it('fails closed for unavailable shops', async () => {
    const res = await request(app).get(
      '/api/v1/public/barbershops/missing-shop/booking-config'
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('public catalog security regression', () => {
  it('keeps existing protected routes protected', async () => {
    const res = await request(app).get('/api/v1/me/context');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not expose raw Prisma fields in any catalog response', async () => {
    const [shop, services, barbers] = await Promise.all([
      request(app).get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}`),
      request(app).get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/services`),
      request(app)
        .get(`/api/v1/public/barbershops/${fixtures.publishedShop.slug}/barbers`)
        .query({ serviceId: fixtures.activeServiceA.id }),
    ]);

    expect(JSON.stringify(shop.body)).not.toContain('ownerId');
    expect(JSON.stringify(services.body)).not.toContain('deletedAt');
    expect(JSON.stringify(barbers.body)).not.toContain('clerkUserId');
  });
});

describe('public catalog read rate limiting', () => {
  it('allows normal requests below the threshold and returns 429 above it', async () => {
    const rateLimitedApp = createRateLimitedPublicApp();

    const first = await request(rateLimitedApp).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}`
    );
    const second = await request(rateLimitedApp).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}`
    );
    const third = await request(rateLimitedApp).get(
      `/api/v1/public/barbershops/${fixtures.publishedShop.slug}`
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.success).toBe(false);
    expect(third.body.error.code).toBe('PUBLIC_CATALOG_RATE_LIMITED');
  });
});
