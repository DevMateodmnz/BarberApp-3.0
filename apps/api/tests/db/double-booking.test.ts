/**
 * Database-Level Double-Booking Constraint Tests
 *
 * These tests validate the PostgreSQL GiST exclusion constraint
 * (no_double_booking) directly via prisma.appointment.create(),
 * bypassing the service layer entirely. Tests exercise sequential
 * and concurrent overlapping insert rejection, back-to-back
 * allowance, terminal status exemption, and per-employee scoping.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  createTestUser,
  createTestBarbershop,
  createTestEmployee,
  createTestService,
  cleanupTestData,
  prisma,
} from './helpers';

describe('DB Double-Booking Constraint', () => {
  let barbershopId: string;
  let employee1Id: string;
  let employee2Id: string;
  let clientId: string;
  let serviceId: string;

  beforeEach(async () => {
    await cleanupTestData();

    // Create shared test fixtures
    const shop = await createTestBarbershop({ name: 'DB Constraint Test Shop' });
    barbershopId = shop.barbershop.id;

    const client = await createTestUser({ role: 'CLIENT' as const });
    clientId = client.user.id;

    const emp1 = await createTestEmployee({ barbershopId });
    employee1Id = emp1.employee.id;

    const emp2 = await createTestEmployee({ barbershopId });
    employee2Id = emp2.employee.id;

    const svc = await createTestService({ barbershopId, durationMinutes: 30 });
    serviceId = svc.service.id;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // Helper: build appointment data with fixed or relative times
  function buildAppointment(overrides: {
    employeeId: string;
    startMinutes?: number;
    endMinutes?: number;
    status?: AppointmentStatus;
  }) {
    const base = new Date('2026-06-04T14:00:00.000Z');
    const startAt = new Date(
      base.getTime() + (overrides.startMinutes ?? 0) * 60_000
    );
    const endAt = new Date(
      base.getTime() + (overrides.endMinutes ?? 30) * 60_000
    );
    return {
      barbershopId,
      employeeId: overrides.employeeId,
      clientId,
      serviceId,
      clientName: 'DB Constraint Client',
      clientPhone: null,
      serviceName: 'Test Service',
      servicePriceCents: 2500,
      serviceDurationMinutes: 30,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status: overrides.status ?? AppointmentStatus.PENDING,
      notes: null,
    };
  }

  // ========================================
  // Test 1: Sequential overlap blocked
  // ========================================
  it('rejects sequential overlapping insert (same employee, overlapping time)', async () => {
    // Insert A: E1, 14:00–14:30, PENDING
    await prisma.appointment.create({
      data: buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 }),
    });

    // Attempt B: E1, 14:15–14:45, PENDING — overlaps A
    // Prisma throws PrismaClientUnknownRequestError for exclusion constraint violations
    // (PostgreSQL SQLSTATE 23P01 — not mapped to a known Prisma error code).
    // Constraint name "no_double_booking" appears in the error message.
    try {
      await prisma.appointment.create({
        data: buildAppointment({ employeeId: employee1Id, startMinutes: 15, endMinutes: 45 }),
      });
      expect.unreachable('Expected overlapping insert to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
      expect((err as Error).message).toContain('no_double_booking');
      expect((err as unknown as { code?: string }).code).toBeUndefined(); // Unknown errors have no code
    }
  });

  // ========================================
  // Test 2: Concurrent race — exactly one succeeds
  // ========================================
  it('resolves concurrent race: exactly one insert succeeds', async () => {
    const dataA = buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 });
    const dataB = buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 });

    const results = await Promise.allSettled([
      prisma.appointment.create({ data: dataA }),
      prisma.appointment.create({ data: dataB }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The rejected promise should contain the exclusion constraint error
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    expect((err as Error).message).toContain('no_double_booking');
  });

  // ========================================
  // Test 3: Back-to-back allowed
  // ========================================
  it('allows back-to-back appointments (no overlap with [) bounds)', async () => {
    // Insert A: E1, 14:00–14:30
    await prisma.appointment.create({
      data: buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 }),
    });

    // Insert B: E1, 14:30–15:00 — end of A == start of B, [) bounds
    await expect(
      prisma.appointment.create({
        data: buildAppointment({ employeeId: employee1Id, startMinutes: 30, endMinutes: 60 }),
      })
    ).resolves.toBeDefined();
  });

  // ========================================
  // Test 4: Terminal status exempt from constraint
  // ========================================
  it('allows overlapping when existing appointment has terminal status (COMPLETED)', async () => {
    // Insert A: E1, 14:00–14:30, COMPLETED
    await prisma.appointment.create({
      data: buildAppointment({
        employeeId: employee1Id,
        startMinutes: 0,
        endMinutes: 30,
        status: AppointmentStatus.COMPLETED,
      }),
    });

    // Insert B: E1, 14:00–14:30, PENDING — same slot, but A is terminal
    await expect(
      prisma.appointment.create({
        data: buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 }),
      })
    ).resolves.toBeDefined();
  });

  // ========================================
  // Test 5: Different employees allowed
  // ========================================
  it('allows overlapping appointments for different employees', async () => {
    // Insert A: E1, 14:00–14:30
    await prisma.appointment.create({
      data: buildAppointment({ employeeId: employee1Id, startMinutes: 0, endMinutes: 30 }),
    });

    // Insert B: E2, 14:00–14:30 — different employee, same slot
    await expect(
      prisma.appointment.create({
        data: buildAppointment({ employeeId: employee2Id, startMinutes: 0, endMinutes: 30 }),
      })
    ).resolves.toBeDefined();
  });
});
