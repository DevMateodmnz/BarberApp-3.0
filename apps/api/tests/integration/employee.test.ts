/**
 * Employee Management Integration Tests — PR-014
 *
 * Validates the OWNER-managed employee creation endpoint:
 * POST /api/v1/barbershops/:barbershopId/employees
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import type { User, Barbershop, Employee, Service } from '@prisma/client';

const app = createAppFromEnv();

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

function addEmployeeByEmail(shopId: string, email: string, asClerkId: string) {
  return request(app)
    .post(`/api/v1/barbershops/${shopId}/employees`)
    .set(authHeader(asClerkId))
    .send({ email });
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

  // --- Email-based employee creation ---

  it('OWNER adds employee by email — 201', async () => {
    const res = await addEmployeeByEmail(
      fixtures.shopA.id,
      'barber_emp@test.com',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.barberUser.id);
    expect(res.body.data.user.email).toBe('barber_emp@test.com');
  });

  it('email lookup is case-insensitive', async () => {
    const res = await addEmployeeByEmail(
      fixtures.shopA.id,
      'Barber_EMP@TEST.com',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(fixtures.barberUser.id);
  });

  it('unknown email returns 404', async () => {
    const res = await addEmployeeByEmail(
      fixtures.shopA.id,
      'nonexistent@test.com',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('both userId and email returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ userId: fixtures.barberUser.id, email: 'barber_emp@test.com' });

    expect(res.status).toBe(400);
  });

  it('neither userId nor email returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({});

    expect(res.status).toBe(400);
  });

  it('duplicate by email is rejected same as duplicate by userId', async () => {
    await addEmployeeByEmail(
      fixtures.shopA.id,
      'barber_emp@test.com',
      fixtures.ownerA.clerkUserId
    );

    const res = await addEmployeeByEmail(
      fixtures.shopA.id,
      'barber_emp@test.com',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('already an employee');
  });

  it('BARBER cannot add by email — 403', async () => {
    const res = await addEmployeeByEmail(
      fixtures.shopA.id,
      'barber_emp@test.com',
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('OWNER cannot add by email to another barbershop — 403', async () => {
    const res = await addEmployeeByEmail(
      fixtures.shopB.id,
      'external_emp@test.com',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(403);
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

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/employees', () => {
  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
  });

  function listEmployees(shopId: string, asClerkId: string) {
    return request(app)
      .get(`/api/v1/barbershops/${shopId}/employees`)
      .set(authHeader(asClerkId));
  }

  it('OWNER lists employees successfully — 200', async () => {
    // Create two employees in Shop A
    await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
    await createEmployeeInDb(fixtures.shopA.id, fixtures.clientUser.id);

    const res = await listEmployees(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('response includes only safe user fields: id, email, name, role', async () => {
    await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);

    const res = await listEmployees(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    const emp = res.body.data[0];
    expect(emp.user).toBeDefined();
    expect(emp.user.id).toBe(fixtures.barberUser.id);
    expect(emp.user.email).toBe(fixtures.barberUser.email);
    expect(emp.user.name).toBe(fixtures.barberUser.name);
    expect(emp.user.role).toBe('BARBER');
    // Must NOT expose internal fields
    expect(emp.user.clerkUserId).toBeUndefined();
    expect(emp.user.deletedAt).toBeUndefined();
  });

  it('empty list returns 200 with data: []', async () => {
    const res = await listEmployees(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('BARBER cannot list employees — 403', async () => {
    const res = await listEmployees(fixtures.shopA.id, fixtures.barberUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot list employees — 403', async () => {
    const res = await listEmployees(fixtures.shopA.id, fixtures.clientUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('unauthenticated request — 401', async () => {
    const res = await request(app).get(
      `/api/v1/barbershops/${fixtures.shopA.id}/employees`
    );

    expect(res.status).toBe(401);
  });

  it('OWNER cannot list another barbershop employees — 403', async () => {
    // Owner A tries to list Shop B's employees
    const res = await listEmployees(fixtures.shopB.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });

  it('soft-deleted employees are excluded', async () => {
    // Create one active and one soft-deleted employee
    const active = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
    const deleted = await createEmployeeInDb(fixtures.shopA.id, fixtures.clientUser.id);
    await prisma.employee.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const res = await listEmployees(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(active.id);
  });
});

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId
// ============================================

describe('DELETE /api/v1/barbershops/:barbershopId/employees/:employeeId', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.photo.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
    // Set up working hours for booking tests
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

  function deactivateEmployee(shopId: string, empId: string, asClerkId: string) {
    return request(app)
      .delete(`/api/v1/barbershops/${shopId}/employees/${empId}`)
      .set(authHeader(asClerkId));
  }

  function bookAppointment(shopId: string, empId: string, svcId: string) {
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(13, 0, 0, 0);
    return request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: shopId,
        employeeId: empId,
        serviceId: svcId,
        startAt: nextMonday.toISOString(),
      });
  }

  it('OWNER deactivates employee successfully — 200', async () => {
    const res = await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('Employee deactivated');
  });

  it('DB row has isActive=false and deletedAt set', async () => {
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    const emp = await prisma.employee.findUnique({ where: { id: employeeA.id } });
    expect(emp!.isActive).toBe(false);
    expect(emp!.deletedAt).not.toBeNull();
  });

  it('deactivated employee does not appear in GET employees list', async () => {
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('deactivated employee cannot be booked for a new appointment — 400', async () => {
    // Assign service first
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });

    // Deactivate
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    const res = await bookAppointment(fixtures.shopA.id, employeeA.id, fixtures.serviceA1.id);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not active');
  });

  it('deactivated employee cannot be assigned a service — 404', async () => {
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    const res = await assignService(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('double deactivation returns 404', async () => {
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    const res = await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('cross-tenant deactivation is blocked — 403', async () => {
    const empB = await createEmployeeInDb(fixtures.shopB.id, fixtures.externalUser.id);

    const res = await deactivateEmployee(
      fixtures.shopB.id,
      empB.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });

  it('BARBER cannot deactivate — 403', async () => {
    const res = await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot deactivate — 403', async () => {
    const res = await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated request — 401', async () => {
    const res = await request(app).delete(
      `/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}`
    );

    expect(res.status).toBe(401);
  });

  it('OWNER can deactivate themselves as employee — 200', async () => {
    const ownerEmp = await createEmployeeInDb(fixtures.shopA.id, fixtures.ownerA.id);

    const res = await deactivateEmployee(
      fixtures.shopA.id,
      ownerEmp.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
  });

  it('EmployeeService links are preserved after deactivation', async () => {
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });

    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

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

  it('existing appointments are preserved after deactivation', async () => {
    // Assign service and book appointment
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    const bookRes = await bookAppointment(fixtures.shopA.id, employeeA.id, fixtures.serviceA1.id);
    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id;

    // Deactivate
    await deactivateEmployee(
      fixtures.shopA.id,
      employeeA.id,
      fixtures.ownerA.clerkUserId
    );

    // Appointment still exists
    const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(appt).not.toBeNull();
  });
});

// ============================================
// EMPLOYEE REACTIVATION HELPERS
// ============================================

/**
 * Creates a deactivated employee directly in DB.
 * Used for testing reactivation.
 */
async function createDeactivatedEmployee(
  barbershopId: string,
  userId: string
): Promise<Employee> {
  return prisma.employee.create({
    data: { barbershopId, userId, isActive: false, deletedAt: new Date() },
  });
}

function reactivateEmployee(
  shopId: string,
  empId: string,
  asClerkId: string
) {
  return request(app)
    .patch(`/api/v1/barbershops/${shopId}/employees/${empId}/reactivate`)
    .set(authHeader(asClerkId));
}

// ============================================
// PATCH /api/v1/barbershops/:barbershopId/employees/:employeeId/reactivate
// ============================================

describe('PATCH /api/v1/barbershops/:barbershopId/employees/:employeeId/reactivate', () => {
  beforeEach(async () => {
    await prisma.photo.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
  });

  it('OWNER reactivates deactivated employee successfully — 200', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    const res = await reactivateEmployee(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.deletedAt).toBeNull();
  });

  it('reactivated employee appears in GET employees list', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    // Reactivate
    await reactivateEmployee(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.ownerA.clerkUserId
    );

    // Check GET list
    const listRes = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const reactivated = listRes.body.data.find(
      (e: { id: string }) => e.id === deactivated.id
    );
    expect(reactivated).toBeDefined();
  });

  it('reactivated employee can be assigned a service', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    // Reactivate
    await reactivateEmployee(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.ownerA.clerkUserId
    );

    // Assign service
    const res = await assignService(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.serviceA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
  });

  it('reactivated employee with preserved EmployeeService links can receive bookings', async () => {
    // Create active employee
    const emp = await createEmployeeInDb(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    // Assign service
    await prisma.employeeService.create({
      data: { employeeId: emp.id, serviceId: fixtures.serviceA1.id },
    });

    // Deactivate
    await prisma.employee.update({
      where: { id: emp.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    // Set up working hours
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

    // Reactivate
    await reactivateEmployee(
      fixtures.shopA.id,
      emp.id,
      fixtures.ownerA.clerkUserId
    );

    // Book appointment
    const nextMonday = new Date();
    nextMonday.setDate(
      nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7)
    );
    nextMonday.setHours(13, 0, 0, 0);

    const res = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: emp.id,
        serviceId: fixtures.serviceA1.id,
        startAt: nextMonday.toISOString(),
      });

    expect(res.status).toBe(201);
  });

  it('reactivating already-active employee returns 409 Conflict', async () => {
    // Create active employee
    const emp = await createEmployeeInDb(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    const res = await reactivateEmployee(
      fixtures.shopA.id,
      emp.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('cross-tenant OWNER cannot reactivate — 404', async () => {
    // Create deactivated employee in Shop B
    const deactivatedInB = await createDeactivatedEmployee(
      fixtures.shopB.id,
      fixtures.externalUser.id
    );

    // Owner A tries to reactivate via Shop A URL
    const res = await reactivateEmployee(
      fixtures.shopA.id,
      deactivatedInB.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('BARBER cannot reactivate — 403', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    const res = await reactivateEmployee(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot reactivate — 403', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    const res = await reactivateEmployee(
      fixtures.shopA.id,
      deactivated.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated request — 401', async () => {
    const deactivated = await createDeactivatedEmployee(
      fixtures.shopA.id,
      fixtures.barberUser.id
    );

    const res = await request(app).patch(
      `/api/v1/barbershops/${fixtures.shopA.id}/employees/${deactivated.id}/reactivate`
    );

    expect(res.status).toBe(401);
  });

  it('nonexistent employee — 404', async () => {
    const res = await reactivateEmployee(
      fixtures.shopA.id,
      '00000000-0000-0000-0000-000000000000',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/services
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/employees/:employeeId/services', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
  });

  it('OWNER lists assigned services — 200, correct services returned', async () => {
    // Assign 2 services to employeeA
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA2.id },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    const ids = res.body.data.map((s: Service) => s.id);
    expect(ids).toContain(fixtures.serviceA1.id);
    expect(ids).toContain(fixtures.serviceA2.id);
  });

  it('empty list when no services assigned — 200, data: []', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('only assigned services are returned (not all barbershop services)', async () => {
    // Assign only serviceA1 (not serviceA2)
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(fixtures.serviceA1.id);
  });

  it('cross-tenant access blocked — 400', async () => {
    // Create employee in Shop B
    const empB = await createEmployeeInDb(fixtures.shopB.id, fixtures.externalUser.id);

    // Try to list services via Shop A URL
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${empB.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('does not belong');
  });

  it('deactivated employee — 404', async () => {
    // Deactivate employeeA
    await prisma.employee.update({
      where: { id: employeeA.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(404);
  });

  it('BARBER cannot list — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot list — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.clientUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app).get(
      `/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`
    );

    expect(res.status).toBe(401);
  });

  it('nonexistent employee — 404', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/nonexistent-employee-id/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(404);
  });

  it('inactive services are excluded from listings', async () => {
    // Assign serviceA1 (active) and serviceA2 (active)
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA2.id },
    });

    // Deactivate serviceA2
    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { isActive: false },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(fixtures.serviceA1.id);

    // Restore serviceA2 for other tests
    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { isActive: true },
    });
  });

  it('soft-deleted services are excluded from listings', async () => {
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA2.id },
    });

    // Soft-delete serviceA2
    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${employeeA.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(fixtures.serviceA1.id);

    // Restore serviceA2 for other tests
    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { deletedAt: null },
    });
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/me/services
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/me/services', () => {
  let employeeA: Employee;

  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.employee.deleteMany();
    employeeA = await createEmployeeInDb(fixtures.shopA.id, fixtures.barberUser.id);
  });

  it('BARBER lists own assigned active services in own barbershop — 200', async () => {
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA2.id },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    const ids = res.body.data.map((service: Service) => service.id);
    expect(ids).toContain(fixtures.serviceA1.id);
    expect(ids).toContain(fixtures.serviceA2.id);
  });

  it('BARBER response includes safe service fields and excludes unsafe/internal fields', async () => {
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const service = res.body.data[0];
    expect(service).toEqual({
      id: fixtures.serviceA1.id,
      name: fixtures.serviceA1.name,
      description: fixtures.serviceA1.description,
      durationMinutes: fixtures.serviceA1.durationMinutes,
      priceCents: fixtures.serviceA1.priceCents,
      currency: fixtures.serviceA1.currency,
      isActive: true,
    });
    expect(service.barbershopId).toBeUndefined();
    expect(service.deletedAt).toBeUndefined();
    expect(service.employeeServices).toBeUndefined();
  });

  it('BARBER cannot list own services for another barbershop — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopB.id}/me/services`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('BARBER with no employee record in that barbershop gets 403', async () => {
    const unlinkedBarber = await prisma.user.create({
      data: {
        clerkUserId: 'test_unlinked_barber_me_services',
        email: 'unlinked_barber_me_services@test.com',
        name: 'Unlinked Barber',
        role: 'BARBER',
      },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`)
      .set(authHeader(unlinkedBarber.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('BARBER does not receive inactive or soft-deleted services', async () => {
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA1.id },
    });
    await prisma.employeeService.create({
      data: { employeeId: employeeA.id, serviceId: fixtures.serviceA2.id },
    });

    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(fixtures.serviceA1.id);

    await prisma.service.update({
      where: { id: fixtures.serviceA2.id },
      data: { isActive: true, deletedAt: null },
    });
  });

  it('CLIENT is forbidden — 403', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`)
      .set(authHeader(fixtures.clientUser.clerkUserId));

    expect(res.status).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/me/services`);

    expect(res.status).toBe(401);
  });
});
