/**
 * Working Hours Management Integration Tests — PR-021
 *
 * Validates OWNER-managed working hours view and update endpoints:
 * GET  /api/v1/barbershops/:barbershopId/working-hours
 * PUT  /api/v1/barbershops/:barbershopId/working-hours
 *
 * Also validates that updated hours affect appointment booking.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import type { User, Barbershop, Employee, Service } from '@prisma/client';
import { getNextLocalWeekdayTime } from '../helpers/timezone.js';

const app = createAppFromEnv();

// ============================================
// TEST FIXTURES
// ============================================

interface TestFixtures {
  ownerA: User;
  shopA: Barbershop;
  barberUser: User;
  clientUser: User;
  ownerB: User;
  shopB: Barbershop;
  // For booking tests
  employeeA: Employee;
  serviceA: Service;
}

const fixtures: TestFixtures = {} as TestFixtures;

// ============================================
// HELPERS
// ============================================

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function nextBuenosAiresWeekdayTimeIso(
  dayOfWeek: number,
  time: string
): string {
  return getNextLocalWeekdayTime(
    dayOfWeek,
    time,
    new Date(),
    'America/Argentina/Buenos_Aires'
  ).toISOString();
}

const DEFAULT_HOURS = [
  { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' }, // Monday
  { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' }, // Tuesday
  { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' }, // Wednesday
  { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' }, // Thursday
  { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' }, // Friday
  { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' }, // Saturday
];

async function resetWorkingHours(shopId: string) {
  await prisma.workingHours.deleteMany({ where: { barbershopId: shopId } });
  await prisma.workingHours.createMany({
    data: DEFAULT_HOURS.map((d) => ({ ...d, barbershopId: shopId })),
  });
}

async function setupForBooking(shopId: string) {
  // Create employee for barberUser
  const employee = await prisma.employee.create({
    data: { barbershopId: shopId, userId: fixtures.barberUser.id, isActive: true },
  });
  // Create service
  const service = await prisma.service.create({
    data: { barbershopId: shopId, name: 'Test Service', durationMinutes: 30, priceCents: 1000 },
  });
  // Link them
  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });
  return { employee, service };
}

function bookAppointment(
  shopId: string,
  empId: string,
  svcId: string,
  clientClerkId: string,
  startAtISO: string
) {
  return request(app)
    .post('/api/v1/appointments')
    .set(authHeader(clientClerkId))
    .send({ barbershopId: shopId, employeeId: empId, serviceId: svcId, startAt: startAtISO });
}

// ============================================
// SETUP / TEARDOWN
// ============================================

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

  // Owner A + Shop A
  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerA_wh',
      email: 'ownerA_wh@test.com',
      name: 'Owner A WH',
      role: 'OWNER',
    },
  });

  fixtures.shopA = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerA.id,
      name: 'Shop A WH',
      address: '123 Working Hours St',
      phone: '+541112345670',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  // Default working hours for Shop A
  await prisma.workingHours.createMany({
    data: DEFAULT_HOURS.map((d) => ({ ...d, barbershopId: fixtures.shopA.id })),
  });

  // Barber user (not yet linked to any shop)
  fixtures.barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber_wh',
      email: 'barber_wh@test.com',
      name: 'Barber WH',
      role: 'BARBER',
    },
  });

  // Client user
  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_client_wh',
      email: 'client_wh@test.com',
      name: 'Client WH',
      role: 'CLIENT',
    },
  });

  // Owner B + Shop B (separate tenant)
  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerB_wh',
      email: 'ownerB_wh@test.com',
      name: 'Owner B WH',
      role: 'OWNER',
    },
  });

  fixtures.shopB = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerB.id,
      name: 'Shop B WH',
      address: '456 Other St',
      phone: '+541129876540',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  // Default working hours for Shop B
  await prisma.workingHours.createMany({
    data: DEFAULT_HOURS.map((d) => ({ ...d, barbershopId: fixtures.shopB.id })),
  });

  // Booking infrastructure: create employee + service for Shop A
  const booking = await setupForBooking(fixtures.shopA.id);
  fixtures.employeeA = booking.employee;
  fixtures.serviceA = booking.service;
});

afterAll(async () => {
  // Restore default hours for all shops
  await resetWorkingHours(fixtures.shopA.id);
  await resetWorkingHours(fixtures.shopB.id);
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/working-hours
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/working-hours', () => {
  it('OWNER gets working hours — 200, ordered by dayOfWeek', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    // Verify sorted by dayOfWeek ASC
    const days = res.body.data.map((d: { dayOfWeek: number }) => d.dayOfWeek);
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]);
    }
  });

  it('GET returns expected shape (id, dayOfWeek, openTime, closeTime, isActive)', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('dayOfWeek');
    expect(item).toHaveProperty('openTime');
    expect(item).toHaveProperty('closeTime');
    expect(item).toHaveProperty('isActive');
    // Must NOT expose internal fields
    expect(item).not.toHaveProperty('createdAt');
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('barbershopId');
  });

  it('BARBER cannot GET — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot GET — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.clientUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app).get(
      `/api/v1/barbershops/${fixtures.shopA.id}/working-hours`
    );

    expect(res.status).toBe(401);
  });

  it('cross-tenant OWNER cannot GET — 403', async () => {
    // Owner A tries to access Shop B
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopB.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });
});

// ============================================
// PUT /api/v1/barbershops/:barbershopId/working-hours
// ============================================

describe('PUT /api/v1/barbershops/:barbershopId/working-hours', () => {
  it('OWNER updates working hours successfully — 200', async () => {
    const newHours = [
      { dayOfWeek: 1, openTime: '08:00', closeTime: '18:00' },
      { dayOfWeek: 2, openTime: '08:00', closeTime: '18:00' },
      { dayOfWeek: 3, openTime: '08:00', closeTime: '18:00' },
      { dayOfWeek: 4, openTime: '08:00', closeTime: '18:00' },
      { dayOfWeek: 5, openTime: '08:00', closeTime: '18:00' },
      { dayOfWeek: 6, openTime: '08:00', closeTime: '13:00' },
    ];

    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ workingHours: newHours });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify Monday was updated
    const monday = res.body.data.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    expect(monday).toBeDefined();
    expect(monday.openTime).toBe('08:00');
    expect(monday.closeTime).toBe('18:00');

    // Verify via GET
    const getRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    const getMonday = getRes.body.data.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    expect(getMonday.openTime).toBe('08:00');

    // Restore
    await resetWorkingHours(fixtures.shopA.id);
  });

  it('PUT is idempotent — calling twice with same data returns 200 both times', async () => {
    const hours = [
      { dayOfWeek: 1, openTime: '07:00', closeTime: '20:00' },
    ];

    const res1 = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ workingHours: hours });

    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ workingHours: hours });

    expect(res2.status).toBe(200);

    // Data should be the same
    expect(res2.body.data).toHaveLength(res1.body.data.length);
    const mon1 = res1.body.data.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    const mon2 = res2.body.data.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    expect(mon1.openTime).toBe(mon2.openTime);

    // Restore
    await resetWorkingHours(fixtures.shopA.id);
  });

  it('narrow window — booking inside window succeeds, outside window fails', async () => {
    // Set Monday to narrow window: 21:00-22:00 in Buenos Aires.
    // The inside instant intentionally lands on Tuesday in UTC while still
    // being Monday locally for the barbershop.
    const narrowHours = [
      { dayOfWeek: 1, openTime: '21:00', closeTime: '22:00' },
    ];

    await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ workingHours: narrowHours });

    const insideRes = await bookAppointment(
      fixtures.shopA.id,
      fixtures.employeeA.id,
      fixtures.serviceA.id,
      fixtures.clientUser.clerkUserId,
      nextBuenosAiresWeekdayTimeIso(1, '21:30')
    );
    expect(insideRes.status).toBe(201);

    const outsideRes = await bookAppointment(
      fixtures.shopA.id,
      fixtures.employeeA.id,
      fixtures.serviceA.id,
      fixtures.clientUser.clerkUserId,
      nextBuenosAiresWeekdayTimeIso(1, '20:00')
    );
    expect(outsideRes.status).toBe(400);
    expect(outsideRes.body.error.message).toContain('before opening hours');

    // Clean up appointments and restore hours
    await prisma.appointment.deleteMany();
    await resetWorkingHours(fixtures.shopA.id);
  });

  it('setting a day as closed blocks booking on that day', async () => {
    // Set Monday as closed
    const closedMonday = [
      { dayOfWeek: 1, isActive: false },
    ];

    await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ workingHours: closedMonday });

    const res = await bookAppointment(
      fixtures.shopA.id,
      fixtures.employeeA.id,
      fixtures.serviceA.id,
      fixtures.clientUser.clerkUserId,
      nextBuenosAiresWeekdayTimeIso(1, '21:30')
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('closed');

    // Clean up and restore
    await resetWorkingHours(fixtures.shopA.id);
  });

  it('duplicate dayOfWeek returns 400', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
          { dayOfWeek: 1, openTime: '10:00', closeTime: '19:00' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // Zod refine adds the message to formErrors or fieldErrors in flattened details
    const detailsStr = JSON.stringify(res.body.error.details);
    expect(detailsStr).toContain('Duplicate');
  });

  it('invalid dayOfWeek (<0) returns 400', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: -1, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid dayOfWeek (>6) returns 400', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 7, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid time format returns 400', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '9:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('openTime >= closeTime returns 400', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '18:00', closeTime: '09:00' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('must be before closeTime');
  });

  it('BARBER cannot PUT — 403', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.barberUser.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot PUT — 403', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('cross-tenant OWNER cannot PUT — 403', async () => {
    // Owner A tries to update Shop B's hours
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopB.id}/working-hours`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });

  it('unauthenticated cannot PUT — 401', async () => {
    const res = await request(app)
      .put(`/api/v1/barbershops/${fixtures.shopA.id}/working-hours`)
      .send({
        workingHours: [
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
        ],
      });

    expect(res.status).toBe(401);
  });
});
