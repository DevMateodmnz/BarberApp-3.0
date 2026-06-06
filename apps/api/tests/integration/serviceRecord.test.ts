/**
 * Service Record Integration Tests — PR-023
 *
 * Validates walk-in service record creation, listing, and authorization:
 * POST /api/v1/barbershops/:barbershopId/service-records
 * GET  /api/v1/barbershops/:barbershopId/service-records
 * GET  /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { app } from '../../src/index.js';
import type { User, Barbershop, Employee, Service, ServiceRecord } from '@prisma/client';

// ============================================
// TEST FIXTURES
// ============================================

interface TestFixtures {
  ownerA: User;
  shopA: Barbershop;
  barberUser: User;
  barberUser2: User;
  clientUser: User;
  ownerB: User;
  shopB: Barbershop;
  serviceA1: Service;
  serviceA2: Service;
  serviceB1: Service;
  employeeA1: Employee;
  employeeA2: Employee;
}

const fixtures: TestFixtures = {} as TestFixtures;

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeAll(async () => {
  await prisma.serviceRecord.deleteMany();
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
      clerkUserId: 'test_ownerA_sr',
      email: 'ownerA_sr@test.com',
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

  // Barber User 1 (employee in Shop A)
  fixtures.barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber1_sr',
      email: 'barber1_sr@test.com',
      name: 'Barber One',
      role: 'BARBER',
    },
  });

  fixtures.employeeA1 = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopA.id,
      userId: fixtures.barberUser.id,
      isActive: true,
    },
  });

  // Barber User 2 (second barber in Shop A)
  fixtures.barberUser2 = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber2_sr',
      email: 'barber2_sr@test.com',
      name: 'Barber Two',
      role: 'BARBER',
    },
  });

  fixtures.employeeA2 = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopA.id,
      userId: fixtures.barberUser2.id,
      isActive: true,
    },
  });

  // Client user
  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_client_sr',
      email: 'client_sr@test.com',
      name: 'Client',
      role: 'CLIENT',
    },
  });

  // Owner B + Shop B (separate tenant)
  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerB_sr',
      email: 'ownerB_sr@test.com',
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

  // Service A1 in Shop A
  fixtures.serviceA1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Corte Clásico',
      durationMinutes: 30,
      priceCents: 2500,
      isActive: true,
    },
  });

  // Service A2 in Shop A
  fixtures.serviceA2 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopA.id,
      name: 'Corte Premium',
      durationMinutes: 45,
      priceCents: 4000,
      isActive: true,
    },
  });

  // Service B1 in Shop B
  fixtures.serviceB1 = await prisma.service.create({
    data: {
      barbershopId: fixtures.shopB.id,
      name: 'Corte B',
      durationMinutes: 30,
      priceCents: 3000,
      isActive: true,
    },
  });

  // Assign services to employees
  await prisma.employeeService.createMany({
    data: [
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA1.id },
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA2.id },
      { employeeId: fixtures.employeeA2.id, serviceId: fixtures.serviceA1.id },
    ],
  });
});

beforeEach(async () => {
  await prisma.serviceRecord.deleteMany();
});

afterAll(async () => {
  await prisma.serviceRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ============================================
// HELPERS
// ============================================

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function createRecord(shopId: string, body: Record<string, unknown>, asClerkId: string) {
  return request(app)
    .post(`/api/v1/barbershops/${shopId}/service-records`)
    .set(authHeader(asClerkId))
    .send(body);
}

function listBarbershopRecords(shopId: string, asClerkId: string, query?: string) {
  const url = `/api/v1/barbershops/${shopId}/service-records${query ? '?' + query : ''}`;
  return request(app).get(url).set(authHeader(asClerkId));
}

function listEmployeeRecords(shopId: string, empId: string, asClerkId: string) {
  return request(app)
    .get(`/api/v1/barbershops/${shopId}/employees/${empId}/service-records`)
    .set(authHeader(asClerkId));
}

// ============================================
// POST /api/v1/barbershops/:barbershopId/service-records
// ============================================

describe('POST /api/v1/barbershops/:barbershopId/service-records', () => {
  it('BARBER creates own record — 201', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employeeId).toBe(fixtures.employeeA1.id);
    expect(res.body.data.serviceId).toBe(fixtures.serviceA1.id);
    expect(res.body.data.priceCents).toBe(2500);
    expect(res.body.data.service.name).toBe('Corte Clásico');
    expect(res.body.data.employee.user.name).toBe('Barber One');
  });

  it('BARBER cannot create record for another employee — 403', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA2.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('only record services for yourself');
  });

  it('BARBER cannot create record in another barbershop — 403', async () => {
    const res = await createRecord(
      fixtures.shopB.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('OWNER creates record for any employee — 201', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        clientName: 'Walk-in Client',
        paymentMethod: 'CASH',
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.clientName).toBe('Walk-in Client');
    expect(res.body.data.paymentMethod).toBe('CASH');
    expect(res.body.data.employeeId).toBe(fixtures.employeeA1.id);
  });

  it('CLIENT cannot create — 403', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/service-records`)
      .send({
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      });

    expect(res.status).toBe(401);
  });

  it('inactive/deleted service — 400', async () => {
    // Deactivate the service
    await prisma.service.update({
      where: { id: fixtures.serviceA1.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not available');

    // Restore service for other tests
    await prisma.service.update({
      where: { id: fixtures.serviceA1.id },
      data: { isActive: true, deletedAt: null },
    });
  });

  it('deactivated employee — 404', async () => {
    // Deactivate employeeA1
    await prisma.employee.update({
      where: { id: fixtures.employeeA1.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);

    // Restore employee for other tests
    await prisma.employee.update({
      where: { id: fixtures.employeeA1.id },
      data: { isActive: true, deletedAt: null },
    });
  });

  it('service from another barbershop — 404', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceB1.id,
        priceCents: 3000,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Service');
  });

  it('employee from another barbershop — 404', async () => {
    // Create an employee in Shop B
    const empB = await prisma.employee.create({
      data: { barbershopId: fixtures.shopB.id, userId: fixtures.ownerB.id, isActive: true },
    });

    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: empB.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Employee');
  });

  it('invalid priceCents (negative) — 400', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: -1,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('missing employeeId — 400', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('missing serviceId — 400', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        priceCents: 2500,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('missing priceCents — 400', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('employee not assigned to service — 400', async () => {
    // Remove the assignment for employeeA2 -> serviceA2
    await prisma.employeeService.deleteMany({
      where: { employeeId: fixtures.employeeA2.id, serviceId: fixtures.serviceA2.id },
    });

    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA2.id,
        serviceId: fixtures.serviceA2.id,
        priceCents: 4000,
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not assigned to this service');
  });

  it('record preserves custom priceCents from DB', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 1500000,
        paymentMethod: 'TRANSFER',
      },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);

    const dbRecord = await prisma.serviceRecord.findUnique({
      where: { id: res.body.data.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.priceCents).toBe(1500000);
    expect(dbRecord!.paymentMethod).toBe('TRANSFER');
  });

  it('BARBER can include optional fields (clientName, notes, paymentMethod)', async () => {
    const res = await createRecord(
      fixtures.shopA.id,
      {
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        clientName: 'Juan Pérez',
        notes: 'Prefiere tijera',
        paymentMethod: 'CASH',
      },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.data.clientName).toBe('Juan Pérez');
    expect(res.body.data.notes).toBe('Prefiere tijera');
    expect(res.body.data.paymentMethod).toBe('CASH');
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/service-records
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/service-records', () => {
  it('OWNER lists records — 200', async () => {
    // Create 2 records
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA1.id, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA2.id, serviceId: fixtures.serviceA1.id, priceCents: 3000 },
      fixtures.ownerA.clerkUserId
    );

    const res = await listBarbershopRecords(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('OWNER list filters by employeeId', async () => {
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA1.id, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA2.id, serviceId: fixtures.serviceA1.id, priceCents: 3000 },
      fixtures.ownerA.clerkUserId
    );

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      `employeeId=${fixtures.employeeA1.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].employeeId).toBe(fixtures.employeeA1.id);
  });

  it('OWNER list filters by date', async () => {
    // Create records with different dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: yesterday,
      },
    });
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA2.id,
        priceCents: 4000,
        performedAt: today,
      },
    });

    const dateStr = today.toISOString().slice(0, 10);
    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      `date=${dateStr}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('BARBER cannot access barbershop records — 403', async () => {
    const res = await listBarbershopRecords(fixtures.shopA.id, fixtures.barberUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot access — 403', async () => {
    const res = await listBarbershopRecords(fixtures.shopA.id, fixtures.clientUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('cross-tenant OWNER — 403', async () => {
    const res = await listBarbershopRecords(fixtures.shopA.id, fixtures.ownerB.clerkUserId);

    expect(res.status).toBe(403);
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records', () => {
  it('BARBER lists own records — 200', async () => {
    // Create 2 records for barberUser
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA1.id, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA2.id, priceCents: 4000 },
      fixtures.ownerA.clerkUserId
    );

    const res = await listEmployeeRecords(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].employeeId).toBe(fixtures.employeeA1.id);
  });

  it('BARBER cannot list another employee\'s records — 403', async () => {
    const res = await listEmployeeRecords(
      fixtures.shopA.id,
      fixtures.employeeA2.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('only view your own records');
  });

  it('OWNER lists employee records — 200', async () => {
    await createRecord(
      fixtures.shopA.id,
      { employeeId: fixtures.employeeA1.id, serviceId: fixtures.serviceA1.id, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );

    const res = await listEmployeeRecords(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].employeeId).toBe(fixtures.employeeA1.id);
  });

  it('CLIENT cannot access — 403', async () => {
    const res = await listEmployeeRecords(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });
});
