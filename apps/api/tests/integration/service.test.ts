/**
 * Service Management Integration Tests — PR-018
 *
 * Validates the OWNER-managed service creation endpoint:
 * POST /api/v1/barbershops/:barbershopId/services
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import type { User, Barbershop, Service } from '@prisma/client';
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
}

const fixtures: TestFixtures = {} as TestFixtures;

function getFutureServiceBookingTime(timeStr = '10:00') {
  return getNextLocalWeekdayTime(
    1,
    timeStr,
    new Date(),
    'America/Argentina/Buenos_Aires'
  );
}

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employeeInvitation.deleteMany();
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
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.service.deleteMany();
});

afterAll(async () => {
  await prisma.photo.deleteMany();
  await prisma.appointmentNotification.deleteMany();

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

function listServices(shopId: string, asClerkId: string, query?: Record<string, string>) {
  return request(app)
    .get(`/api/v1/barbershops/${shopId}/services`)
    .query(query ?? {})
    .set(authHeader(asClerkId));
}

function updateService(shopId: string, svcId: string, body: Record<string, unknown>, asClerkId: string) {
  return request(app)
    .patch(`/api/v1/barbershops/${shopId}/services/${svcId}`)
    .set(authHeader(asClerkId))
    .send(body);
}

function deleteService(shopId: string, svcId: string, asClerkId: string) {
  return request(app)
    .delete(`/api/v1/barbershops/${shopId}/services/${svcId}`)
    .set(authHeader(asClerkId));
}

async function createServiceInDb(shopId: string, overrides: Partial<{ name: string; durationMinutes: number; priceCents: number }> = {}): Promise<Service> {
  return prisma.service.create({
    data: {
      barbershopId: shopId,
      name: overrides.name ?? 'Test Service',
      durationMinutes: overrides.durationMinutes ?? 30,
      priceCents: overrides.priceCents ?? 1000,
    },
  });
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
    const nextMonday = getFutureServiceBookingTime('10:00');

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

  it('arbitrary custom names accepted — "Combo Spa" and "Servicio VIP"', async () => {
    let res = await createService(
      fixtures.shopA.id,
      { name: 'Combo Spa', durationMinutes: 30, priceCents: 2000 },
      fixtures.ownerA.clerkUserId
    );
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Combo Spa');

    res = await createService(
      fixtures.shopA.id,
      { name: 'Servicio VIP', durationMinutes: 60, priceCents: 5000 },
      fixtures.ownerA.clerkUserId
    );
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Servicio VIP');

    res = await createService(
      fixtures.shopA.id,
      { name: 'Perfilado premium', durationMinutes: 15, priceCents: 1500 },
      fixtures.ownerA.clerkUserId
    );
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Perfilado premium');
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/services
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/services', () => {
  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.service.deleteMany();
  });

  it('OWNER lists services — 200, sorted', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Corte B' });
    await createServiceInDb(fixtures.shopA.id, { name: 'Corte A' });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('empty list returns 200, data: []', async () => {
    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('GET excludes deleted services', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Active' });
    const deleted = await createServiceInDb(fixtures.shopA.id, { name: 'Deleted' });
    await prisma.service.update({ where: { id: deleted.id }, data: { isActive: false, deletedAt: new Date() } });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Active');
  });

  it('GET excludes inactive services', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Active' });
    const inactive = await createServiceInDb(fixtures.shopA.id, { name: 'Inactive' });
    await prisma.service.update({ where: { id: inactive.id }, data: { isActive: false } });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Active');
  });

  it('cross-tenant OWNER cannot list — 403', async () => {
    const res = await listServices(fixtures.shopB.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('BARBER cannot list — 403', async () => {
    const res = await listServices(fixtures.shopA.id, fixtures.barberUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot list — 403', async () => {
    const res = await listServices(fixtures.shopA.id, fixtures.clientUser.clerkUserId);

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/services`);

    expect(res.status).toBe(401);
  });

  it('includeInactive=true returns active and inactive services', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Active' });
    const inactive = await createServiceInDb(fixtures.shopA.id, { name: 'Inactive' });
    await prisma.service.update({ where: { id: inactive.id }, data: { isActive: false } });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId, { includeInactive: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const names = res.body.data.map((s: Service) => s.name);
    expect(names).toContain('Active');
    expect(names).toContain('Inactive');
  });

  it('includeInactive=false (default) still excludes inactive', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Active' });
    const inactive = await createServiceInDb(fixtures.shopA.id, { name: 'Inactive' });
    await prisma.service.update({ where: { id: inactive.id }, data: { isActive: false } });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId, { includeInactive: 'false' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Active');
  });

  it('includeInactive=true still excludes deleted services', async () => {
    await createServiceInDb(fixtures.shopA.id, { name: 'Active' });
    const deleted = await createServiceInDb(fixtures.shopA.id, { name: 'Deleted' });
    await prisma.service.update({ where: { id: deleted.id }, data: { isActive: false, deletedAt: new Date() } });

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId, { includeInactive: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Active');
  });
});

// ============================================
// PATCH /api/v1/barbershops/:barbershopId/services/:serviceId
// ============================================

describe('PATCH /api/v1/barbershops/:barbershopId/services/:serviceId', () => {
  let svcA: Service;

  beforeEach(async () => {
    await prisma.employeeService.deleteMany();
    await prisma.service.deleteMany();
    svcA = await createServiceInDb(fixtures.shopA.id, { name: 'Corte Clásico' });
  });

  it('OWNER updates service name — 200', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: 'Nuevo Nombre' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Nuevo Nombre');
  });

  it('OWNER updates description — 200', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { description: 'Nueva descripción' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('OWNER updates duration — 200', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { durationMinutes: 45 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.durationMinutes).toBe(45);
  });

  it('OWNER updates price — 200', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { priceCents: 5000 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priceCents).toBe(5000);
  });

  it('no hardcoded name restriction — "Combo Deluxe" accepted', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: 'Combo Deluxe' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Combo Deluxe');
  });

  it('invalid patch (empty name) — 400', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: '' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
  });

  it('invalid patch (negative duration) — 400', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { durationMinutes: -1 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
  });

  it('invalid patch (negative price) — 400', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { priceCents: -1 },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
  });

  it('cross-tenant patch returns 404', async () => {
    const res = await updateService(
      fixtures.shopB.id,
      svcA.id,
      { name: 'Hacked' },
      fixtures.ownerB.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('BARBER cannot patch — 403', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: 'Hacked' },
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot patch — 403', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: 'Hacked' },
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('nonexistent service — 404', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      'nonexistent-id',
      { name: 'Ghost' },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('OWNER deactivates service — 200 and isActive=false', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { isActive: false },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);
  });

  it('OWNER reactivates service — 200 and isActive=true', async () => {
    // First deactivate, then reactivate
    await updateService(
      fixtures.shopA.id,
      svcA.id,
      { isActive: false },
      fixtures.ownerA.clerkUserId
    );

    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { isActive: true },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(true);
  });

  it('isActive combined with other fields — 200', async () => {
    const res = await updateService(
      fixtures.shopA.id,
      svcA.id,
      { name: 'Inactive Cut', isActive: false },
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Inactive Cut');
    expect(res.body.data.isActive).toBe(false);
  });
});

// ============================================
// DELETE /api/v1/barbershops/:barbershopId/services/:serviceId
// ============================================

describe('DELETE /api/v1/barbershops/:barbershopId/services/:serviceId', () => {
  let svcA: Service;

  beforeEach(async () => {
    await prisma.appointmentNotification.deleteMany();

    await prisma.appointment.deleteMany();
    await prisma.employeeService.deleteMany();
    await prisma.employeeInvitation.deleteMany();
  await prisma.employee.deleteMany();
    await prisma.workingHours.deleteMany();
    await prisma.service.deleteMany();
    svcA = await createServiceInDb(fixtures.shopA.id, { name: 'Corte Clásico' });
  });

  it('OWNER soft-deletes service — 200, isActive=false, deletedAt set', async () => {
    const res = await deleteService(
      fixtures.shopA.id,
      svcA.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbSvc = await prisma.service.findUnique({ where: { id: svcA.id } });
    expect(dbSvc!.isActive).toBe(false);
    expect(dbSvc!.deletedAt).not.toBeNull();
  });

  it('deleted service no longer appears in GET list', async () => {
    await deleteService(fixtures.shopA.id, svcA.id, fixtures.ownerA.clerkUserId);

    const res = await listServices(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(200);
    const names = res.body.data.map((s: Service) => s.id);
    expect(names).not.toContain(svcA.id);
  });

  it('deleted service cannot be used for new appointment booking', async () => {
    // Create employee
    const emp = await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id, isActive: true },
    });
    // Assign service
    await prisma.employeeService.create({
      data: { employeeId: emp.id, serviceId: svcA.id },
    });
    // Set up working hours (Monday)
    await prisma.workingHours.createMany({
      data: [
        { barbershopId: fixtures.shopA.id, dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
      ],
    });

    // Delete the service
    await deleteService(fixtures.shopA.id, svcA.id, fixtures.ownerA.clerkUserId);

    // Try to book
    const nextMonday = getFutureServiceBookingTime('10:00');

    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: emp.id,
        serviceId: svcA.id,
        startAt: nextMonday.toISOString(),
      });

    expect(bookRes.status).toBe(400);
  });

  it('existing appointments referencing deleted service are preserved', async () => {
    // Create employee
    const emp = await prisma.employee.create({
      data: { barbershopId: fixtures.shopA.id, userId: fixtures.barberUser.id, isActive: true },
    });
    // Assign service
    await prisma.employeeService.create({
      data: { employeeId: emp.id, serviceId: svcA.id },
    });
    // Set up working hours (Monday)
    await prisma.workingHours.createMany({
      data: [
        { barbershopId: fixtures.shopA.id, dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
      ],
    });

    // Book appointment FIRST
    const nextMonday = getFutureServiceBookingTime('10:00');

    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set(authHeader(fixtures.clientUser.clerkUserId))
      .send({
        barbershopId: fixtures.shopA.id,
        employeeId: emp.id,
        serviceId: svcA.id,
        startAt: nextMonday.toISOString(),
      });

    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id;

    // Delete the service
    await deleteService(fixtures.shopA.id, svcA.id, fixtures.ownerA.clerkUserId);

    // Verify appointment still exists
    const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(appt).not.toBeNull();
    expect(appt!.serviceId).toBe(svcA.id);
  });

  it('double delete returns 404', async () => {
    await deleteService(fixtures.shopA.id, svcA.id, fixtures.ownerA.clerkUserId);

    const res = await deleteService(
      fixtures.shopA.id,
      svcA.id,
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('cross-tenant delete returns 404', async () => {
    const res = await deleteService(
      fixtures.shopB.id,
      svcA.id,
      fixtures.ownerB.clerkUserId
    );

    expect(res.status).toBe(404);
  });

  it('BARBER cannot delete — 403', async () => {
    const res = await deleteService(
      fixtures.shopA.id,
      svcA.id,
      fixtures.barberUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT cannot delete — 403', async () => {
    const res = await deleteService(
      fixtures.shopA.id,
      svcA.id,
      fixtures.clientUser.clerkUserId
    );

    expect(res.status).toBe(403);
  });

  it('nonexistent service — 404', async () => {
    const res = await deleteService(
      fixtures.shopA.id,
      'nonexistent-id',
      fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(404);
  });
});
