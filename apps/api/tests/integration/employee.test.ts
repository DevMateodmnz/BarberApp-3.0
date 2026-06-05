/**
 * Employee Management Integration Tests — PR-014
 *
 * Validates the OWNER-managed employee creation endpoint:
 * POST /api/v1/barbershops/:barbershopId/employees
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { app } from '../../src/index.js';
import type { User, Barbershop, Employee, Service } from '@prisma/client';

// ============================================
// TEST FIXTURES
// ============================================

interface TestFixtures {
  ownerA: User;
  shopA: Barbershop;
  barberUser: User;
  clientUser: User;
  externalUser: User;
  ownerB: User;
  shopB: Barbershop;
  // Services for Shop A and Shop B
  serviceA1: Service;
  serviceA2: Service;
  serviceB1: Service;
}

const fixtures: TestFixtures = {} as TestFixtures;

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  // Owner A + Shop A
  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerA_emp',
      email: 'ownerA_emp@test.com',
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

  // Target barber user (not yet linked to any shop)
  fixtures.barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber_emp',
      email: 'barber_emp@test.com',
      name: 'Target Barber',
      role: 'BARBER',
    },
  });

  // Client user
  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_client_emp',
      email: 'client_emp@test.com',
      name: 'Client',
      role: 'CLIENT',
    },
  });

  // External user (not related to any shop)
  fixtures.externalUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_external_emp',
      email: 'external_emp@test.com',
      name: 'External',
      role: 'CLIENT',
    },
  });

  // Owner B + Shop B (separate tenant)
  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerB_emp',
      email: 'ownerB_emp@test.com',
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

  // Services for Shop A
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

  // Service for Shop B
  fixtures.serviceB1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopB.id,
      name: 'Service B1',
      durationMinutes: 30,
      priceCents: 3000,
    },
  });
});

// ============================================
// HELPERS
// ============================================

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function addEmployee(shopId: string, userId: string, asClerkId: string) {
  return request(app)
    .post(`/api/v1/barbershops/${shopId}/employees`)
    .set(authHeader(asClerkId))
    .send({ userId });
}

// ============================================
// TESTS
// ============================================

describe('POST /api/v1/barbershops/:barbershopId/employees', () => {
  beforeEach(async () => {
    await prisma.employee.deleteMany();
  });
  it('OWNER adds employee successfully — 201', async () => {
    const res = await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
    expect(res.body.data.userId).toBe(fixtures.barberUser.id);
    expect(res.body.data.isActive).toBe(true);
  });

  it('employee row persists with correct barbershopId and userId', async () => {
    await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    const employee = await prisma.employee.findFirst({
      where: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id },
    });
    expect(employee).not.toBeNull();
    expect(employee!.barbershopId).toBe(fixtures.shopA.id);
    expect(employee!.userId).toBe(fixtures.barberUser.id);
    expect(employee!.isActive).toBe(true);
  });

  it('target user not found — 404', async () => {
    const res = await addEmployee(
      fixtures.shopA.id,
      'nonexistent-user-id',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('duplicate employee — 409 Conflict', async () => {
    // First addition
    await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    // Duplicate
    const res = await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('already an employee');
  });

  it('OWNER cannot add employee to another owner barbershop — 403', async () => {
    // Owner A tries to add employee to Shop B
    const res = await addEmployee(
      fixtures.shopB.id,
      fixtures.externalUser.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });

  it('BARBER cannot add employee — 403', async () => {
    const res = await addEmployee(
      fixtures.shopA.id,
      fixtures.externalUser.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot add employee — 403', async () => {
    const res = await addEmployee(
      fixtures.shopA.id,
      fixtures.externalUser.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated request — 401', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .send({ userId: fixtures.barberUser.id });

    expect(res.status).toBe(401);
  });

  it('missing userId — 400 validation error', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('OWNER can add themselves as employee — 201', async () => {
    const res = await addEmployee(
      fixtures.shopA.id,
      fixtures.ownerA.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(fixtures.ownerA.id);
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
  });

  it('endpoint does not modify User.role', async () => {
    // Target user starts as BARBER
    const userBefore = await prisma.user.findUnique({
      where: { id: fixtures.barberUser.id },
    });
    expect(userBefore!.role).toBe('BARBER');

    await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    // Role should still be BARBER
    const userAfter = await prisma.user.findUnique({
      where: { id: fixtures.barberUser.id },
    });
    expect(userAfter!.role).toBe('BARBER');
  });

  it('adding employee does not affect other barbershops', async () => {
    // Add employee to Shop A
    await addEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id,
      fixtures.ownerA.clerkUserId
    );

    // Verify user is NOT an employee of Shop B
    const shopBEmployee = await prisma.employee.findFirst({
      where: { barbershopId: fixtures.shopB.id, userId: fixtures.barberUser.id },
    });
    expect(shopBEmployee).toBeNull();
  });
});

// ============================================
// EMPLOYEE-SERVICE ASSIGNMENT HELPERS
// ============================================

/**
 * Creates an employee record directly in DB for the given barbershop+user.
 * Returns the created Employee.
 */
async function createEmployeeInDb(
  barbershopId: string,
  userId: string
): Promise<Employee> {
  return prisma.employee.create({
    data: { barbershopId, userId, isActive: true },
  });
}

function assignService(
  shopId: string,
  empId: string,
  serviceId: string,
  asClerkId: string
) {
  return request(app)
    .post(`/api/v1/barbershops/${shopId}/employees/${empId}/services`)
    .set(authHeader(asClerkId))
    .send({ serviceId });
}

function unassignService(
  shopId: string,
  empId: string,
  serviceId: string,
  asClerkId: string
) {
  return request(app)
    .delete(`/api/v1/barbershops/${shopId}/employees/${empId}/services/${serviceId}`)
    .set(authHeader(asClerkId));
}

// ============================================
// POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services
// ============================================

describe('POST /api/v1/barbershops/:barbershopId/employees/:employeeId/services', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
  });

  it('OWNER assigns service successfully — 201 and row exists in DB', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employeeId).toBe(employeeA.id);
    expect(res.body.data.serviceId).toBe(fixtures.serviceA1.id);

    // Verify DB row
    const link = await prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: {
          employeeId: employeeA.id,
          serviceId: fixtures.serviceA1.id,
        },
      },
    });
    expect(link).not.toBeNull();
  });

  it('duplicate assignment — 409 Conflict', async () => {
    await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('already assigned');
  });

  it('cross-tenant employee is blocked — 400', async () => {
    // Create employee in Shop B, try to assign Shop A service via Shop A URL
    const empB = await createEmployeeInDb(fixtures.shopB.id, fixtures.externalUser.id);

    const res = await assignService(
      fixtures.shopA.id,
      empB.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not belong');
  });

  it('cross-tenant service is blocked — 400', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceB1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not belong');
  });

  it('non-existent employee — 404', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      'nonexistent-employee-id',
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('non-existent service — 404', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      'nonexistent-service-id',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('missing serviceId body — 400 validation error', async () => {
    const res = await request(app)
      .post(
        `/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`
      )
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('BARBER cannot assign — 403', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot assign — 403', async () => {
    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated cannot assign — 401', async () => {
    const res = await request(app)
      .post(
        `/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`
      )
      .send({ serviceId: fixtures.serviceA1.id });

    expect(res.status).toBe(401);
  });
});

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/services/:serviceId
// ============================================

describe('DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId/services/:serviceId', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
  });

  it('OWNER unassigns service successfully — 200 and row deleted', async () => {
    // First assign a service
    await prisma.employeeService.create({
      data: {
        employeeId: employeeA.id,
        serviceId: fixtures.serviceA1.id,
      },
    });

    const res = await unassignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('Service unassigned');

    // Verify DB row deleted
    const link = await prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: {
          employeeId: employeeA.id,
          serviceId: fixtures.serviceA1.id,
        },
      },
    });
    expect(link).toBeNull();
  });

  it('deleting non-existent link — 404', async () => {
    const res = await unassignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('BARBER cannot unassign — 403', async () => {
    const res = await unassignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot unassign — 403', async () => {
    const res = await unassignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('cross-tenant unassign attempt is blocked — 400', async () => {
    // Create employee in Shop B, try to unassign via Shop A URL
    const empB = await createEmployeeInDb(fixtures.shopB.id, fixtures.externalUser.id);

    const res = await unassignService(
      fixtures.shopA.id,
      empB.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not belong');
  });
});

// ============================================
// REGRESSION: Appointment booking integration
// ============================================

describe('Appointment booking with assigned/unassigned services', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.photo.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
    // Set up working hours so appointments can be booked (idempotent)
    await prisma.workingHours.createMany({
      data: [
        { barbershopId: fixtures.shopA.id, dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
        { barbershopId: fixtures.shopA.id, dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' },
        { barbershopId: fixtures.shopA.id, dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' },
        { barbershopId: fixtures.shopA.id, dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' },
        { barbershopId: fixtures.shopA.id, dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' },
        { barbershopId: fixtures.shopA.id, dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' },
      ],
      skipDuplicates: true,
    });
  });

  it('appointment booking with assigned service succeeds', async () => {
    // Assign service to employee
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });

    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(13, 0, 0, 0); // 10 AM local (UTC-3 → 13 UTC)

    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: employeeA.id,
        serviceId: fixtures.serviceA1.id,
        startAt: nextMonday.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('appointment booking fails after service is unassigned', async () => {
    // No service assigned — booking should fail
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(13, 0, 0, 0);

    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: employeeA.id,
        serviceId: fixtures.serviceA1.id,
        startAt: nextMonday.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not offer this service');
  });
});
