/**
 * Service Management Integration Tests — PR-018
 *
 * Validates the OWNER-managed service creation endpoint:
 * POST /api/v1/barbershops/:barbershopId/services
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
  ownerB: User;
  shopB: Barbershop;
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

  fixtures.ownerA = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerA_svc',
      email: 'ownerA_svc@test.com',
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

  fixtures.barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber_svc',
      email: 'barber_svc@test.com',
      name: 'Barber',
      role: 'BARBER',
    },
  });

  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_client_svc',
      email: 'client_svc@test.com',
      name: 'Client',
      role: 'CLIENT',
    },
  });

  fixtures.ownerB = await prisma.user.create({
    data: {
      clerkUserId: 'test_ownerB_svc',
      email: 'ownerB_svc@test.com',
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
});

beforeEach(async () => {
  await prisma.employeeService.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
});

afterAll(async () => {
  await prisma.photo.deleteMany();
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

function createService(shopId: string, body: Record<string, unknown>, asClerkId: string) {
  return request(app)
    .post(`/api/v1/barbershops/${shopId}/services`)
    .set(authHeader(asClerkId))
    .send(body);
}

// ============================================
// TESTS
// ============================================

describe('POST /api/v1/barbershops/:barbershopId/services', () => {
  it('OWNER creates service successfully — 201', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Corte Clásico', durationMinutes: 30, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Corte Clásico');
    expect(res.body.data.durationMinutes).toBe(30);
    expect(res.body.data.priceCents).toBe(2500);
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
    expect(res.body.data.isActive).toBe(true);
  });

  it('DB row persists with correct barbershopId', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Corte Clásico', durationMinutes: 30, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );

    const svc = await prisma.service.findUnique({
      where: { id: res.body.data.id },
    });
    expect(svc).not.toBeNull();
    expect(svc!.barbershopId).toBe(fixtures.shopA.id);
    expect(svc!.name).toBe('Corte Clásico');
  });

  it('barbershopId from body is rejected by strict schema — 400', async () => {
    // Sending extra field barbershopId in body is rejected by .strict()
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Test', durationMinutes: 30, priceCents: 1000, barbershopId: fixtures.shopB.id },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('duplicate name in same barbershop is allowed', async () => {
    await createService(
      fixtures.shopA.id,
      { name: 'Corte', durationMinutes: 30, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );

    const res = await createService(
      fixtures.shopA.id,
      { name: 'Corte', durationMinutes: 45, priceCents: 3500 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
  });

  it('OWNER cannot create service in another barbershop — 403', async () => {
    const res = await createService(
      fixtures.shopB.id,
      { name: 'Test', durationMinutes: 30, priceCents: 1000 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('do not own');
  });

  it('BARBER cannot create service — 403', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Test', durationMinutes: 30, priceCents: 1000 },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot create service — 403', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Test', durationMinutes: 30, priceCents: 1000 },
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated request — 401', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/services`)
      .send({ name: 'Test', durationMinutes: 30, priceCents: 1000 });

    expect(res.status).toBe(401);
  });

  it('missing name — 400 validation error', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { durationMinutes: 30, priceCents: 1000 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('empty name — 400 validation error', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: '', durationMinutes: 30, priceCents: 1000 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid durationMinutes <= 0 — 400', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Test', durationMinutes: 0, priceCents: 1000 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid priceCents < 0 — 400', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Test', durationMinutes: 30, priceCents: -1 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('optional description works', async () => {
    const res = await createService(
      fixtures.shopA.id,
      { name: 'Corte Premium', durationMinutes: 45, priceCents: 4000, description: 'Corte con tijera caliente' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe('Corte con tijera caliente');
  });

  it('created service can be assigned to an employee', async () => {
    // Create service
    const svcRes = await createService(
      fixtures.shopA.id,
      { name: 'Corte', durationMinutes: 30, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );
    const serviceId = svcRes.body.data.id;

    // Create employee
    const emp = await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id, isActive: true },
    });

    // Assign service to employee
    const assignRes = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${emp.id}/services`)
      .set(authHeader(fixtures.ownerA.clerkUserId))
      .send({ serviceId });

    expect(assignRes.status).toBe(201);
    expect(assignRes.body.data.serviceId).toBe(serviceId);
  });

  it('employee with assigned service can receive an appointment', async () => {
    // Create service
    const svcRes = await createService(
      fixtures.shopA.id,
      { name: 'Corte', durationMinutes: 30, priceCents: 2500 },
      fixtures.ownerA.clerkUserId
    );
    const serviceId = svcRes.body.data.id;

    // Create employee and assign service
    const emp = await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id, isActive: true },
    });
    await prisma.employeeService.create({
      data: { employeeId: emp.id, serviceId },
    });

    // Set up working hours
    await prisma.workingHours.createMany({
      data: [
        { barbershopId: fixtures.shopA.id, dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
      ],
      skipDuplicates: true,
    });

    // Book appointment
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(13, 0, 0, 0);

    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: emp.id,
        serviceId,
        startAt: nextMonday.toISOString(),
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
  });
});
