/**
 * Integration tests for the atomic, time-bounded public cancel flow:
 *
 *   POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel
 *
 * Phase 1 hardening invariants:
 *
 * - Cancellation is allowed only when status === 'CONFIRMED' AND
 *   startAt is strictly in the future. Anything else returns 409
 *   with a deterministic, stable error code.
 * - The check + state mutation run in a single transaction so a
 *   concurrent staff transition (e.g. marking NO_SHOW) cannot race
 *   and silently convert a missed appointment into a "cancel".
 * - The row is stamped with `cancellationSource = 'PUBLIC_BOOKING'`
 *   and `cancelledByRole = NULL`. The legacy `cancelledByRole = CLIENT`
 *   sentinel is no longer used for anonymous guests.
 * - Unknown references and cross-tenant probes still return 404 with
 *   no information leak.
 * - The route is rate-limited under the public booking write bucket.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { generatePublicBookingReference } from '../../src/lib/publicBookingReference.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  shop: { id: string; slug: string };
  service: { id: string; durationMinutes: number };
}

const fixtures = {} as Fixtures;

async function createBookingAt(
  startAt: Date,
  status: 'CONFIRMED' | 'PENDING' | 'IN_PROGRESS' | 'CANCELLED' | 'NO_SHOW' = 'CONFIRMED'
) {
  const endAt = new Date(startAt.getTime() + fixtures.service.durationMinutes * 60_000);
  return prisma.appointment.create({
    data: {
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barber.employeeId,
      clientId: null,
      serviceId: fixtures.service.id,
      clientName: 'Public Cancel Client',
      clientPhone: '+5493815557777',
      clientPhoneNormalized: '+5493815557777',
      serviceName: 'Public Cancel Service',
      servicePriceCents: 2500,

      discountCents: 0,

      finalPriceCents: 2500,
      serviceDurationMinutes: fixtures.service.durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status,
      publicReference: generatePublicBookingReference(),
      publicConsentAcceptedAt: new Date(),
      publicConsentVersion: 'v1',
      notes: null,
    },
  });
}

beforeAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

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

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barber = {
    id: barber.id,
    clerkUserId: barber.clerkUserId,
    employeeId: employee.id,
  };
  fixtures.shop = { id: shop.id, slug: 'publiccancel-shop' };
  fixtures.service = { id: service.id, durationMinutes: service.durationMinutes };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
});

afterAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

function cancelUrl(reference: string) {
  return `/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${reference}/cancel`;
}

describe('POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel', () => {
  it('cancels a future CONFIRMED booking and records PUBLIC_BOOKING source with null actor', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send({
      reason: 'No puedo ir',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(res.body.data.cancelledAt).toBeTruthy();
    expect(res.body.data.cancelReason).toBe('No puedo ir');

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.cancelledByRole).toBeNull();
    expect(persisted.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(persisted.cancelReason).toBe('No puedo ir');
  });

  it('accepts a cancel with no body (reason stored as NULL)', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();

    expect(res.status).toBe(200);
    expect(res.body.data.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(res.body.data.cancelReason).toBeNull();
  });

  it('rejects body validation errors with 400 before hitting the service', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app)
      .post(cancelUrl(booking.publicReference!))
      .send({ reason: 'x'.repeat(600) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown reference (existence hidden)', async () => {
    const res = await request(app)
      .post(cancelUrl('pb_AAAAAAAAAAAAAAAA'))
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
    const booking = await createBookingAt(
      new Date(Date.now() + 60 * 60_000),
      'CONFIRMED'
    );
    // Move the booking to the other shop for the test
    await prisma.appointment.update({
      where: { id: booking.id },
      data: { barbershopId: otherShop.id },
    });

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
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
    await prisma.barbershop.create({
      data: {
        ownerId: inactiveOwner.id,
        name: 'Inactive Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
        isActive: false,
        publicSlug: null,
      },
    });

    const res = await request(app)
      .post(cancelUrl('pb_AAAAAAAAAAAAAAAA'))
      .send();

    expect(res.status).toBe(404);
  });

  it('cancels a booking whose startAt is well in the future (1 hour ahead)', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(200);
    expect(res.body.data.cancellationSource).toBe('PUBLIC_BOOKING');
  });

  it('returns 409 PUBLIC_BOOKING_CANCELLATION_CLOSED one second before start (boundary closed)', async () => {
    // startAt is one second in the past relative to the request moment.
    // Cancellation must be closed because startAt <= now.
    const startAt = new Date(Date.now() - 1_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_CANCELLATION_CLOSED');
  });

  it('returns 409 PUBLIC_BOOKING_CANCELLATION_CLOSED exactly at start (startAt === now is closed)', async () => {
    const startAt = new Date();
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_CANCELLATION_CLOSED');
  });

  it('returns 409 PUBLIC_BOOKING_CANCELLATION_CLOSED well after start', async () => {
    const startAt = new Date(Date.now() - 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_CANCELLATION_CLOSED');
  });

  it('returns 409 for PENDING rows (active but not customer-cancellable)', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'PENDING');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_CANCELLATION_CLOSED');
  });

  it('returns 409 PUBLIC_BOOKING_ALREADY_TERMINAL when staff already cancelled the row', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');
    await prisma.appointment.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByRole: 'OWNER',
        cancellationSource: 'STAFF',
      },
    });

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_ALREADY_TERMINAL');
  });

  it('repeated cancel after success returns stable 409 ALREADY_TERMINAL (idempotent on the row, not the request)', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const first = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(first.status).toBe(200);

    const second = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PUBLIC_BOOKING_ALREADY_TERMINAL');

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(persisted.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(persisted.cancelledByRole).toBeNull();
  });

  it('concurrent staff NO_SHOW wins atomically over public cancel (only one transition is recorded)', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    // Simulate the race: a staff transition and a public cancel run
    // back to back. The atomic transaction in cancelPublicBookingByReference
    // re-reads inside the transaction, so whichever finishes first
    // commits and the other observes the terminal state.
    const publicCancel = request(app)
      .post(cancelUrl(booking.publicReference!))
      .send();

    const staffUpdate = prisma.appointment.update({
      where: { id: booking.id },
      data: {
        status: 'NO_SHOW',
        noShowAt: new Date(),
      },
    });

    const [publicRes, staffRes] = await Promise.all([publicCancel, staffUpdate]);

    // The staff update must succeed unconditionally (returns the row).
    expect(staffRes.id).toBe(booking.id);
    expect(staffRes.status).toBe('NO_SHOW');

    // The public cancel must observe the terminal state and return 409
    // with the correct stable code (ALREADY_TERMINAL once NO_SHOW).
    expect(publicRes.status).toBe(409);
    expect(publicRes.body.error.code).toBe('PUBLIC_BOOKING_ALREADY_TERMINAL');

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: booking.id },
    });
    // The staff transition wins atomically; the public cancel sees
    // the terminal state and never overwrites it.
    expect(persisted.status).toBe('NO_SHOW');
    expect(persisted.cancellationSource).toBeNull();
    expect(persisted.cancelledByRole).toBeNull();
  });

  it('is timezone-independent: a UTC instant in the past is closed regardless of the barbershop timezone', async () => {
    // Create a booking whose startAt is 5 minutes in the past in UTC.
    const startAt = new Date(Date.now() - 5 * 60_000);
    const booking = await createBookingAt(startAt, 'CONFIRMED');

    const res = await request(app).post(cancelUrl(booking.publicReference!)).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLIC_BOOKING_CANCELLATION_CLOSED');
  });
});
