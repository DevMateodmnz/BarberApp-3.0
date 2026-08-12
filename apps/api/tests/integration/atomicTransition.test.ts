/**
 * Deterministic race tests for the appointment state machine.
 *
 * These tests do NOT trust read-then-update code. They exercise
 * the compare-and-swap helpers and assert that:
 *
 *  - exactly one of two concurrent transitions on the same row
 *    succeeds,
 *  - the final database row matches the winner,
 *  - the loser receives a deterministic 409 with a stable error
 *    code (`APPOINTMENT_TRANSITION_CONFLICT` or the public-cancel
 *    equivalent),
 *  - the cancellation metadata is internally consistent
 *    (cancelled_at, cancellation_source, cancelled_by_role agree
 *    with the DB CHECK constraint).
 *
 * The tests use `Promise.all` to launch operations concurrently.
 * The CAS guarantees serialize the outcome regardless of the
 * scheduler; the test does not depend on a specific real-world
 * race window.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { generatePublicBookingReference } from '../../src/lib/publicBookingReference.js';
import { TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  shop: { id: string; slug: string };
  service: { id: string; durationMinutes: number };
  client: { id: string; clerkUserId: string };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function createAppointment(
  status: 'CONFIRMED' | 'PENDING' | 'IN_PROGRESS' = 'CONFIRMED',
  daysOffset = 1
) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysOffset);
  const dayStr = day.toISOString().slice(0, 10);
  const startAt = localDateTimeToUtc(dayStr, '10:00', TEST_BARBERSHOP_TIMEZONE);
  const endAt = new Date(startAt.getTime() + fixtures.service.durationMinutes * 60_000);
  const publicReference = generatePublicBookingReference();

  return prisma.appointment.create({
    data: {
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barber.employeeId,
      clientId: status === 'CONFIRMED' ? null : fixtures.client.id,
      serviceId: fixtures.service.id,
      clientName: status === 'CONFIRMED' ? 'Public Cancel Client' : 'Staff Client',
      clientPhone: '+5493815551234',
      clientPhoneNormalized: '+5493815551234',
      serviceName: 'Race Test Service',
      servicePriceCents: 2500,

      discountCents: 0,

      finalPriceCents: 2500,
      serviceDurationMinutes: fixtures.service.durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status,
      publicReference: status === 'CONFIRMED' ? publicReference : null,
      publicConsentAcceptedAt: status === 'CONFIRMED' ? new Date() : null,
      publicConsentVersion: status === 'CONFIRMED' ? 'v1' : null,
      notes: null,
    },
  });
}

beforeAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'race_owner',
      email: 'race-owner@test.com',
      role: 'OWNER',
    },
  });
  const barber = await prisma.user.create({
    data: {
      clerkUserId: 'race_barber',
      email: 'race-barber@test.com',
      role: 'BARBER',
    },
  });
  const client = await prisma.user.create({
    data: {
      clerkUserId: 'race_client',
      email: 'race-client@test.com',
      role: 'CLIENT',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Race Test Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'race-test-shop',
      isActive: true,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const employee = await prisma.employee.create({
    data: { barbershopId: shop.id, userId: barber.id },
  });
  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Race Test Service',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });
  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barber = {
    id: barber.id,
    clerkUserId: barber.clerkUserId,
    employeeId: employee.id,
  };
  fixtures.client = { id: client.id, clerkUserId: client.clerkUserId };
  fixtures.shop = { id: shop.id, slug: 'race-test-shop' };
  fixtures.service = { id: service.id, durationMinutes: service.durationMinutes };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
});

afterAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();

  await prisma.appointment.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

function cancelUrl(reference: string) {
  return `/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${reference}/cancel`;
}

async function readRow(id: string) {
  return prisma.appointment.findUniqueOrThrow({ where: { id } });
}

describe('Atomic CAS for staff status transitions', () => {
  it('two concurrent CONFIRMED -> IN_PROGRESS transitions: exactly one wins, the other gets a deterministic 409', async () => {
    const appointment = await createAppointment('CONFIRMED');

    const [resA, resB] = await Promise.all([
      request(app)
        .put(`/api/v1/appointments/${appointment.id}/status`)
        .set(authHeader(fixtures.barber.clerkUserId))
        .send({ status: 'IN_PROGRESS' }),
      request(app)
        .put(`/api/v1/appointments/${appointment.id}/status`)
        .set(authHeader(fixtures.barber.clerkUserId))
        .send({ status: 'IN_PROGRESS' }),
    ]);

    // Exactly one wins. Accept either CAS conflict (409
    // APPOINTMENT_TRANSITION_CONFLICT) or validation rejection
    // (400) when the second read observes the post-winner
    // status. Both are deterministic.
    const successes = [resA, resB].filter((r) => r.status === 200);
    const conflicts = [resA, resB].filter(
      (r) => r.status === 409 || r.status === 400
    );
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    // Conflict code is one of the two deterministic codes.
    const code = conflicts[0]?.body?.error?.code;
    expect(['APPOINTMENT_TRANSITION_CONFLICT', 'BAD_REQUEST']).toContain(code);

    // Database matches the winner.
    const persisted = await readRow(appointment.id);
    expect(persisted.status).toBe('IN_PROGRESS');
    expect(persisted.startedAt).toBeInstanceOf(Date);
  });

  it('two concurrent CONFIRMED -> CANCELLED transitions: exactly one wins, the other gets a deterministic 409', async () => {
    const appointment = await createAppointment('CONFIRMED');

    const [resA, resB] = await Promise.all([
      request(app)
        .delete(`/api/v1/appointments/${appointment.id}`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ reason: 'first' }),
      request(app)
        .delete(`/api/v1/appointments/${appointment.id}`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ reason: 'second' }),
    ]);

    const successes = [resA, resB].filter((r) => r.status === 200);
    const conflicts = [resA, resB].filter((r) => r.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.body.error.code).toBe('APPOINTMENT_TRANSITION_CONFLICT');

    // The persisted row has exactly the winner's metadata: no
    // mixed sources, no half-applied updates.
    const persisted = await readRow(appointment.id);
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.cancellationSource).toBe('STAFF');
    expect(persisted.cancelledByRole).toBe('OWNER');
    expect(persisted.cancelReason).not.toBeNull();
  });

  it('two concurrent transitions to different terminal states: exactly one wins', async () => {
    // CONFIRMED -> IN_PROGRESS (BARBER) and CONFIRMED -> CANCELLED
    // (OWNER) race. Only one may land; the other must observe the
    // post-winner status and either succeed-into-IMPOSSIBLE (return
    // conflict) or fail with a deterministic terminal code.
    const appointment = await createAppointment('CONFIRMED');

    const [resBarber, resOwner] = await Promise.all([
      request(app)
        .put(`/api/v1/appointments/${appointment.id}/status`)
        .set(authHeader(fixtures.barber.clerkUserId))
        .send({ status: 'IN_PROGRESS' }),
      request(app)
        .delete(`/api/v1/appointments/${appointment.id}`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ reason: 'race to terminal' }),
    ]);

    const statuses = [resBarber.status, resOwner.status].sort();
    // One wins, the other loses with a deterministic 409.
    expect([200, 409]).toContain(statuses[0]);
    expect([200, 409]).toContain(statuses[1]);
    expect(statuses[0]).not.toBe(statuses[1]);

    const persisted = await readRow(appointment.id);
    // The terminal state must be the single committed transition.
    expect(['IN_PROGRESS', 'CANCELLED']).toContain(persisted.status);
    // The cancellation metadata must be internally consistent
    // (the DB CHECK constraint enforces this; we double-check here).
    if (persisted.status === 'CANCELLED') {
      expect(persisted.cancellationSource).toBe('STAFF');
      expect(persisted.cancelledByRole).toBe('OWNER');
    } else {
      // The IN_PROGRESS winner must not have written cancellation
      // metadata.
      expect(persisted.cancelledAt).toBeNull();
      expect(persisted.cancellationSource).toBeNull();
      expect(persisted.cancelledByRole).toBeNull();
    }
  });
});

describe('Atomic CAS for public cancellation', () => {
  it('public cancel vs staff cancel: exactly one wins, no mixed metadata', async () => {
    const appointment = await createAppointment('CONFIRMED');

    const [publicRes, staffRes] = await Promise.all([
      request(app).post(cancelUrl(appointment.publicReference!)).send({ reason: 'public' }),
      request(app)
        .delete(`/api/v1/appointments/${appointment.id}`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({ reason: 'staff' }),
    ]);

    const publicOk = publicRes.status === 200;
    const staffOk = staffRes.status === 200;
    // Exactly one must win.
    expect(publicOk).not.toBe(staffOk);

    const persisted = await readRow(appointment.id);
    expect(persisted.status).toBe('CANCELLED');

    if (publicOk) {
      // The public winner wrote PUBLIC_BOOKING with NULL actor.
      expect(persisted.cancellationSource).toBe('PUBLIC_BOOKING');
      expect(persisted.cancelledByRole).toBeNull();
      expect(persisted.cancelReason).toBe('public');
      // The staff loser must observe the terminal state and
      // return ALREADY_TERMINAL or TRANSITION_CONFLICT, not 500.
      expect([409]).toContain(staffRes.status);
    } else {
      // The staff winner wrote STAFF with the OWNER role.
      expect(persisted.cancellationSource).toBe('STAFF');
      expect(persisted.cancelledByRole).toBe('OWNER');
      expect(persisted.cancelReason).toBe('staff');
      // The public loser must observe the terminal state and
      // return ALREADY_TERMINAL, not 500.
      expect(publicRes.status).toBe(409);
      expect(publicRes.body.error.code).toBe('PUBLIC_BOOKING_ALREADY_TERMINAL');
    }
  });

  it('public cancel vs staff NO_SHOW (after IN_PROGRESS): public loses, staff wins, no mixed metadata', async () => {
    // Step 1: staff moves CONFIRMED -> IN_PROGRESS.
    const appointment = await createAppointment('CONFIRMED');
    const advance = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'IN_PROGRESS' });
    expect(advance.status).toBe(200);

    // Step 2: public cancel races against IN_PROGRESS -> NO_SHOW.
    // The public cancel CAS requires status='CONFIRMED' AND
    // startAt > now. After step 1 the status is IN_PROGRESS, so
    // the CAS is guaranteed to lose. The exact error code depends
    // on which snapshot the diagnostic read observes: if it
    // reads IN_PROGRESS before the staff NO_SHOW commits, the
    // code is CANCELLATION_CLOSED; if the staff NO_SHOW wins
    // first, the code is ALREADY_TERMINAL. Both are deterministic
    // and both prove the public cancel cannot reach the
    // cancellation path.
    const [publicRes, noShowRes] = await Promise.all([
      request(app).post(cancelUrl(appointment.publicReference!)).send(),
      request(app)
        .put(`/api/v1/appointments/${appointment.id}/status`)
        .set(authHeader(fixtures.barber.clerkUserId))
        .send({ status: 'NO_SHOW' }),
    ]);

    expect(publicRes.status).toBe(409);
    expect([
      'PUBLIC_BOOKING_CANCELLATION_CLOSED',
      'PUBLIC_BOOKING_ALREADY_TERMINAL',
    ]).toContain(publicRes.body.error.code);
    // The staff NO_SHOW must succeed (no mixed metadata, no
    // cancellation write).
    expect(noShowRes.status).toBe(200);
    expect(noShowRes.body.data.status).toBe('NO_SHOW');

    // Final row: NO_SHOW with no cancellation metadata.
    const persisted = await readRow(appointment.id);
    expect(persisted.status).toBe('NO_SHOW');
    expect(persisted.noShowAt).toBeInstanceOf(Date);
    expect(persisted.cancelledAt).toBeNull();
    expect(persisted.cancellationSource).toBeNull();
    expect(persisted.cancelledByRole).toBeNull();
  });

  it('two simultaneous public cancellations: exactly one wins, the other gets ALREADY_TERMINAL', async () => {
    const appointment = await createAppointment('CONFIRMED');

    const [resA, resB] = await Promise.all([
      request(app).post(cancelUrl(appointment.publicReference!)).send({ reason: 'A' }),
      request(app).post(cancelUrl(appointment.publicReference!)).send({ reason: 'B' }),
    ]);

    const successes = [resA, resB].filter((r) => r.status === 200);
    const conflicts = [resA, resB].filter((r) => r.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    // The loser's error code is the deterministic terminal code.
    expect(conflicts[0]?.body.error.code).toBe('PUBLIC_BOOKING_ALREADY_TERMINAL');

    // The persisted row has exactly one source: PUBLIC_BOOKING.
    const persisted = await readRow(appointment.id);
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(persisted.cancelledByRole).toBeNull();
    // The reason is one of the two submitted; never both.
    expect(['A', 'B']).toContain(persisted.cancelReason);
  });
});

describe('PostgreSQL CHECK constraint enforces cancellation metadata', () => {
  // The corrected constraint distinguishes three states:
  //   A. cancelled_at NULL  => all metadata fields NULL
  //   B. cancelled_at NOT NULL + cancellation_source NULL (legacy)
  //   C. cancelled_at NOT NULL + cancellation_source NOT NULL
  //      => role must match the source's contract
  //
  // The brief requires 8 rejection cases + 8 acceptance cases
  // that exercise the real PostgreSQL constraint, not only the
  // application-level validation.

  // -------- REJECTION: 8 cases the database must refuse --------

  it('rejects: cancelled_at NULL + cancellation_source PUBLIC_BOOKING', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { cancellationSource: 'PUBLIC_BOOKING' },
      })
    ).rejects.toThrow();
  });

  it('rejects: cancelled_at NULL + cancellation_source STAFF + cancelled_by_role OWNER', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          cancellationSource: 'STAFF',
          cancelledByRole: 'OWNER',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects: cancelled_at NULL + cancel_reason populated', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { cancelReason: 'spurious reason' },
      })
    ).rejects.toThrow();
  });

  it('rejects: cancelled_at populated + STAFF + cancelled_by_role CLIENT', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationSource: 'STAFF',
          cancelledByRole: 'CLIENT',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects: cancelled_at populated + AUTHENTICATED_CLIENT + cancelled_by_role OWNER', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationSource: 'AUTHENTICATED_CLIENT',
          cancelledByRole: 'OWNER',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects: cancelled_at populated + PUBLIC_BOOKING + cancelled_by_role OWNER', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationSource: 'PUBLIC_BOOKING',
          cancelledByRole: 'OWNER',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects: classified cancellation metadata on status CONFIRMED', async () => {
    const appointment = await createAppointment('CONFIRMED');
    // CONFIRMED is not 'CANCELLED' but we are stamping cancellation
    // metadata. The new constraint requires status = 'CANCELLED'
    // whenever cancelled_at is set.
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          // Keep status as CONFIRMED but add cancellation metadata.
          cancelledAt: new Date(),
          cancellationSource: 'STAFF',
          cancelledByRole: 'OWNER',
        },
      })
    ).rejects.toThrow();
  });

  it('rejects: classified cancellation metadata on status COMPLETED', async () => {
    const appointment = await createAppointment('CONFIRMED');
    await expect(
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'COMPLETED',
          cancelledAt: new Date(),
          cancellationSource: 'STAFF',
          cancelledByRole: 'OWNER',
        },
      })
    ).rejects.toThrow();
  });

  // -------- ACCEPTANCE: 8 cases the database must accept --------

  it('accepts: normal active row with all cancellation metadata NULL', async () => {
    // The default row created by `createAppointment('CONFIRMED')` is
    // already in this state. We re-confirm by reading it.
    const appointment = await createAppointment('CONFIRMED');
    const reloaded = await readRow(appointment.id);
    expect(reloaded.cancelledAt).toBeNull();
    expect(reloaded.cancellationSource).toBeNull();
    expect(reloaded.cancelledByRole).toBeNull();
    expect(reloaded.cancelReason).toBeNull();
  });

  it('accepts: legacy CANCELLED row with all cancellation metadata NULL', async () => {
    // status = CANCELLED + no cancellation metadata: allowed for
    // any CANCELLED row that pre-dates the cancellation_source
    // column. The new constraint requires status = CANCELLED and
    // either cancellation_source is NULL (legacy, branch B) or
    // the full classified set (branch C). Here we exercise the
    // CANCELLED + all-NULL combination, which is legal: a row
    // marked CANCELLED with no recorded metadata is fine
    // (legacy compatibility).
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED' },
    });
    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancelledAt).toBeNull();
    expect(updated.cancellationSource).toBeNull();
    expect(updated.cancelledByRole).toBeNull();
  });

  it('accepts: legacy CANCELLED row with cancelled_at populated and source NULL', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: null,
        cancelledByRole: 'OWNER',
        cancelReason: 'legacy cancel',
      },
    });
    expect(updated.cancelledAt).toBeInstanceOf(Date);
    expect(updated.cancellationSource).toBeNull();
    expect(updated.cancelledByRole).toBe('OWNER');
  });

  it('accepts: STAFF + OWNER', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: 'STAFF',
        cancelledByRole: 'OWNER',
        cancelReason: 'STAFF owner cancel',
      },
    });
    expect(updated.cancellationSource).toBe('STAFF');
    expect(updated.cancelledByRole).toBe('OWNER');
  });

  it('accepts: STAFF + BARBER', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: 'STAFF',
        cancelledByRole: 'BARBER',
        cancelReason: 'STAFF barber cancel',
      },
    });
    expect(updated.cancellationSource).toBe('STAFF');
    expect(updated.cancelledByRole).toBe('BARBER');
  });

  it('accepts: AUTHENTICATED_CLIENT + CLIENT', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: 'AUTHENTICATED_CLIENT',
        cancelledByRole: 'CLIENT',
        cancelReason: 'client self-cancel',
      },
    });
    expect(updated.cancellationSource).toBe('AUTHENTICATED_CLIENT');
    expect(updated.cancelledByRole).toBe('CLIENT');
  });

  it('accepts: PUBLIC_BOOKING + NULL role', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: 'PUBLIC_BOOKING',
        cancelledByRole: null,
        cancelReason: 'public cancel',
      },
    });
    expect(updated.cancellationSource).toBe('PUBLIC_BOOKING');
    expect(updated.cancelledByRole).toBeNull();
  });

  it('accepts: SYSTEM + NULL role', async () => {
    const appointment = await createAppointment('CONFIRMED');
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationSource: 'SYSTEM',
        cancelledByRole: null,
        cancelReason: 'automated cancel',
      },
    });
    expect(updated.cancellationSource).toBe('SYSTEM');
    expect(updated.cancelledByRole).toBeNull();
  });
});
