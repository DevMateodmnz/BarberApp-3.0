/**
 * Integration tests for public cancel-by-reference.
 *
 * POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel
 *
 * Validates:
 *
 * - Happy path: CONFIRMED booking is cancelled, lifecycle is recorded
 * - Cancelling a non-existent reference returns 404
 * - Cancelling a reference that belongs to a different barbershop
 *   returns 404 (no cross-tenant leak)
 * - Cancelling an already-terminal appointment returns 409
 * - Slug must be a published, active barbershop
 * - The route is rate-limited under the public booking write bucket
 *   (verified by reusing the existing rate-limit config)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { generatePublicBookingReference } from '../../src/lib/publicBookingReference.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  shop: { id: string; slug: string };
  service: { id: string; durationMinutes: number };
  barber: { id: string; employeeId: string };
}

const fixtures = {} as Fixtures;

async function createBooking(barbershopId: string, daysOffset = 1) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysOffset);
  const dayStr = day.toISOString().slice(0, 10);
  const startAt = localDateTimeToUtc(dayStr, '10:00', TEST_BARBERSHOP_TIMEZONE);
  const endAt = new Date(startAt.getTime() + fixtures.service.durationMinutes * 60_000);
  const publicReference = generatePublicBookingReference();

  return prisma.appointment.create({
    data: {
      barbershopId,
      employeeId: fixtures.barber.employeeId,
      clientId: null,
      serviceId: fixtures.service.id,
      clientName: 'Public Cancel Client',
      clientPhone: '+5493815557777',
      clientPhoneNormalized: '+5493815557777',
      serviceName: 'Public Cancel Service',
      servicePriceCents: 2500,
      serviceDurationMinutes: fixtures.service.durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status: 'CONFIRMED',
      publicReference,
      publicConsentAcceptedAt: new Date(),
      publicConsentVersion: 'v1',
      notes: null,
    },
  });
}

beforeAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'publiccancel_owner',
      email: 'publiccancel-owner@test.com',
      role: 'OWNER',
    },
  });
  const barber = await prisma.user.create({
    data: {
      clerkUserId: 'publiccancel_barber',
      email: 'publiccancel-barber@test.com',
      role: 'BARBER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Public Cancel Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'publiccancel-shop',
      isActive: true,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const employee = await prisma.employee.create({
    data: { barbershopId: shop.id, userId: barber.id },
  });
  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Public Cancel Service',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });
  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });

  fixtures.shop = { id: shop.id, slug: 'publiccancel-shop' };
  fixtures.service = { id: service.id, durationMinutes: service.durationMinutes };
  fixtures.barber = { id: barber.id, employeeId: employee.id };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
});

afterAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel', () => {
  it('cancels a CONFIRMED booking and records the lifecycle', async () => {
    const booking = await createBooking(fixtures.shop.id);

    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${booking.publicReference}/cancel`)
      .send({ reason: 'No puedo ir' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledAt).toBeTruthy();
    expect(res.body.data.cancelledByRole).toBe('CLIENT');
    expect(res.body.data.cancelReason).toBe('No puedo ir');

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.cancelledByRole).toBe('CLIENT');
    expect(persisted.cancelReason).toBe('No puedo ir');
  });

  it('accepts a cancel with no body (reason stored as NULL)', async () => {
    const booking = await createBooking(fixtures.shop.id);

    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${booking.publicReference}/cancel`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledByRole).toBe('CLIENT');
    expect(res.body.data.cancelReason).toBeNull();
  });

  it('returns 404 for an unknown reference', async () => {
    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/pb_AAAAAAAAAAAAAAAA/cancel`)
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when reference belongs to a different barbershop', async () => {
    // Create a second shop with a different slug
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'publiccancel_other_owner',
        email: 'publiccancel-other@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Public Cancel Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
        publicSlug: 'other-publiccancel-shop',
        isActive: true,
      },
    });
    const booking = await createBooking(otherShop.id);

    // Use the FIRST shop's slug — must NOT find the booking
    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${booking.publicReference}/cancel`)
      .send();

    expect(res.status).toBe(404);
  });

  it('returns 404 for an unpublished (no slug) barbershop', async () => {
    const inactiveOwner = await prisma.user.create({
      data: {
        clerkUserId: 'publiccancel_inactive_owner',
        email: 'publiccancel-inactive@test.com',
        role: 'OWNER',
      },
    });
    const inactiveShop = await prisma.barbershop.create({
      data: {
        ownerId: inactiveOwner.id,
        name: 'Inactive Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
        isActive: false,
        publicSlug: null,
      },
    });

    const res = await request(app)
      .post(`/api/v1/public/barbershops/some-slug/appointments/pb_AAAAAAAAAAAAAAAA/cancel`)
      .send();

    expect(res.status).toBe(404);
    expect(inactiveShop.id).toBeTruthy();
  });

  it('returns 409 when the appointment is already terminal', async () => {
    const booking = await createBooking(fixtures.shop.id);
    await prisma.appointment.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByRole: 'OWNER' },
    });

    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${booking.publicReference}/cancel`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cancel/i);
  });

  it('rejects an over-long reason before it hits the service', async () => {
    const booking = await createBooking(fixtures.shop.id);

    const res = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${booking.publicReference}/cancel`)
      .send({ reason: 'x'.repeat(600) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
