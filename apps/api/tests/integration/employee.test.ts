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
import type { User, Barbershop } from '@prisma/client';

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
});

beforeEach(async () => {
  await prisma.employee.deleteMany();
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
