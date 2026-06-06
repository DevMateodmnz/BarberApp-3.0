/**
 * Me Context Integration Tests — PR-028B
 *
 * Validates GET /api/v1/me/context returning authenticated user's
 * role, barbershop context, and employee context.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { app } from '../../src/index.js';
import type { User, Barbershop, Employee } from '@prisma/client';

// ============================================
// TEST FIXTURES
// ============================================

interface TestFixtures {
  ownerWithShop: User;
  ownerWithShop_email: string;
  shopA: Barbershop;
  ownerNoShop: User;
  ownerNoShop_email: string;
  barberActive: User;
  barberActive_email: string;
  employeeActive: Employee;
  shopB: Barbershop;
  barberDeactivated: User;
  barberDeactivated_email: string;
  employeeDeactivated: Employee;
  clientUser: User;
  clientUser_email: string;
}

const fixtures: TestFixtures = {} as TestFixtures;

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeAll(async () => {
  // Clean all related tables in order
  await prisma.serviceRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  // OWNER with a barbershop
  fixtures.ownerWithShop = await prisma.user.create({
    data: {
      clerkUserId: 'test_owner_shop_me',
      email: 'owner_shop_me@test.com',
      name: 'Owner With Shop',
      role: 'OWNER',
    },
  });
  fixtures.ownerWithShop_email = 'owner_shop_me@test.com';
  fixtures.shopA = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerWithShop.id,
      name: 'Shop Alpha',
      address: '123 Main St',
      phone: '+541112345678',
    },
  });

  // OWNER without a barbershop
  fixtures.ownerNoShop = await prisma.user.create({
    data: {
      clerkUserId: 'test_owner_noshop_me',
      email: 'owner_noshop_me@test.com',
      name: 'Owner No Shop',
      role: 'OWNER',
    },
  });
  fixtures.ownerNoShop_email = 'owner_noshop_me@test.com';

  // BARBER with an active employee record
  fixtures.barberActive = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber_active_me',
      email: 'barber_active_me@test.com',
      name: 'Barber Active',
      role: 'BARBER',
    },
  });
  fixtures.barberActive_email = 'barber_active_me@test.com';
  fixtures.shopB = await prisma.barbershop.create({
    data: {
      ownerId: fixtures.ownerWithShop.id, // re-use owner
      name: 'Shop Beta',
      address: '456 Oak Ave',
      phone: '+541129876543',
    },
  });
  fixtures.employeeActive = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopB.id,
      userId: fixtures.barberActive.id,
      isActive: true,
    },
  });

  // BARBER with a deactivated employee record
  fixtures.barberDeactivated = await prisma.user.create({
    data: {
      clerkUserId: 'test_barber_deact_me',
      email: 'barber_deact_me@test.com',
      name: 'Barber Deactivated',
      role: 'BARBER',
    },
  });
  fixtures.barberDeactivated_email = 'barber_deact_me@test.com';
  fixtures.employeeDeactivated = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopB.id,
      userId: fixtures.barberDeactivated.id,
      isActive: false,
      deletedAt: new Date(),
    },
  });

  // CLIENT
  fixtures.clientUser = await prisma.user.create({
    data: {
      clerkUserId: 'test_client_me',
      email: 'client_me@test.com',
      name: 'Client User',
      role: 'CLIENT',
    },
  });
  fixtures.clientUser_email = 'client_me@test.com';
});

beforeEach(async () => {
  // No-op: fixtures persist across tests
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

function getContext(asClerkId: string) {
  return request(app)
    .get('/api/v1/me/context')
    .set(authHeader(asClerkId));
}

// ============================================
// TESTS
// ============================================

describe('GET /api/v1/me/context', () => {
  it('unauthenticated returns 401', async () => {
    const res = await request(app).get('/api/v1/me/context');

    expect(res.status).toBe(401);
  });

  it('OWNER with barbershop gets role and barbershop context', async () => {
    const res = await getContext(fixtures.ownerWithShop.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.ownerWithShop.id);
    expect(res.body.data.role).toBe('OWNER');
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
    expect(res.body.data.barbershopName).toBe('Shop Alpha');
    expect(res.body.data.employeeId).toBeNull();
    expect(res.body.data.employeeName).toBeNull();
  });

  it('OWNER without barbershop gets role and null context', async () => {
    const res = await getContext(fixtures.ownerNoShop.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.ownerNoShop.id);
    expect(res.body.data.role).toBe('OWNER');
    expect(res.body.data.barbershopId).toBeNull();
    expect(res.body.data.barbershopName).toBeNull();
    expect(res.body.data.employeeId).toBeNull();
    expect(res.body.data.employeeName).toBeNull();
  });

  it('BARBER with active employee gets full context', async () => {
    const res = await getContext(fixtures.barberActive.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.barberActive.id);
    expect(res.body.data.role).toBe('BARBER');
    expect(res.body.data.barbershopId).toBe(fixtures.shopB.id);
    expect(res.body.data.barbershopName).toBe('Shop Beta');
    expect(res.body.data.employeeId).toBe(fixtures.employeeActive.id);
    expect(res.body.data.employeeName).toBe('Barber Active');
  });

  it('BARBER with deactivated employee gets null context', async () => {
    const res = await getContext(fixtures.barberDeactivated.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.barberDeactivated.id);
    expect(res.body.data.role).toBe('BARBER');
    expect(res.body.data.barbershopId).toBeNull();
    expect(res.body.data.employeeId).toBeNull();
  });

  it('CLIENT gets role and null context', async () => {
    const res = await getContext(fixtures.clientUser.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(fixtures.clientUser.id);
    expect(res.body.data.role).toBe('CLIENT');
    expect(res.body.data.barbershopId).toBeNull();
    expect(res.body.data.employeeId).toBeNull();
  });

  it('response does not expose clerkUserId', async () => {
    const res = await getContext(fixtures.ownerWithShop.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.clerkUserId).toBeUndefined();
    expect(res.body.data.user).toBeUndefined();
  });

  it('response shape is stable (all expected keys present)', async () => {
    const res = await getContext(fixtures.ownerWithShop.clerkUserId);

    expect(res.status).toBe(200);
    const keys = Object.keys(res.body.data).sort();
    expect(keys).toEqual([
      'barbershopId',
      'barbershopName',
      'employeeId',
      'employeeName',
      'role',
      'userId',
    ]);
  });

  it('does not return deleted barbershop', async () => {
    // Owner has two shops (shopA and shopB). Soft-delete shopB,
    // then verify it is not returned as the context barbershop.
    await prisma.barbershop.update({
      where: { id: fixtures.shopB.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    const res = await getContext(fixtures.ownerWithShop.clerkUserId);

    expect(res.status).toBe(200);
    // shopA should still be returned (the first active, non-deleted shop)
    expect(res.body.data.barbershopId).toBe(fixtures.shopA.id);
    expect(res.body.data.barbershopName).toBe('Shop Alpha');

    // Restore
    await prisma.barbershop.update({
      where: { id: fixtures.shopB.id },
      data: { deletedAt: null, isActive: true },
    });
  });

  it('BARBER with no employee record at all gets null context', async () => {
    // Create a fresh BARBER with no employee record
    const newBarber = await prisma.user.create({
      data: {
        clerkUserId: 'test_barber_noemp_me',
        email: 'barber_noemp_me@test.com',
        name: 'Barber No Emp',
        role: 'BARBER',
      },
    });

    const res = await getContext(newBarber.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('BARBER');
    expect(res.body.data.employeeId).toBeNull();
    expect(res.body.data.barbershopId).toBeNull();

    // Cleanup
    await prisma.user.delete({ where: { id: newBarber.id } });
  });
});