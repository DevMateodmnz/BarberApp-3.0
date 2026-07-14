/**
 * Integration tests for the appointment lifecycle behavior added in
 * Phase 1. Validates that:
 *
 * - PENDING -> CONFIRMED stamps `confirmedAt`
 * - CONFIRMED -> IN_PROGRESS stamps `startedAt`
 * - IN_PROGRESS -> COMPLETED stamps `completedAt`
 * - IN_PROGRESS -> NO_SHOW stamps `noShowAt`
 * - DELETE with `{ reason }` stamps `cancelledAt`, `cancelledByRole`,
 *   and `cancelReason`
 * - DELETE without a reason still records timestamps and a NULL reason
 * - Cancelled rows can no longer be transitioned
 * - Existing transition rules still apply (invalid transitions rejected)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  client: { id: string; clerkUserId: string };
  barbershop: { id: string };
  service: { id: string; durationMinutes: number };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function createFutureAppointment(status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS') {
  // Pick a slot two days out at 10:00 local time so the row is never
  // in the past regardless of when the test suite runs.
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 2);
  const dayAfter = base.toISOString().slice(0, 10);
  const startAt = localDateTimeToUtc(dayAfter, '10:00', TEST_BARBERSHOP_TIMEZONE);
  const endAt = new Date(startAt.getTime() + fixtures.service.durationMinutes * 60_000);

  return prisma.appointment.create({
    data: {
      barbershopId: fixtures.barbershop.id,
      employeeId: fixtures.barber.employeeId,
      clientId: fixtures.client.id,
      serviceId: fixtures.service.id,
      clientName: 'Lifecycle Client',
      clientPhone: '+5493815551234',
      clientPhoneNormalized: '+5493815551234',
      serviceName: 'Lifecycle Service',
      servicePriceCents: 2500,
      serviceDurationMinutes: fixtures.service.durationMinutes,
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

  const ownerUser = await prisma.user.create({
    data: {
      clerkUserId: 'lifecycle_owner',
      email: 'lifecycle-owner@test.com',
      name: 'Lifecycle Owner',
      role: 'OWNER',
    },
  });
  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'lifecycle_barber',
      email: 'lifecycle-barber@test.com',
      name: 'Lifecycle Barber',
      role: 'BARBER',
    },
  });
  const clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'lifecycle_client',
      email: 'lifecycle-client@test.com',
      name: 'Lifecycle Client',
      role: 'CLIENT',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: ownerUser.id,
      name: 'Lifecycle Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const employee = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberUser.id,
    },
  });

  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Lifecycle Service',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });

  fixtures.owner = { id: ownerUser.id, clerkUserId: ownerUser.clerkUserId };
  fixtures.barber = {
    id: barberUser.id,
    clerkUserId: barberUser.clerkUserId,
    employeeId: employee.id,
  };
  fixtures.client = { id: clientUser.id, clerkUserId: clientUser.clerkUserId };
  fixtures.barbershop = { id: shop.id };
  fixtures.service = { id: service.id, durationMinutes: service.durationMinutes };
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

describe('status transitions stamp the right lifecycle timestamp', () => {
  it('PENDING -> CONFIRMED stamps confirmedAt', async () => {
    const appointment = await createFutureAppointment('PENDING');

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);
    expect(res.body.data.confirmedAt).toBeTruthy();
    expect(res.body.data.startedAt).toBeNull();
    expect(res.body.data.completedAt).toBeNull();
    expect(res.body.data.cancelledAt).toBeNull();
    expect(res.body.data.noShowAt).toBeNull();

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(persisted.confirmedAt).toBeInstanceOf(Date);
    expect(persisted.startedAt).toBeNull();
  });

  it('CONFIRMED -> IN_PROGRESS stamps startedAt', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.startedAt).toBeTruthy();
    expect(res.body.data.completedAt).toBeNull();
  });

  it('IN_PROGRESS -> COMPLETED stamps completedAt', async () => {
    const appointment = await createFutureAppointment('IN_PROGRESS');

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).toBeTruthy();
  });

  it('IN_PROGRESS -> NO_SHOW stamps noShowAt', async () => {
    const appointment = await createFutureAppointment('IN_PROGRESS');

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ status: 'NO_SHOW' });

    expect(res.status).toBe(200);
    expect(res.body.data.noShowAt).toBeTruthy();
    expect(res.body.data.completedAt).toBeNull();
  });
});

describe('cancel records actor, timestamp, and reason', () => {
  it('OWNER cancel with reason persists cancelledAt, cancelledByRole, cancelReason', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');

    const res = await request(app)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ reason: 'Cliente no respondió llamadas' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledAt).toBeTruthy();
    expect(res.body.data.cancelledByRole).toBe('OWNER');
    expect(res.body.data.cancelReason).toBe('Cliente no respondió llamadas');

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(persisted.cancelledByRole).toBe('OWNER');
    expect(persisted.cancelReason).toBe('Cliente no respondió llamadas');
  });

  it('CLIENT self-cancel without a body still records timestamps and a NULL reason', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');

    const res = await request(app)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set(authHeader(fixtures.client.clerkUserId))
      .send();

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledAt).toBeTruthy();
    expect(res.body.data.cancelledByRole).toBe('CLIENT');
    expect(res.body.data.cancelReason).toBeNull();
  });

  it('rejects overly long reasons before they hit the service', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');

    const res = await request(app)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ reason: 'x'.repeat(600) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('terminal states are immutable', () => {
  it('cannot transition a CANCELLED appointment', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByRole: 'OWNER',
      },
    });

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/terminal/i);
  });

  it('cannot cancel an already-cancelled appointment', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByRole: 'OWNER',
      },
    });

    const res = await request(app)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ reason: 'second attempt' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cancel/i);
  });
});

describe('regression: prior behavior still holds', () => {
  it('BARBER cannot mark CONFIRMED (status transition rules unchanged)', async () => {
    const appointment = await createFutureAppointment('PENDING');

    const res = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('cross-tenant cancel returns not found (no data leak)', async () => {
    const appointment = await createFutureAppointment('CONFIRMED');

    // Build an attacker OWNER in a different barbershop
    const attackerOwner = await prisma.user.create({
      data: {
        clerkUserId: 'lifecycle_attacker_owner',
        email: 'lifecycle-attacker@test.com',
        role: 'OWNER',
      },
    });
    const attackerShop = await prisma.barbershop.create({
      data: { ownerId: attackerOwner.id, name: 'Attacker Shop' },
    });
    await setupDefaultWorkingHours(attackerShop.id);

    const res = await request(app)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set(authHeader(attackerOwner.clerkUserId))
      .send({ reason: 'hijack' });

    expect(res.status).toBe(404);

    const persisted = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(persisted.status).toBe('CONFIRMED');
    expect(persisted.cancelledAt).toBeNull();
    expect(persisted.cancelReason).toBeNull();
  });
});
