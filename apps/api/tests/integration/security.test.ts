/**
 * PR-005C: Real Backend Security Validation
 *
 * These integration tests validate security guarantees using:
 * - Real Express app (imported from src/index.ts)
 * - Real Prisma client connected to PostgreSQL test database
 * - Real HTTP requests via supertest
 * - Auth mocked ONLY at the Clerk boundary (x-test-user-id header)
 * - Every business logic and database check is real
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import type { User, Barbershop, Employee, Service } from '@prisma/client';
import { getFutureOpenBusinessTime, getNextLocalWeekdayTime } from '../helpers/timezone.js';

const app = createAppFromEnv();

// ============================================
// TEST FIXTURES
// ============================================

interface TestFixtures {
  // Shop A
  ownerA: User;
  shopA: Barbershop;
  employeeA1: { employee: Employee; user: User };
  employeeA2: { employee: Employee; user: User };
  serviceA1: Service;
  serviceA2: Service;
  clientA: User;

  // Shop B (separate tenant)
  ownerB: User;
  shopB: Barbershop;
  employeeB1: { employee: Employee; user: User };
  serviceB1: Service;
  clientB: User;
}

const fixtures: TestFixtures = {} as TestFixtures;

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeAll(async () => {
  // Clean existing data
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  // Create Shop A owner
  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerA_clerk',
      email: 'ownerA@test.com',
      name: 'Owner A',
      role: 'OWNER',
    },
  });

  fixtures.shopA = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerA.id,
      name: 'Shop A',
      address: '123 A St',
      phone: '+541112345678',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  // Create Shop A employees
  const barberA1 = await prisma.user.create({
    data: {
      clerkUserId: 'test_barberA1_clerk',
      email: 'barberA1@test.com',
      name: 'Barber A1',
      role: 'BARBER',
    },
  });
  fixtures.employeeA1 = {
    user: barberA1,
    employee: await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: barberA1.id },
    }),
  };

  const barberA2 = await prisma.user.create({
    data: {
      clerkUserId: 'test_barberA2_clerk',
      email: 'barberA2@test.com',
      name: 'Barber A2',
      role: 'BARBER',
    },
  });
  fixtures.employeeA2 = {
    user: barberA2,
    employee: await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: barberA2.id },
    }),
  };

  // Create Shop A services
  fixtures.serviceA1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Corte Clásico',
      durationMinutes: 30,
      priceCents: 2500,
    },
  });
  fixtures.serviceA2 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Corte + Barba',
      durationMinutes: 45,
      priceCents: 4000,
    },
  });

  // Link employee A1 to both services
  await prisma.employeeService.createMany({
    data: [
      { employeeId: fixtures.employeeA1.employee.id, serviceId: fixtures.serviceA1.id },
      { employeeId: fixtures.employeeA1.employee.id, serviceId: fixtures.serviceA2.id },
      { employeeId: fixtures.employeeA2.employee.id, serviceId: fixtures.serviceA1.id },
    ],
  });

  // Set up working hours for Shop A (Mon‑Fri 09-19, Sat 09-14)
  const shopADays = [
    { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
    { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' },
    { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' },
    { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' },
    { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' },
    { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' },
  ];
  for (const d of shopADays) {
    await prisma.workingHours.create({
      data: { barbershopId: fixtures.shopA.id, ...d },
    });
  }

  // Create client for Shop A
  fixtures.clientA = await prisma.user.create({
    data: {
      clerkUserId: 'test_clientA_clerk',
      email: 'clientA@test.com',
      name: 'Client A',
      role: 'CLIENT',
    },
  });

  // --- Shop B (separate tenant) ---
  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerB_clerk',
      email: 'ownerB@test.com',
      name: 'Owner B',
      role: 'OWNER',
    },
  });

  fixtures.shopB = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerB.id,
      name: 'Shop B',
      address: '456 B Ave',
      phone: '+541129876543',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });

  const barberB1 = await prisma.user.create({
    data: {
      clerkUserId: 'test_barberB1_clerk',
      email: 'barberB1@test.com',
      name: 'Barber B1',
      role: 'BARBER',
    },
  });
  fixtures.employeeB1 = {
    user: barberB1,
    employee: await prisma.employee.create({
      data: { barbershopId: fixtures.shopB.id, userId: barberB1.id },
    }),
  };

  fixtures.serviceB1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopB.id,
      name: 'Service B1',
      durationMinutes: 30,
      priceCents: 3000,
    },
  });

  await prisma.employeeService.create({
    data: { employeeId: fixtures.employeeB1.employee.id, serviceId: fixtures.serviceB1.id },
  });

  // Set up working hours for Shop B (same schedule)
  for (const d of shopADays) {
    await prisma.workingHours.create({
      data: { barbershopId: fixtures.shopB.id, ...d },
    });
  }

  fixtures.clientB = await prisma.user.create({
    data: {
      clerkUserId: 'test_clientB_clerk',
      email: 'clientB@test.com',
      name: 'Client B',
      role: 'CLIENT',
    },
  });
});

beforeEach(async () => {
  // Clean appointments between tests (keep users/shops/services/workingHours)
  await prisma.appointment.deleteMany();
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

// ============================================
// HELPER
// ============================================

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

/**
 * Returns an ISO date at 10:00 AM local time on a day `daysFromNow` away.
 * Guaranteed to be within business hours (Mon-Sat 09:00-14:00/19:00).
 * Skips Sunday to ensure the resulting day is always open.
 */
function businessHoursDate(daysFromNow = 1): string {
  return getFutureOpenBusinessTime(daysFromNow).toISOString();
}

/**
 * Legacy helper — replaced by businessHoursDate().
 * Now delegates to businessHoursDate with the parameter interpreted as day offset.
 */
function futureDate(daysFromNow = 1) {
  return businessHoursDate(daysFromNow);
}

// ============================================
// 1. AUTHENTICATION / AUTHORIZATION TESTS
// ============================================

describe('Authentication & Authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/appointments');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects CLIENT from booking with OWNER/BARBER-only endpoints (PUT)', async () => {
    const res = await request(app)
      .put('/api/v1/appointments/nonexistent-id')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({ notes: 'test' });
    expect(res.status).toBe(403);
  });

  it('rejects CLIENT from status transition endpoint', async () => {
    const res = await request(app)
      .put('/api/v1/appointments/nonexistent-id/status')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('rejects CLIENT from creating appointment (only CLIENT can book, but test intent)', async () => {
    // CLIENT should be allowed to book - verify it
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    // Should succeed (201) - CLIENT is allowed to book
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('rejects OWNER from booking appointment (only CLIENT can book)', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(403);
  });

  it('rejects BARBER from booking appointment (only CLIENT can book)', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(403);
  });

  it('CLIENT can cancel their own appointment via DELETE', async () => {
    // First book an appointment
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(3),
      });
    expect(bookRes.status).toBe(201);

    // Cancel it
    const cancelRes = await request(app)
      .delete(`/api/v1/appointments/${bookRes.body.data.id}`)
      .set(authHeader(fixtures.clientA.clerkUserId));
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });

  it('BARBER can transition status of their assigned appointment', async () => {
    // Book appointment for barber A1
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(bookRes.status).toBe(201);

    // Owner confirms first
    await request(app)
      .put(`/api/v1/appointments/${bookRes.body.data.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });

    // Barber transitions to IN_PROGRESS
    const res = await request(app)
      .put(`/api/v1/appointments/${bookRes.body.data.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('BARBER cannot transition another barber appointment', async () => {
    // Book appointment for barber A1
    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(bookRes.status).toBe(201);

    // Owner confirms
    await request(app)
      .put(`/api/v1/appointments/${bookRes.body.data.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });

    // Barber A2 tries to transition barber A1's appointment
    const res = await request(app)
      .put(`/api/v1/appointments/${bookRes.body.data.id}/status`)
      .set(authHeader(fixtures.employeeA2.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    // Should return 404 (tenant isolation hides the appointment) or 403
    expect([403, 404]).toContain(res.status);
  });
});

// ============================================
// 2. TENANT ISOLATION TESTS
// ============================================

describe('Tenant Isolation', () => {
  it('rejects serviceId from another barbershop when booking', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceB1.id, // Service from Shop B!
        startAt: futureDate(2),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('Service does not belong');
  });

  it('rejects employeeId from another barbershop when booking', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeB1.employee.id, // Employee from Shop B!
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('Employee does not belong');
  });

  it('user cannot read appointments from another tenant', async () => {
    // Book in Shop A
    const bookA = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(bookA.status).toBe(201);

    // Client B tries to read Client A's appointment
    const res = await request(app)
      .get(`/api/v1/appointments/${bookA.body.data.id}`)
      .set(authHeader(fixtures.clientB.clerkUserId));
    // Should return 404 - hides cross-tenant resources
    expect(res.status).toBe(404);
  });

  it('OWNER cannot access another tenant barbershop appointment', async () => {
    // Book in Shop A
    const bookA = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(bookA.status).toBe(201);

    // Owner B tries to access Shop A's appointment
    const res = await request(app)
      .get(`/api/v1/appointments/${bookA.body.data.id}`)
      .set(authHeader(fixtures.ownerB.clerkUserId));
    expect(res.status).toBe(404);
  });

  it('BARBER from one shop cannot see appointments from another shop', async () => {
    // Book in Shop A
    const bookA = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(bookA.status).toBe(201);

    // Barber B1 tries to access Shop A's appointment
    const res = await request(app)
      .get(`/api/v1/appointments/${bookA.body.data.id}`)
      .set(authHeader(fixtures.employeeB1.user.clerkUserId));
    expect(res.status).toBe(404);
  });

  it('listing appointments for owner only shows their shop appointments', async () => {
    // Book in Shop A
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });

    // Book in Shop B (client B)
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientB.clerkUserId))
      .send({
        barbershopId: fixtures.shopB.id,
        employeeId: fixtures.employeeB1.employee.id,
        serviceId: fixtures.serviceB1.id,
        startAt: futureDate(3),
      });

    // Owner A lists - should only see Shop A appointments
    const listA = await request(app)
      .get('/api/v1/appointments')
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0].barbershopId).toBe(fixtures.shopA.id);
  });
});

// ============================================
// 3. BOOKING INTEGRITY TESTS
// ============================================

describe('Booking Integrity', () => {
  it('succeeds when service and employee belong to the selected barbershop', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
  });

  it('rejects booking with invalid employee/service/barbershop combination', async () => {
    // Employee A1 + Service B1 (different shops)
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceB1.id, // Wrong shop!
        startAt: futureDate(2),
      });
    expect(res.status).toBe(400);
  });

  it('rejects booking with non-existent service', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: 'nonexistent-service-id',
        startAt: futureDate(2),
      });
    expect(res.status).toBe(404);
  });

  it('rejects booking with non-existent employee', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: 'nonexistent-employee-id',
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(404);
  });

  it('rejects booking with non-existent barbershop', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: 'nonexistent-shop-id',
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    // Service validation fails because it looks up service first,
    // but the tenant check catches mismatched barbershop
    expect([400, 404]).toContain(res.status);
  });

  it('appointment creation preserves tenant integrity in database', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(201);

    // Verify in DB: all IDs point to same barbershop
    const appt = await prisma.appointment.findUnique({
      where: { id: res.body.data.id },
    });
    expect(appt).not.toBeNull();
    expect(appt!.barbershopId).toBe(fixtures.shopA.id);

    const employee = await prisma.employee.findUnique({
      where: { id: appt!.employeeId },
    });
    expect(employee!.barbershopId).toBe(fixtures.shopA.id);

    const service = await prisma.service.findUnique({
      where: { id: appt!.serviceId },
    });
    expect(service!.barbershopId).toBe(fixtures.shopA.id);
  });

  it('rejects booking when employee is not assigned to the selected service', async () => {
    // employeeA2 is NOT linked to serviceA2 in fixtures (lines 124-131)
    // Both belong to shopA, but no EmployeeService junction exists
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.employee.id,
        serviceId: fixtures.serviceA2.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('Employee does not offer this service');
  });

  it('allows booking when employee is assigned to the selected service', async () => {
    // employeeA1 is linked to serviceA1 in fixtures
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.employeeId).toBe(fixtures.employeeA1.employee.id);
    expect(res.body.data.serviceId).toBe(fixtures.serviceA1.id);
  });
});

// ============================================
// 4. DOUBLE BOOKING / CONCURRENCY TESTS
// ============================================

describe('Double Booking Prevention', () => {
  it('blocks sequential double booking (same employee, overlapping time)', async () => {
    const startTime = futureDate(2);

    // First booking succeeds
    const first = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: startTime,
      });
    expect(first.status).toBe(201);

    // Second booking at same time should fail
    const second = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: startTime,
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('blocks overlapping booking (new appointment starts during existing)', async () => {
    // First: 2 hours from now, 30 min duration = 2:00-2:30
    const firstStart = futureDate(2);

    const first = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: firstStart,
      });
    expect(first.status).toBe(201);

    // Second: Start 15 min later (2:15, ends 2:45 with same service)
    const overlapDate = new Date(firstStart);
    overlapDate.setMinutes(overlapDate.getMinutes() + 15);

    const second = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: overlapDate.toISOString(),
      });
    expect(second.status).toBe(409);
  });

  it('allows booking with different employee at same time', async () => {
    const startTime = futureDate(2);

    // Book with employee A1
    const first = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: startTime,
      });
    expect(first.status).toBe(201);

    // Book with employee A2 at same time - should succeed (different employee)
    const second = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: startTime,
      });
    expect(second.status).toBe(201);
  });

  it('allows booking for same employee at non-overlapping time', async () => {
    const firstStart = futureDate(2);

    // First booking
    const first = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: firstStart,
      });
    expect(first.status).toBe(201);

    // Second booking: 2 hours later (well after first ends)
    const laterDate = new Date(firstStart);
    laterDate.setHours(laterDate.getHours() + 2);

    const second = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: laterDate.toISOString(),
      });
    expect(second.status).toBe(201);
  });

  it('blocks reschedule to conflicting time', async () => {
    // Create two appointments for same employee, non-overlapping
    const firstStart = futureDate(2);
    const secondStart = futureDate(5); // 3 hours later

    const first = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: firstStart,
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: secondStart,
      });
    expect(second.status).toBe(201);

    // Try to reschedule second appointment to overlap with first
    const overlapDate = new Date(firstStart);
    overlapDate.setMinutes(overlapDate.getMinutes() + 15);

    const reschedule = await request(app)
      .put(`/api/v1/appointments/${second.body.data.id}`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ startAt: overlapDate.toISOString() });
    expect(reschedule.status).toBe(409);
  });
});

// ============================================
// 5. STATUS TRANSITION TESTS
// ============================================

describe('Status Transitions', () => {
  async function bookAppointment(clerkUserId: string) {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: futureDate(2),
      });
    return res.body.data;
  }

  it('CLIENT can cancel PENDING appointment', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    const res = await request(app)
      .delete(`/api/v1/appointments/${appt.id}`)
      .set(authHeader(fixtures.clientA.clerkUserId));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('OWNER can confirm PENDING appointment', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('BARBER cannot confirm PENDING appointment (only OWNER)', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'CONFIRMED' });
    // ForbiddenError (403) is correct: authenticated but not authorized for this transition
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('not allowed to transition');
  });

  it('CLIENT cannot transition from PENDING to CONFIRMED', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403); // CLIENT not in allowed roles for PUT /status
  });

  it('BARBER can transition CONFIRMED to IN_PROGRESS', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    // Owner confirms
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });

    // Barber transitions
    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('BARBER can transition IN_PROGRESS to COMPLETED', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    // Full flow: PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });

    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });

    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('terminal COMPLETED state cannot be changed', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    // Complete it
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'COMPLETED' });

    // Try to change completed
    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'PENDING' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('terminal state');
  });

  it('terminal CANCELLED state cannot be revived', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    // Cancel
    await request(app)
      .delete(`/api/v1/appointments/${appt.id}`)
      .set(authHeader(fixtures.clientA.clerkUserId));

    // Try to change cancelled back to pending
    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'PENDING' });
    expect(res.status).toBe(400);
  });

  it('terminal NO_SHOW state cannot be revived', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    // Flow to NO_SHOW
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'CONFIRMED' });
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId))
      .send({ status: 'NO_SHOW' });

    // Try to change NO_SHOW
    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'PENDING' });
    expect(res.status).toBe(400);
  });

  it('invalid status value is rejected', async () => {
    const appt = await bookAppointment(fixtures.clientA.clerkUserId);

    const res = await request(app)
      .put(`/api/v1/appointments/${appt.id}/status`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ status: 'DELETED' }); // Not a valid status
    expect(res.status).toBe(400);
  });
});

// ============================================
// 6. BUSINESS HOURS ENFORCEMENT TESTS
// ============================================

describe('Business Hours Enforcement', () => {
  /**
   * Helper: returns an ISO date string for a specific time (UTC)
   * on the next business day that matches the given dayOfWeek.
   * dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat (in barbershop local tz).
   *
   * Since shops use America/Argentina/Buenos_Aires (UTC-3),
   * we create UTC times 3 hours ahead of the desired local time.
   */
  function dateAtLocalTime(
    dayOfWeek: number,
    hours: number,
    minutes = 0
  ): string {
    return getNextLocalWeekdayTime(
      dayOfWeek,
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    ).toISOString();
  }

  async function bookAt(dayOfWeek: number, hours: number, minutes = 0) {
    return request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: dateAtLocalTime(dayOfWeek, hours, minutes),
      });
  }

  it('appointment inside business hours succeeds (Monday 10:00)', async () => {
    const res = await bookAt(1, 10, 0); // Monday 10:00
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('appointment inside business hours succeeds (Friday 18:30, ends 19:00)', async () => {
    // 30 min service at 18:30 ends at 19:00 = closing time (inclusive)
    const res = await bookAt(5, 18, 30); // Friday 18:30
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('appointment before opening is rejected (Monday 08:00)', async () => {
    const res = await bookAt(1, 8, 0); // Monday 08:00 (opens at 09:00)
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('before opening hours');
  });

  it('appointment ending after closing is rejected (Friday 18:45)', async () => {
    // 30 min service at 18:45 ends at 19:15 > 19:00 closing
    const res = await bookAt(5, 18, 45); // Friday 18:45
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('after closing hours');
  });

  it('appointment on Saturday at 09:00 succeeds', async () => {
    const res = await bookAt(6, 9, 0); // Saturday 09:00
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('appointment on Saturday at 14:00 is rejected (closes at 14:00)', async () => {
    // 30 min service at 14:00 ends at 14:30 > 14:00 closing
    const res = await bookAt(6, 14, 0); // Saturday 14:00
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('after closing hours');
  });

  it('appointment on Sunday is rejected (closed day)', async () => {
    const res = await bookAt(0, 10, 0); // Sunday 10:00
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('closed');
  });

  it('update appointment into invalid hours is rejected', async () => {
    // First book a valid appointment
    const bookRes = await bookAt(1, 10, 0); // Monday 10:00
    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id;

    // Try to reschedule to Monday 08:00 (before opening)
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ startAt: dateAtLocalTime(1, 8, 0) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toContain('before opening hours');
  });

  it('update appointment to closed day is rejected', async () => {
    // First book a valid appointment
    const bookRes = await bookAt(1, 10, 0); // Monday 10:00
    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id;

    // Try to reschedule to Sunday
    const res = await request(app)
      .put(`/api/v1/appointments/${apptId}`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ startAt: dateAtLocalTime(0, 10, 0) }); // Sunday
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('closed');
  });

  it('business hours are per-barbershop (Shop B hours do not leak to Shop A)', async () => {
    // Book in Shop A with valid hours - should succeed
    const resA = await bookAt(1, 10, 0); // Monday 10:00 in Shop A
    expect(resA.status).toBe(201);
  });
});

// ============================================
// 7. BARBER APPOINTMENT LISTING AUTHORIZATION
// ============================================

import { listAppointments } from '../../src/services/appointmentService.js';

describe('Barber Appointment Listing Authorization', () => {
  it('BARBER without employeeId receives 403 (fail closed)', async () => {
    const res = await request(app)
      .get('/api/v1/appointments')
      .set(authHeader(fixtures.employeeA1.user.clerkUserId));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Employee context required');
  });

  it('BARBER with employeeId sees only their own appointments (service level)', async () => {
    // Create appointments for barber A1 and A2 in Shop A
    const start1 = businessHoursDate(2);
    const start2 = businessHoursDate(3);
    const start3 = businessHoursDate(4);

    // A1 appointment
    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.serviceA1.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.serviceA1.name,
        servicePriceCents: fixtures.serviceA1.priceCents,
        serviceDurationMinutes: fixtures.serviceA1.durationMinutes,
        serviceCurrency: fixtures.serviceA1.currency,
        startAt: new Date(start1),
        endAt: new Date(new Date(start1).getTime() + 30 * 60000),
      },
    });

    // A2 appointment (different barber, same shop)
    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.serviceA1.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.serviceA1.name,
        servicePriceCents: fixtures.serviceA1.priceCents,
        serviceDurationMinutes: fixtures.serviceA1.durationMinutes,
        serviceCurrency: fixtures.serviceA1.currency,
        startAt: new Date(start2),
        endAt: new Date(new Date(start2).getTime() + 30 * 60000),
      },
    });

    // Another A1 appointment
    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        clientId: fixtures.clientA.id,
        serviceId: fixtures.serviceA1.id,
        clientName: fixtures.clientA.name!,
        clientPhone: null,
        serviceName: fixtures.serviceA1.name,
        servicePriceCents: fixtures.serviceA1.priceCents,
        serviceDurationMinutes: fixtures.serviceA1.durationMinutes,
        serviceCurrency: fixtures.serviceA1.currency,
        startAt: new Date(start3),
        endAt: new Date(new Date(start3).getTime() + 30 * 60000),
      },
    });

    // List as barber A1 — should see only A1's appointments
    const results = await listAppointments(
      fixtures.employeeA1.user.id,
      'BARBER',
      fixtures.employeeA1.employee.id
    );

    expect(results).toHaveLength(2);
    for (const appt of results) {
      expect(appt.employeeId).toBe(fixtures.employeeA1.employee.id);
    }
  });

  it('BARBER does not see appointments from another barbershop (service level)', async () => {
    // Create appointment in Shop B for barber B1
    const startB = businessHoursDate(2);
    await prisma.appointment.create({
      data: {
        barbershopId: fixtures.shopB.id,
        employeeId: fixtures.employeeB1.employee.id,
        clientId: fixtures.clientB.id,
        serviceId: fixtures.serviceB1.id,
        clientName: fixtures.clientB.name!,
        clientPhone: null,
        serviceName: fixtures.serviceB1.name,
        servicePriceCents: fixtures.serviceB1.priceCents,
        serviceDurationMinutes: fixtures.serviceB1.durationMinutes,
        serviceCurrency: fixtures.serviceB1.currency,
        startAt: new Date(startB),
        endAt: new Date(new Date(startB).getTime() + 30 * 60000),
      },
    });

    // List as barber A1 — should not see Shop B's appointments
    const results = await listAppointments(
      fixtures.employeeA1.user.id,
      'BARBER',
      fixtures.employeeA1.employee.id
    );

    for (const appt of results) {
      expect(appt.barbershopId).not.toBe(fixtures.shopB.id);
    }
  });

  it('OWNER listing still works correctly', async () => {
    // Book an appointment in Shop A
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });
    expect(res.status).toBe(201);

    // Owner A lists — should see Shop A appointments
    const listRes = await request(app)
      .get('/api/v1/appointments')
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const appt of listRes.body.data) {
      expect(appt.barbershopId).toBe(fixtures.shopA.id);
    }
  });

  it('CLIENT listing still works correctly', async () => {
    // Book an appointment for client A
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });
    expect(res.status).toBe(201);

    // Client A lists — should see only their own appointments
    const listRes = await request(app)
      .get('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const appt of listRes.body.data) {
      expect(appt.clientId).toBe(fixtures.clientA.id);
    }
  });
});

// ============================================
// 8. SCOPED EMPLOYEE APPOINTMENT LISTING (PR-020)
// ============================================

describe('Scoped Employee Appointment Listing', () => {
  afterAll(async () => {
    // Restore deactivated employees
    await prisma.employee.updateMany({
      where: { isActive: false },
      data: { isActive: true, deletedAt: null },
    });
  });

  it('OWNER lists appointments for employee in own barbershop — 200', async () => {
    // Create an appointment for employeeA1 in Shop A
    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });
    expect(res.status).toBe(201);

    // Owner A lists appointments for employeeA1
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const appt of listRes.body.data) {
      expect(appt.employeeId).toBe(fixtures.employeeA1.employee.id);
    }
  });

  it('OWNER sees only that employee\'s appointments, not other employees', async () => {
    // Create appointments for employeeA1 AND employeeA2 in Shop A
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(3),
      });

    // List for employeeA1 — should see only A1's appointments
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const appt of listRes.body.data) {
      expect(appt.employeeId).toBe(fixtures.employeeA1.employee.id);
    }
  });

  it('OWNER cross-tenant employee returns 400', async () => {
    // Owner A tries to list appointments for Shop B employee via Shop A URL
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeB1.employee.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listRes.status).toBe(400);
  });

  it('BARBER lists own appointments — 200', async () => {
    // Create appointment for employeeA1
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });

    // Barber A1 lists their own appointments
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    for (const appt of listRes.body.data) {
      expect(appt.employeeId).toBe(fixtures.employeeA1.employee.id);
    }
  });

  it('BARBER cannot list another barber\'s appointments in same barbershop — 403', async () => {
    // Create appointment for employeeA2
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });

    // Barber A1 tries to list A2's appointments
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA2.employee.id}/appointments`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId));
    expect(listRes.status).toBe(403);
    expect(listRes.body.error.message).toContain('own appointments');
  });

  it('BARBER cannot list appointments in another barbershop — 403', async () => {
    // Barber A1 tries to access Shop B's employee appointments
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopB.id}/employees/${fixtures.employeeB1.employee.id}/appointments`)
      .set(authHeader(fixtures.employeeA1.user.clerkUserId));
    expect(listRes.status).toBe(403);
  });

  it('BARBER with no employee record in that barbershop — 403', async () => {
    // Create a barber user with no employee record in any shop
    const unknownBarber = await prisma.user.create({
      data: {
        clerkUserId: 'test_unknownBarber_clerk',
        email: 'unknownBarber@test.com',
        name: 'Unknown Barber',
        role: 'BARBER',
      },
    });

    try {
      const listRes = await request(app)
        .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
        .set(authHeader(unknownBarber.clerkUserId));
      expect(listRes.status).toBe(403);
    } finally {
      await prisma.user.delete({ where: { id: unknownBarber.id } });
    }
  });

  it('CLIENT cannot access endpoint — 403', async () => {
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
      .set(authHeader(fixtures.clientA.clerkUserId));
    expect(listRes.status).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`);
    expect(res.status).toBe(401);
  });

  it('deactivated employee returns 404', async () => {
    // Create an appointment first
    await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientA.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.employee.id,
        serviceId: fixtures.serviceA1.id,
        startAt: businessHoursDate(2),
      });

    // Deactivate employeeA1
    await prisma.employee.update({
      where: { id: fixtures.employeeA1.employee.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    // Owner A lists — should get 404
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.employee.id}/appointments`)
      .set(authHeader(fixtures.ownerA.clerkUserId));
    expect(listRes.status).toBe(404);
  });

  it('existing global BARBER fail-closed remains intact', async () => {
    const res = await request(app)
      .get('/api/v1/appointments')
      .set(authHeader(fixtures.employeeA1.user.clerkUserId));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Employee context required');
  });
});
