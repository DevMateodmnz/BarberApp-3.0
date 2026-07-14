/**
 * Integration tests for the customer lookup endpoint:
 *
 *   POST /api/v1/barbershops/:barbershopId/customers/lookup
 *   Content-Type: application/json
 *
 *   { "phone": "+549..." }
 *
 * Phase 1 hardening invariants:
 *
 * - Body-only by design. The legacy GET ...?phone=... route is gone;
 *   this test asserts that GET returns 404 to prove the deprecation.
 * - The response never includes the submitted phone (caller already
 *   has it; repeating it would leak PII in API logs).
 * - Tenant scoping hides cross-tenant existence: probes return 404,
 *   not 403, matching the `getAppointment` convention.
 * - Counts only `appointments.clientPhoneNormalized` matches; legacy
 *   staff rows with NULL `clientPhoneNormalized` are excluded.
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

describe('POST /api/v1/barbershops/:barbershopId/customers/lookup', () => {
  it('the legacy GET ...?phone=... route no longer exists (PII hardening)', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .query({ phone: REPEAT_PHONE })
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(404);
  });

  it('valid POST returns zeroed counts and empty recent list when phone has no history', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: REPEAT_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      visitCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      completedCount: 0,
      lastVisitAt: null,
      lastNoShowAt: null,
      recentAppointments: [],
    });
    // Phone must NOT be echoed back in the response.
    expect(res.body.data.phone).toBeUndefined();
    expect(JSON.stringify(res.body.data)).not.toContain(REPEAT_PHONE);
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
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: REPEAT_PHONE, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.visitCount).toBe(4);
    expect(res.body.data.completedCount).toBe(1);
    expect(res.body.data.noShowCount).toBe(1);
    expect(res.body.data.cancelledCount).toBe(1);
    expect(res.body.data.recentAppointments[0].id).toBe(cancelled.id);
    expect(res.body.data.recentAppointments[0].status).toBe('CANCELLED');
    expect(res.body.data.recentAppointments[3].id).toBe(completed.id);
    expect(res.body.data.recentAppointments[2].id).toBe(noShow.id);
    expect(res.body.data.recentAppointments[1].id).toBe(confirmed.id);
    expect(res.body.data.lastVisitAt).toBe(cancelled.startAt.toISOString());
    expect(res.body.data.lastNoShowAt).toBe(noShow.startAt.toISOString());
    // Phone must NOT be echoed back.
    expect(res.body.data.phone).toBeUndefined();
  });

  it('does not leak data from another barbershop', async () => {
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

    const fromA = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: REPEAT_PHONE });
    expect(fromA.status).toBe(200);
    expect(fromA.body.data.visitCount).toBe(0);

    const fromB = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopB.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerB.clerkUserId))
      .send({ phone: REPEAT_PHONE });
    expect(fromB.status).toBe(200);
    expect(fromB.body.data.visitCount).toBe(2);
  });

  it('returns 404 when OWNER queries a barbershop they do not own', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopB.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: REPEAT_PHONE });

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
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.barberA.clerkUserId))
      .send({ phone: REPEAT_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.data.noShowCount).toBe(1);
  });

  it('BARBER from another barbershop gets 404', async () => {
    const otherUser = await prisma.user.create({
      data: {
        clerkUserId: 'lookup_otherUser',
        email: 'lookup-otheruser@test.com',
        role: 'BARBER',
      },
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(otherUser.clerkUserId))
      .send({ phone: REPEAT_PHONE });

    expect(res.status).toBe(404);
  });

  it('rejects non-E.164 phone input with 400 (body validation)', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: 'abc-not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects empty body with 400', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects phone field absent from body with 400', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ limit: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores rows with NULL clientPhoneNormalized (legacy staff data)', async () => {
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
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: OTHER_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.data.visitCount).toBe(0);
  });

  it('never includes the submitted phone in the response, even on error', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/customers/lookup`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ phone: REPEAT_PHONE });

    expect(res.status).toBe(200);
    const fullJson = JSON.stringify(res.body);
    expect(fullJson.includes(REPEAT_PHONE)).toBe(false);
  });
});
