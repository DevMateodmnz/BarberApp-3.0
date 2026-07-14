/**
 * Appointment lifecycle helper.
 *
 * Centralizes the translation of a status change into the matching
 * persistence payload (timestamp + actor + cancellation source). All
 * callers MUST go through this module so that no-show analytics,
 * customer history queries, and cancellation audits remain correct
 * across the entire API surface.
 *
 * Why a single helper:
 * - Avoids drift between staff transitions, public cancel, and any
 *   future entrypoint (CLI, future mobile background sync).
 * - Keeps the public cancel path and the staff cancel path using the
 *   exact same rules for `cancelledByRole`, `cancellationSource`, and
 *   `cancelReason`.
 * - Makes the lifecycle explicit and testable without Prisma.
 */
import type {
  AppointmentCancellationSource,
  AppointmentStatus,
  UserRole,
} from '@prisma/client';

export const CANCEL_REASON_MAX_LENGTH = 500;

/**
 * Statuses that mark the end of an appointment's lifecycle.
 * Used for tenant-friendly errors and idempotent retries.
 */
export const TERMINAL_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

export function isTerminalStatus(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Statuses that produce a recorded timestamp when transitioned into.
 * PENDING is excluded (re-open leaves the lifecycle history alone).
 * CANCELLED is excluded because cancel records more than a timestamp
 * (cancelledByRole + cancellationSource + cancelReason) and goes
 * through {@link buildLifecycleUpdateForCancel}.
 */
export function isRecordedTransition(status: AppointmentStatus): boolean {
  return (
    status === 'CONFIRMED' ||
    status === 'IN_PROGRESS' ||
    status === 'COMPLETED' ||
    status === 'NO_SHOW'
  );
}

/**
 * Builds the partial Prisma update payload that records a non-cancel
 * status transition. Each target status maps to exactly one timestamp
 * column; nothing else is written so the helper stays free of
 * authorization concerns (callers must validate the transition first).
 */
export function buildLifecycleUpdateForStatus(
  status: AppointmentStatus,
  _actorRole: UserRole,
  now: Date = new Date()
): Partial<{
  startedAt: Date;
  confirmedAt: Date;
  completedAt: Date;
  noShowAt: Date;
}> {
  switch (status) {
    case 'CONFIRMED':
      return { confirmedAt: now };
    case 'IN_PROGRESS':
      return { startedAt: now };
    case 'COMPLETED':
      return { completedAt: now };
    case 'NO_SHOW':
      return { noShowAt: now };
    case 'PENDING':
    case 'CANCELLED':
      return {};
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled AppointmentStatus: ${exhaustive as string}`);
    }
  }
}

export interface BuildLifecycleUpdateForCancelInput {
  /**
   * The authenticated actor's role. Must be null when source is
   * `PUBLIC_BOOKING` or `SYSTEM` because those flows have no
   * UserRole identity. Must be a real UserRole for staff and
   * authenticated-client flows.
   */
  actorRole: UserRole | null;
  /**
   * Where the cancellation originated. Decoupled from actorRole so
   * that anonymous public bookings and future automated jobs do
   * not require a fake PUBLIC role in the UserRole enum.
   */
  source: AppointmentCancellationSource;
  now?: Date;
  reason?: string | null;
}

/**
 * Builds the partial Prisma update payload for a cancellation.
 * Always records the actor role (nullable for anonymous/system),
 * the source, the timestamp, and a normalized reason. A missing or
 * empty reason is stored as NULL to keep the column meaningful for
 * analytics.
 *
 * Row invariant (enforced by the callers, documented here):
 *   - source === 'STAFF'             => actorRole must be OWNER or BARBER
 *   - source === 'AUTHENTICATED_CLIENT' => actorRole === 'CLIENT'
 *   - source === 'PUBLIC_BOOKING'    => actorRole must be null
 *   - source === 'SYSTEM'            => actorRole must be null
 */
export function buildLifecycleUpdateForCancel(
  input: BuildLifecycleUpdateForCancelInput
): {
  cancelledAt: Date;
  cancelledByRole: UserRole | null;
  cancellationSource: AppointmentCancellationSource;
  cancelReason: string | null;
} {
  return {
    cancelledAt: input.now ?? new Date(),
    cancelledByRole: input.actorRole,
    cancellationSource: input.source,
    cancelReason: normalizeCancelReason(input.reason),
  };
}

function normalizeCancelReason(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, CANCEL_REASON_MAX_LENGTH);
}
