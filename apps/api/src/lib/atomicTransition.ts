/**
 * Atomic, compare-and-swap helpers for the appointment state machine.
 *
 * Why this module exists
 * ---------------------
 * A plain `findUnique` + `update` pair, even inside a `prisma.$transaction`,
 * is a read-then-write that is not race-safe under the default
 * READ COMMITTED isolation level: two callers can both read the
 * same status, both validate a transition, and both commit. The
 * second writer silently overwrites the first.
 *
 * The helpers in this module use `updateMany` with the source
 * status as a WHERE predicate. PostgreSQL evaluates the predicate
 * and the SET atomically: exactly one writer matches the predicate
 * and gets `count = 1`; every other writer gets `count = 0`. The
 * second writer observes a deterministic conflict and surfaces a
 * stable `APPOINTMENT_TRANSITION_CONFLICT` 409.
 *
 * Application-layer rules (role checks, slug checks, future-start
 * cutoffs) still run BEFORE the CAS, but they no longer need to be
 * load-bearing for race safety. The DB is the source of truth for
 * "did this transition win?".
 */
import type { AppointmentStatus, Prisma } from '@prisma/client';
import { AppError } from './errors.js';
import { prisma } from './prisma.js';

export type AtomicDb = Prisma.TransactionClient | typeof prisma;

/**
 * Compare-and-swap a single appointment's status.
 *
 * Updates the row only when its current `status` matches
 * `fromStatus`. Returns the new row on success, or `null` if the
 * row was not in the expected source state (which means another
 * transition won the race).
 *
 * The caller is responsible for:
 *  - tenant scoping (run a getAppointment first or pass a where
 *    clause with the barbershop id),
 *  - role-based transition validation (the helper does NOT
 *    enforce the STATUS_TRANSITIONS map; callers must call
 *    `validateStatusTransition` before this helper).
 *
 * Cancellation writes (`cancelledAt`, `cancelledByRole`,
 * `cancellationSource`, `cancelReason`) are passed in `lifecycle`
 * and are applied in the same atomic statement.
 */
export async function compareAndSwapAppointmentStatus(input: {
  id: string;
  fromStatus: AppointmentStatus;
  toStatus: AppointmentStatus;
  lifecycle?: Record<string, unknown>;
  db?: AtomicDb;
}): Promise<
  | { count: 1; row: { id: string; status: AppointmentStatus } }
  | { count: 0; row: null }
> {
  const db = input.db ?? prisma;
  const result = await db.appointment.updateMany({
    where: { id: input.id, status: input.fromStatus },
    data: { status: input.toStatus, ...(input.lifecycle ?? {}) },
  });
  if (result.count === 0) {
    return { count: 0, row: null };
  }
  const row = await db.appointment.findUnique({
    where: { id: input.id },
    select: { id: true, status: true },
  });
  if (!row) {
    // The row was deleted between the CAS and the read. This is
    // extraordinarily unlikely (we just updated it) but the
    // contract must not lie: if we cannot prove the transition
    // happened, the caller should treat it as a conflict.
    return { count: 0, row: null };
  }
  return { count: 1, row };
}

/**
 * Strict 409 conflict thrown when a CAS does not match the
 * expected source status. Replaces the old behavior where a
 * repeated cancel returned a generic 400.
 */
export class AppointmentTransitionConflictError extends AppError {
  constructor(currentStatus: AppointmentStatus | null, attempted: AppointmentStatus) {
    const observed = currentStatus ?? 'unknown';
    super(
      409,
      'APPOINTMENT_TRANSITION_CONFLICT',
      `Cannot transition to '${attempted}': the row is no longer in a compatible state (current status: ${observed})`
    );
    this.name = 'AppointmentTransitionConflictError';
  }
}
