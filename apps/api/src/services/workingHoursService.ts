/**
 * Working hours business logic service
 *
 * Provides OWNER-managed view and update of barbershop working hours.
 * Uses upsert per day on the @@unique([barbershopId, dayOfWeek]) constraint
 * — idempotent, no duplicate rows.
 *
 * Day-of-week convention: 0=Sunday, 1=Monday, ..., 6=Saturday
 * Time format: "HH:mm" 24h in the barbershop's local timezone.
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { timeToMinutes } from '../lib/businessHours.js';
import type { WorkingHoursDayInput } from '../schemas/workingHours.js';

/**
 * Validates that the barbershop exists and is owned by userId.
 * Throws NotFoundError in both cases (don't leak cross-tenant existence).
 */
async function validateBarbershopOwnership(
  barbershopId: string,
  userId: string
): Promise<void> {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { ownerId: true },
  });

  if (!barbershop || barbershop.ownerId !== userId) {
    throw new NotFoundError('Barbershop');
  }
}

/**
 * Validates a single working hours day entry.
 * - Closed days (isActive: false): openTime/closeTime not required
 * - Open days (isActive not explicitly false): openTime and closeTime required, open < close
 */
function validateDayEntry(day: WorkingHoursDayInput): void {
  const isClosed = day.isActive === false;

  if (!isClosed) {
    // Open day: both times required
    if (!day.openTime || !day.closeTime) {
      throw new BadRequestError(
        `openTime and closeTime are required for dayOfWeek ${day.dayOfWeek} when not closed`
      );
    }

    // Validate openTime < closeTime
    const openMin = timeToMinutes(day.openTime);
    const closeMin = timeToMinutes(day.closeTime);

    if (openMin >= closeMin) {
      throw new BadRequestError(
        `openTime (${day.openTime}) must be before closeTime (${day.closeTime}) for dayOfWeek ${day.dayOfWeek}`
      );
    }
  }
}

/**
 * Returns working hours for a barbershop, ordered by dayOfWeek ASC.
 *
 * Defense-in-depth: validates barbershop ownership even though
 * requireBarbershopAccess middleware already enforces it.
 */
export async function getWorkingHours(
  barbershopId: string,
  userId: string
) {
  await validateBarbershopOwnership(barbershopId, userId);

  return prisma.workingHours.findMany({
    where: { barbershopId },
    select: {
      id: true,
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
      isActive: true,
    },
    orderBy: { dayOfWeek: 'asc' },
  });
}

/**
 * Updates working hours for a barbershop. Replaces the schedule
 * for the provided days using upsert (idempotent).
 *
 * Validation order:
 * 1. Barbershop ownership (fail fast)
 * 2. Duplicate dayOfWeek (handled by Zod schema)
 * 3. Per-day field validation (openTime < closeTime, etc.)
 * 4. Upsert all days in a transaction
 */
export async function updateWorkingHours(
  barbershopId: string,
  userId: string,
  days: WorkingHoursDayInput[]
) {
  // 1. Validate ownership
  await validateBarbershopOwnership(barbershopId, userId);

  // 2. Validate each day entry
  for (const day of days) {
    validateDayEntry(day);
  }

  // 3. Upsert all days in a transaction
  // For closed days (isActive: false) without times, use existing values
  // or fall back to "00:00" if no existing row.

  // First, fetch existing rows for the days being updated (to preserve times on closed days)
  const dayOfWeeks = days.map((d) => d.dayOfWeek);
  const existingRows = await prisma.workingHours.findMany({
    where: {
      barbershopId,
      dayOfWeek: { in: dayOfWeeks },
    },
    select: { dayOfWeek: true, openTime: true, closeTime: true },
  });

  const existingMap = new Map(
    existingRows.map((r) => [r.dayOfWeek, { openTime: r.openTime, closeTime: r.closeTime }])
  );

  const upsertPromises = days.map((day) => {
    const isClosed = day.isActive === false;
    const existing = existingMap.get(day.dayOfWeek);

    // For open days: use provided times
    // For closed days: keep existing times if available, otherwise use "00:00"
    const openTime = isClosed
      ? (existing?.openTime ?? '00:00')
      : day.openTime!;
    const closeTime = isClosed
      ? (existing?.closeTime ?? '00:00')
      : day.closeTime!;
    const isActive = !isClosed; // true if not explicitly false

    return prisma.workingHours.upsert({
      where: {
        barbershopId_dayOfWeek: {
          barbershopId,
          dayOfWeek: day.dayOfWeek,
        },
      },
      create: {
        barbershopId,
        dayOfWeek: day.dayOfWeek,
        openTime,
        closeTime,
        isActive,
      },
      update: {
        openTime,
        closeTime,
        isActive,
      },
    });
  });

  await prisma.$transaction(upsertPromises);

  // 4. Return updated working hours (ordered)
  return prisma.workingHours.findMany({
    where: { barbershopId },
    select: {
      id: true,
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
      isActive: true,
    },
    orderBy: { dayOfWeek: 'asc' },
  });
}
