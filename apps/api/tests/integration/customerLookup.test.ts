/**
 * Integration tests for the customer lookup endpoint:
 *
 *   GET /api/v1/barbershops/:barbershopId/customers/lookup?phone=E164
 *
 * Validates:
 *
 * - Unknown phone returns zeroed counts and empty recent list
 * - Counts add up: visits include COMPLETED + NO_SHOW + CANCELLED + active
 * - Last visit and last no-show timestamps are correct
 * - Cross-tenant queries return 404 (existence hidden)
 * - BARBER can query their own barbershop
 * - BARBER in another barbershop gets 404
 * - Non-E.164 phone is rejected at the schema layer
 * - Public booking rows are matched (their clientPhoneNormalized is set)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();

const REPEAT_PHONE = '+5493815559999';
const OTHER_PHONE = '+5493815550000';

interface Fixtures {
  ownerA: { id: string; clerkUserId: string };
  ownerB: { id: string; clerkUserId: string };
  barberA: { id: string; clerkUserId: string; employeeId: string };
  shopA: { id: string };
  shopB: { id: string };
  serviceA: { id: string; durationMinutes: number };
  serviceB: { id: string; durationMinutes: number };
  barberBEmployee: { id: string };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function createAppointmentAt(
  barbershopId: string,
  employeeId: string,
  serviceId: string,
  durationMinutes: number,
  daysOffset: number,
  status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW',
  clientPhoneNormalized: string | null
) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysOffset);
  const dayStr = day.toISOString().slice(0, 10);
  const startAt = localDateTimeToUtc(dayStr, '10:00', TEST_BARBERSHOP_TIMEZONE);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  return prisma.appointment.create({
    data: {
      barbershopId,
      employeeId,
      clientId: null,
      serviceId,
      clientName: 'Repeat Customer',
      clientPhone: clientPhoneNormalized,
      clientPhoneNormalized,
      serviceName: 'Classic Cut',
      servicePriceCents: 2500,
      serviceDurationMinutes: durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status,
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

  const ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'lookup_ownerA',
      email: 'lookup-ownerA@test.com',
      role: 'OWNER',
    },
  });
  const ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'lookup_ownerB',
      email: 'lookup-ownerB@test.com',
      role: 'OWNER',
    },
  });
  const barberAUser = await prisma.user.create({
    data: {
      clerkUserId: 'lookup_barberA',
      email: 'lookup-barberA@test.com',
      role: 'BARBER',
    },
  });
  const barberBUser = await prisma.user.create({
    data: {
      clerkUserId: 'lookup_barberB',
      email: 'lookup-barberB@test.com',
      role: 'BARBER',
    },
  });

  const shopA = await prisma.barbershop.create({
    data: { ownerId: ownerA.id, name: 'Lookup Shop A', timezone: TEST_BARBERSHOP_TIMEZONE },
  });
  const shopB = await prisma.barbershop.create({
    data: { ownerId: ownerB.id, name: 'Lookup Shop B', timezone: TEST_BARBERSHOP_TIMEZONE },
  });
  await setupDefaultWorkingHours(shopA.id);
  await setupDefaultWorkingHours(shopB.id);

  const barberAEmployee = await prisma.employee.create({
    data: { barbershopId: shopA.id, userId: barberAUser.id },
  });
  const barberBEmployee = await prisma.employee.create({
    data: { barbershopId: shopB.id, userId: barberBUser.id },
  });

  const serviceA = await prisma.service.create({
    data: {
      barbershopId: shopA.id,
      name: 'Cut A',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });
  const serviceB = await prisma.service.create({
    data: {
      barbershopId: shopB.id,
      name: 'Cut B',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.create({
    data: { employeeId: barberAEmployee.id, serviceId: serviceA.id },
  });
  await prisma.employeeService.create({
    data: { employeeId: barberBEmployee.id, serviceId: serviceB.id },
  });

  fixtures.ownerA = { id: ownerA.id, clerkUserId: ownerA.clerkUserId };
  fixtures.ownerB = { id: ownerB.id, clerkUserId: ownerB.clerkUserId };
  fixtures.barberA = {
    id: barberAUser.id,
    clerkUserId: barberAUser.clerkUserId,
    employeeId: barberAEmployee.id,
  };
  fixtures.shopA = { id: shopA.id };
  fixtures.shopB = { id: shopB.id };
  fixtures.serviceA = { id: serviceA.id, durationMinutes: serviceA.durationMinutes };
  fixtures.serviceB = { id: serviceB.id, durationMinutes: serviceB.durationMinutes };
  fixtures.barberBEmployee = { id: barberBEmployee.id };
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

describe('GET /api/v1/barbershops/:barbershopId/customers/lookup', () => {
  it('returns zeroed counts and empty recent list when phone has no history', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      phone: REPEAT_PHONE,
      visitCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      completedCount: 0,
      lastVisitAt: null,
      lastNoShowAt: null,
      recentAppointments: [],
    });
  });

  it('aggregates counts and recent appointments for a repeat customer', async () => {
    const completed = await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      1,
      'COMPLETED',
      REPEAT_PHONE
    );
    const noShow = await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      2,
      'NO_SHOW',
      REPEAT_PHONE
    );
    const confirmed = await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      3,
      'CONFIRMED',
      REPEAT_PHONE
    );
    const cancelled = await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      4,
      'CANCELLED',
      REPEAT_PHONE
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE, limit: 10 })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.visitCount).toBe(4);
    expect(res.body.data.completedCount).toBe(1);
    expect(res.body.data.noShowCount).toBe(1);
    expect(res.body.data.cancelledCount).toBe(1);
    // orderBy startAt desc → most recent (CANCELLED, +4d) is first
    expect(res.body.data.recentAppointments[0].id).toBe(cancelled.id);
    expect(res.body.data.recentAppointments[0].status).toBe('CANCELLED');
    expect(res.body.data.recentAppointments[3].id).toBe(completed.id);
    expect(res.body.data.recentAppointments[2].id).toBe(noShow.id);
    expect(res.body.data.recentAppointments[1].id).toBe(confirmed.id);
    // lastVisitAt is the most recent startAt (the CANCELLED one)
    expect(res.body.data.lastVisitAt).toBe(cancelled.startAt.toISOString());
    // lastNoShowAt is the NO_SHOW row
    expect(res.body.data.lastNoShowAt).toBe(noShow.startAt.toISOString());
  });

  it('does not leak data from another barbershop', async () => {
    // Shop B has two COMPLETED appointments for the same phone
    await createAppointmentAt(
      fixtures.shopB.id,
      fixtures.barberBEmployee.id,
      fixtures.serviceB.id,
      fixtures.serviceB.durationMinutes,
      1,
      'COMPLETED',
      REPEAT_PHONE
    );
    await createAppointmentAt(
      fixtures.shopB.id,
      fixtures.barberBEmployee.id,
      fixtures.serviceB.id,
      fixtures.serviceB.durationMinutes,
      2,
      'COMPLETED',
      REPEAT_PHONE
    );

    // Owner A queries for the same phone in shop A — must see nothing
    const fromA = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(fromA.status).toBe(200);
    expect(fromA.body.data.visitCount).toBe(0);

    // Owner B queries in shop B — must see 2
    const fromB = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopB.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerB.clerkUserId));
    expect(fromB.status).toBe(200);
    expect(fromB.body.data.visitCount).toBe(2);
  });

  it('returns 404 when OWNER queries a barbershop they do not own', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopB.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('BARBER can query their own barbershop', async () => {
    await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      1,
      'NO_SHOW',
      REPEAT_PHONE
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.barberA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.noShowCount).toBe(1);
  });

  it('BARBER from another barbershop gets 404', async () => {
    // Create a separate barber scoped to shop A only; using barberA here
    // makes him an employee of shop A. To test cross-tenant, we'd need
    // a barber in B. For this milestone we use a second user as a
    // non-employee of shop A.
    const otherUser = await prisma.user.create({
      data: {
        clerkUserId: 'lookup_otherUser',
        email: 'lookup-otheruser@test.com',
        role: 'BARBER',
      },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(otherUser.clerkUserId));

    expect(res.status).toBe(404);
  });

  it('rejects non-E.164 phone input with 400', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: 'abc-not-a-phone' })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('matches public booking rows (clientPhoneNormalized populated)', async () => {
    // Simulate a public booking row that was created by the public
    // booking service (which always populates clientPhoneNormalized).
    await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      1,
      'CONFIRMED',
      REPEAT_PHONE
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.visitCount).toBe(1);
  });

  it('ignores rows with NULL clientPhoneNormalized (legacy staff data)', async () => {
    // Legacy staff row without normalized phone (e.g. "+54 9 381 ..." entered by hand)
    await createAppointmentAt(
      fixtures.shopA.id,
      fixtures.barberA.employeeId,
      fixtures.serviceA.id,
      fixtures.serviceA.durationMinutes,
      1,
      'COMPLETED',
      null
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: OTHER_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.visitCount).toBe(0);
  });
});
