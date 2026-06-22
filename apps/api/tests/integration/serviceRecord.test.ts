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
import { getLocalDateStringInTimeZone, getUtcRangeForLocalDate, type SummaryPeriod } from '../../src/lib/dateUtils.js';
import type { User, Barbershop, Employee, Service } from '@prisma/client';

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
  barberUserB: User;
  employeeB: Employee;
  serviceA1: Service;
  serviceA2: Service;
  serviceB1: Service;
  employeeA1: Employee;
  employeeA2: Employee;
}

const fixtures: TestFixtures = {} as TestFixtures;
const TEST_TIMEZONE = 'America/Argentina/Buenos_Aires';

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

  fixtures.barberUserB = await prisma.user.create({
    data: {
      clerkUserId: 'test_barberB_sr',
      email: 'barberB_sr@test.com',
      name: 'Barber B',
      role: 'BARBER',
    },
  });

  fixtures.employeeB = await prisma.employee.create({
    data: {
      barbershopId: fixtures.shopB.id,
      userId: fixtures.barberUserB.id,
      isActive: true,
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

function listEmployeeRecords(shopId: string, empId: string, asClerkId: string, query?: string) {
  const url = `/api/v1/barbershops/${shopId}/employees/${empId}/service-records${query ? '?' + query : ''}`;
  return request(app).get(url).set(authHeader(asClerkId));
}

function getSummary(shopId: string, asClerkId: string, query?: string) {
  const url = `/api/v1/barbershops/${shopId}/service-records/summary${query ? '?' + query : ''}`;
  return request(app).get(url).set(authHeader(asClerkId));
}

function getEmployeeSummary(shopId: string, empId: string, asClerkId: string, query?: string) {
  const url = `/api/v1/barbershops/${shopId}/employees/${empId}/service-records/summary${query ? '?' + query : ''}`;
  return request(app).get(url).set(authHeader(asClerkId));
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function startOfWeekMonday(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDaysToDateString(dateStr, -daysSinceMonday);
}

function findDateInCurrentMonthOutsideCurrentWeek(today: string): string {
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDaysToDateString(weekStart, 6);
  const monthPrefix = today.slice(0, 7);

  for (let day = 1; day <= 31; day++) {
    const candidate = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    if (candidate < `${monthPrefix}-01` || candidate.slice(0, 7) !== monthPrefix) continue;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) continue;
    if (candidate < weekStart || candidate > weekEnd) return candidate;
  }

  throw new Error('Expected to find a date in the current month outside the current week');
}

function findDateInCurrentYearOutsideCurrentMonth(today: string): string {
  const yearPrefix = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);

  for (let month = 1; month <= 12; month++) {
    const candidate = `${yearPrefix}-${String(month).padStart(2, '0')}-15`;
    if (candidate.slice(0, 7) === currentMonth) continue;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) continue;
    return candidate;
  }

  throw new Error('Expected to find a date in the current year outside the current month');
}

function getCurrentPeriodFixtureDates() {
  const today = getLocalDateStringInTimeZone(TEST_TIMEZONE);
  const weekStart = startOfWeekMonday(today);

  return {
    today,
    weekOnly: today === weekStart ? addDaysToDateString(today, 1) : weekStart,
    monthOnly: findDateInCurrentMonthOutsideCurrentWeek(today),
    yearOnly: findDateInCurrentYearOutsideCurrentMonth(today),
    lastYear: `${String(Number(today.slice(0, 4)) - 1)}-12-15`,
  };
}

function getExpectedPeriodRange(period: SummaryPeriod, today: string) {
  if (period === 'today') {
    return { rangeStart: today, rangeEnd: today };
  }

  if (period === 'week') {
    const rangeStart = startOfWeekMonday(today);
    return {
      rangeStart,
      rangeEnd: addDaysToDateString(rangeStart, 6),
    };
  }

  if (period === 'month') {
    const rangeStart = `${today.slice(0, 7)}-01`;
    const [year, month] = rangeStart.split('-').map(Number) as [number, number, number];
    const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    return {
      rangeStart,
      rangeEnd: addDaysToDateString(nextMonthStart, -1),
    };
  }

  const yearPrefix = today.slice(0, 4);
  return {
    rangeStart: `${yearPrefix}-01-01`,
    rangeEnd: `${yearPrefix}-12-31`,
  };
}

function performedAtForLocalDate(dateStr: string, hour = 12): Date {
  const { startUtc } = getUtcRangeForLocalDate(dateStr, TEST_TIMEZONE);
  return new Date(startUtc.getTime() + hour * 60 * 60_000);
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

  // ==========================================
  // Timezone-aware date filtering (PR-024)
  // Shop A timezone: America/Argentina/Buenos_Aires (UTC-3)
  // ==========================================

  it('record at 01:00 UTC on June 7 is included for local date June 6', async () => {
    // June 7 01:00 UTC = June 6 22:00 ARG → belongs to local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-07T01:00:00.000Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('record at 01:00 UTC on June 7 is excluded for local date June 7', async () => {
    // June 7 01:00 UTC = June 6 22:00 ARG → NOT local June 7
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-07T01:00:00.000Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-07'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('record at local midnight (03:00 UTC) is included for that local day', async () => {
    // June 6 03:00 UTC = June 6 00:00 ARG → local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-06T03:00:00.000Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('record just before local midnight (02:59:59.999 UTC) is excluded', async () => {
    // June 6 02:59:59.999 UTC = June 5 23:59:59 ARG → NOT local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-06T02:59:59.999Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('record just before next local midnight (June 7 02:59:59 UTC) belongs to local June 6', async () => {
    // June 7 02:59:59.999 UTC = June 6 23:59:59 ARG → local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-07T02:59:59.999Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('record exactly at next local midnight (June 7 03:00 UTC) belongs to local June 7', async () => {
    // June 7 03:00:00 UTC = June 7 00:00 ARG → local June 7, NOT June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-07T03:00:00.000Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('employeeId + date combined filter works correctly', async () => {
    // Create record for employeeA1 on local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-06T15:00:00.000Z'), // June 6 12:00 ARG
      },
    });
    // Create record for employeeA2 on local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA2.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 3000,
        performedAt: new Date('2026-06-06T18:00:00.000Z'), // June 6 15:00 ARG
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      `employeeId=${fixtures.employeeA1.id}&date=2026-06-06`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].employeeId).toBe(fixtures.employeeA1.id);
  });

  // ==========================================
  // Date query validation (PR-025)
  // ==========================================

  it('rejects date=2026-6-6 (non-zero-padded) — 400', async () => {
    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-6-6'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('rejects date=not-a-date — 400', async () => {
    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=not-a-date'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('rejects date=2026-13-01 (invalid month) — 400', async () => {
    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-13-01'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('rejects date=2026-02-30 (impossible date) — 400', async () => {
    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-02-30'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('valid date=2026-06-06 still filters correctly', async () => {
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-06T15:00:00.000Z'),
      },
    });

    const res = await listBarbershopRecords(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
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

  it('BARBER list filters by local date — 200', async () => {
    // Record in local June 6 Argentina (June 6 15:00 UTC = June 6 12:00 ARG)
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-06T15:00:00.000Z'),
      },
    });
    // Record in local June 7 Argentina (June 7 04:00 UTC = June 7 01:00 ARG)
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA2.id,
        priceCents: 4000,
        performedAt: new Date('2026-06-07T04:00:00.000Z'),
      },
    });

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.id}/service-records?date=2026-06-06`)
      .set(authHeader(fixtures.barberUser.clerkUserId));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('BARBER rejects invalid date — 400', async () => {
    const res = await listEmployeeRecords(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.barberUser.clerkUserId,
      'date=not-a-date'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/service-records/summary
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/service-records/summary', () => {
  it('OWNER daily summary aggregates totals and revenue', async () => {
    await prisma.serviceRecord.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          paymentMethod: 'CASH',
          performedAt: new Date('2026-06-06T15:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA2.id,
          priceCents: 4000,
          paymentMethod: 'CARD',
          performedAt: new Date('2026-06-06T16:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA2.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          paymentMethod: 'TRANSFER',
          performedAt: new Date('2026-06-06T17:00:00.000Z'),
        },
      ],
    });

    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.date).toBe('2026-06-06');
    expect(res.body.data.totalRecords).toBe(3);
    expect(res.body.data.totalRevenueCents).toBe(9000);
    expect(res.body.data.byEmployee).toHaveLength(2);
    expect(res.body.data.byPaymentMethod).toHaveLength(3);
  });

  it('OWNER summary groups by employee with correct ordering', async () => {
    await prisma.serviceRecord.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA2.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 5000,
          performedAt: new Date('2026-06-06T15:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          performedAt: new Date('2026-06-06T16:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA2.id,
          priceCents: 4000,
          performedAt: new Date('2026-06-06T17:00:00.000Z'),
        },
      ],
    });

    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    const byEmployee = res.body.data.byEmployee;
    expect(byEmployee).toHaveLength(2);
    // employeeA1: 2500 + 4000 = 6500 → first
    // employeeA2: 5000 → second
    expect(byEmployee[0].employeeId).toBe(fixtures.employeeA1.id);
    expect(byEmployee[0].revenueCents).toBe(6500);
    expect(byEmployee[0].recordsCount).toBe(2);
    expect(byEmployee[0].employeeName).toBe('Barber One');
    expect(byEmployee[1].employeeId).toBe(fixtures.employeeA2.id);
    expect(byEmployee[1].revenueCents).toBe(5000);
    expect(byEmployee[1].recordsCount).toBe(1);
    expect(byEmployee[1].employeeName).toBe('Barber Two');
  });

  it('OWNER summary groups by payment method', async () => {
    await prisma.serviceRecord.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          paymentMethod: 'CASH',
          performedAt: new Date('2026-06-06T15:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA2.id,
          priceCents: 4000,
          paymentMethod: 'CASH',
          performedAt: new Date('2026-06-06T16:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA2.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          paymentMethod: 'CARD',
          performedAt: new Date('2026-06-06T17:00:00.000Z'),
        },
      ],
    });

    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    const byPaymentMethod = res.body.data.byPaymentMethod;
    expect(byPaymentMethod).toHaveLength(2);
    // CASH: 6500 → first, CARD: 2500 → second
    expect(byPaymentMethod[0].paymentMethod).toBe('CASH');
    expect(byPaymentMethod[0].revenueCents).toBe(6500);
    expect(byPaymentMethod[0].recordsCount).toBe(2);
    expect(byPaymentMethod[1].paymentMethod).toBe('CARD');
    expect(byPaymentMethod[1].revenueCents).toBe(2500);
    expect(byPaymentMethod[1].recordsCount).toBe(1);
  });

  it('payment method null is grouped correctly', async () => {
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        paymentMethod: null,
        performedAt: new Date('2026-06-06T15:00:00.000Z'),
      },
    });

    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    expect(res.body.data.byPaymentMethod).toHaveLength(1);
    expect(res.body.data.byPaymentMethod[0].paymentMethod).toBeNull();
    expect(res.body.data.byPaymentMethod[0].revenueCents).toBe(2500);
  });

  it('empty day returns zero totals and empty arrays', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-06-06');
    expect(res.body.data.totalRecords).toBe(0);
    expect(res.body.data.totalRevenueCents).toBe(0);
    expect(res.body.data.byEmployee).toEqual([]);
    expect(res.body.data.byPaymentMethod).toEqual([]);
  });

  it('invalid date returns 400', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=not-a-date');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('missing date returns 400', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/date/i);
  });

  it('BARBER is forbidden — 403', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.barberUser.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(403);
  });

  it('CLIENT is forbidden — 403', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.clientUser.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app).get(
      `/api/v1/barbershops/${fixtures.shopA.id}/service-records/summary?date=2026-06-06`
    );

    expect(res.status).toBe(401);
  });

  it('cross-tenant OWNER blocked — 403', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.ownerB.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(403);
  });

  it('timezone boundary: record at 01:00 UTC June 7 belongs to local June 6', async () => {
    // Shop A is America/Argentina/Buenos_Aires (UTC-3)
    // June 7 01:00 UTC = June 6 22:00 ARG → local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        performedAt: new Date('2026-06-07T01:00:00.000Z'),
      },
    });

    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06');

    expect(res.status).toBe(200);
    expect(res.body.data.totalRecords).toBe(1);
    expect(res.body.data.totalRevenueCents).toBe(2500);
  });

  it.each([
    ['today', 1, 1000],
    ['week', 2, 3000],
    ['month', 3, 6000],
    ['year', 4, 10000],
  ] satisfies Array<[SummaryPeriod, number, number]>)(
    'OWNER period summary supports %s',
    async (period, expectedRecords, expectedRevenue) => {
      const dates = getCurrentPeriodFixtureDates();

      await prisma.serviceRecord.createMany({
        data: [
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 1000,
            paymentMethod: 'CASH',
            performedAt: performedAtForLocalDate(dates.today, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 2000,
            paymentMethod: 'CARD',
            performedAt: performedAtForLocalDate(dates.weekOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA2.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 3000,
            paymentMethod: 'TRANSFER',
            performedAt: performedAtForLocalDate(dates.monthOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA2.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 4000,
            paymentMethod: 'OTHER',
            performedAt: performedAtForLocalDate(dates.yearOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 5000,
            paymentMethod: 'CASH',
            performedAt: performedAtForLocalDate(dates.lastYear, 12),
          },
        ],
      });

      const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, `period=${period}`);
      const expectedRange = getExpectedPeriodRange(period, dates.today);

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe(period);
      expect(res.body.data.rangeStart).toBe(expectedRange.rangeStart);
      expect(res.body.data.rangeEnd).toBe(expectedRange.rangeEnd);
      expect(res.body.data.totalRecords).toBe(expectedRecords);
      expect(res.body.data.totalRevenueCents).toBe(expectedRevenue);
    }
  );

  it('OWNER summary filters by employeeId for a period', async () => {
    const dates = getCurrentPeriodFixtureDates();

    await prisma.serviceRecord.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          performedAt: performedAtForLocalDate(dates.today, 12),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA2.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 3000,
          performedAt: performedAtForLocalDate(dates.today, 13),
        },
      ],
    });

    const res = await getSummary(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      `period=today&employeeId=${fixtures.employeeA1.id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.totalRecords).toBe(1);
    expect(res.body.data.totalRevenueCents).toBe(2500);
    expect(res.body.data.byEmployee).toHaveLength(1);
    expect(res.body.data.byEmployee[0].employeeId).toBe(fixtures.employeeA1.id);
  });

  it('OWNER employee filter rejects employee from another shop — 404', async () => {
    const res = await getSummary(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      `period=today&employeeId=${fixtures.employeeB.id}`
    );

    expect(res.status).toBe(404);
  });

  it('OWNER employee filter rejects a missing employee — 404', async () => {
    const res = await getSummary(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'period=today&employeeId=missing-employee-id'
    );

    expect(res.status).toBe(404);
  });

  it('OWNER employee filter rejects an inactive employee — 400', async () => {
    await prisma.employee.update({
      where: { id: fixtures.employeeA2.id },
      data: { isActive: false },
    });

    try {
      const res = await getSummary(
        fixtures.shopA.id,
        fixtures.ownerA.clerkUserId,
        `period=today&employeeId=${fixtures.employeeA2.id}`
      );

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('not active');
    } finally {
      await prisma.employee.update({
        where: { id: fixtures.employeeA2.id },
        data: { isActive: true },
      });
    }
  });

  it('invalid period returns 400', async () => {
    const res = await getSummary(fixtures.shopA.id, fixtures.ownerA.clerkUserId, 'period=quarter');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('period');
  });

  it('sending both date and period returns 400', async () => {
    const res = await getSummary(
      fixtures.shopA.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06&period=today'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('cannot be used together');
  });
});

// ============================================
// GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records/summary
// ============================================

describe('GET /api/v1/barbershops/:barbershopId/employees/:employeeId/service-records/summary', () => {
  it('OWNER gets employee summary with totals and payment breakdown', async () => {
    await prisma.serviceRecord.createMany({
      data: [
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA1.id,
          priceCents: 2500,
          paymentMethod: 'CASH',
          performedAt: new Date('2026-06-06T15:00:00.000Z'),
        },
        {
          barbershopId: fixtures.shopA.id,
          employeeId: fixtures.employeeA1.id,
          serviceId: fixtures.serviceA2.id,
          priceCents: 4000,
          paymentMethod: 'CARD',
          performedAt: new Date('2026-06-06T16:00:00.000Z'),
        },
      ],
    });

    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.date).toBe('2026-06-06');
    expect(res.body.data.employeeId).toBe(fixtures.employeeA1.id);
    expect(res.body.data.employeeName).toBe('Barber One');
    expect(res.body.data.totalRecords).toBe(2);
    expect(res.body.data.totalRevenueCents).toBe(6500);
    expect(res.body.data.byPaymentMethod).toHaveLength(2);
    // CASH: 2500, CARD: 4000 → CARD first (higher revenue)
    expect(res.body.data.byPaymentMethod[0].paymentMethod).toBe('CARD');
    expect(res.body.data.byPaymentMethod[0].revenueCents).toBe(4000);
    expect(res.body.data.byPaymentMethod[1].paymentMethod).toBe('CASH');
    expect(res.body.data.byPaymentMethod[1].revenueCents).toBe(2500);
    // No unsafe fields
    expect(res.body.data.clerkUserId).toBeUndefined();
    expect(res.body.data.user).toBeUndefined();
  });

  it('BARBER views own employee summary', async () => {
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        paymentMethod: 'TRANSFER',
        performedAt: new Date('2026-06-06T15:00:00.000Z'),
      },
    });

    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.barberUser.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.totalRecords).toBe(1);
    expect(res.body.data.totalRevenueCents).toBe(2500);
    expect(res.body.data.employeeId).toBe(fixtures.employeeA1.id);
  });

  it('BARBER cannot view another employee summary — 403', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA2.id, fixtures.barberUser.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(403);
  });

  it('CLIENT is forbidden — 403', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.clientUser.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(403);
  });

  it('unauthenticated — 401', async () => {
    const res = await request(app).get(
      `/api/v1/barbershops/${fixtures.shopA.id}/employees/${fixtures.employeeA1.id}/service-records/summary?date=2026-06-06`
    );

    expect(res.status).toBe(401);
  });

  it('cross-tenant OWNER blocked — 403', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerB.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(403);
  });

  it('deactivated employee returns 404', async () => {
    // Deactivate employeeA1 temporarily
    await prisma.employee.update({
      where: { id: fixtures.employeeA1.id },
      data: { isActive: false, deletedAt: new Date() },
    });

    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06'
    );

    // Restore
    await prisma.employee.update({
      where: { id: fixtures.employeeA1.id },
      data: { isActive: true, deletedAt: null },
    });

    expect(res.status).toBe(404);
  });

  it('missing date returns 400', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/date/i);
  });

  it('invalid date returns 400', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId, 'date=not-a-date'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('date');
  });

  it('empty day returns zero totals and empty arrays', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-06-06');
    expect(res.body.data.totalRecords).toBe(0);
    expect(res.body.data.totalRevenueCents).toBe(0);
    expect(res.body.data.byPaymentMethod).toEqual([]);
  });

  it('timezone boundary uses local barbershop day', async () => {
    // Shop A = America/Argentina/Buenos_Aires (UTC-3)
    // June 7 01:00 UTC = June 6 22:00 ARG → local June 6
    await prisma.serviceRecord.create({
      data: {
        barbershopId: fixtures.shopA.id,
        employeeId: fixtures.employeeA1.id,
        serviceId: fixtures.serviceA1.id,
        priceCents: 2500,
        paymentMethod: 'CASH',
        performedAt: new Date('2026-06-07T01:00:00.000Z'),
      },
    });

    const res = await getEmployeeSummary(
      fixtures.shopA.id, fixtures.employeeA1.id, fixtures.ownerA.clerkUserId, 'date=2026-06-06'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.totalRecords).toBe(1);
    expect(res.body.data.totalRevenueCents).toBe(2500);
  });

  it.each([
    ['today', 1, 1000],
    ['week', 2, 3000],
    ['month', 3, 6000],
    ['year', 4, 10000],
  ] satisfies Array<[SummaryPeriod, number, number]>)(
    'BARBER own summary supports %s',
    async (period, expectedRecords, expectedRevenue) => {
      const dates = getCurrentPeriodFixtureDates();

      await prisma.serviceRecord.createMany({
        data: [
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 1000,
            paymentMethod: 'CASH',
            performedAt: performedAtForLocalDate(dates.today, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 2000,
            paymentMethod: 'CARD',
            performedAt: performedAtForLocalDate(dates.weekOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 3000,
            paymentMethod: 'TRANSFER',
            performedAt: performedAtForLocalDate(dates.monthOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 4000,
            paymentMethod: 'OTHER',
            performedAt: performedAtForLocalDate(dates.yearOnly, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA1.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 5000,
            paymentMethod: 'CASH',
            performedAt: performedAtForLocalDate(dates.lastYear, 12),
          },
          {
            barbershopId: fixtures.shopA.id,
            employeeId: fixtures.employeeA2.id,
            serviceId: fixtures.serviceA1.id,
            priceCents: 9999,
            paymentMethod: 'CASH',
            performedAt: performedAtForLocalDate(dates.today, 13),
          },
        ],
      });

      const res = await getEmployeeSummary(
        fixtures.shopA.id,
        fixtures.employeeA1.id,
        fixtures.barberUser.clerkUserId,
        `period=${period}`
      );
      const expectedRange = getExpectedPeriodRange(period, dates.today);

      expect(res.status).toBe(200);
      expect(res.body.data.period).toBe(period);
      expect(res.body.data.rangeStart).toBe(expectedRange.rangeStart);
      expect(res.body.data.rangeEnd).toBe(expectedRange.rangeEnd);
      expect(res.body.data.totalRecords).toBe(expectedRecords);
      expect(res.body.data.totalRevenueCents).toBe(expectedRevenue);
      expect(res.body.data.employeeId).toBe(fixtures.employeeA1.id);
    }
  );

  it('BARBER cannot view another employee period summary — 403', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id,
      fixtures.employeeA2.id,
      fixtures.barberUser.clerkUserId,
      'period=week'
    );

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('own records');
  });

  it('employee summary invalid period returns 400', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.ownerA.clerkUserId,
      'period=quarter'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('period');
  });

  it('employee summary rejects both date and period — 400', async () => {
    const res = await getEmployeeSummary(
      fixtures.shopA.id,
      fixtures.employeeA1.id,
      fixtures.ownerA.clerkUserId,
      'date=2026-06-06&period=today'
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('cannot be used together');
  });
});
