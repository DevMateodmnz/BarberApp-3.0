/**
 * Business hours validation
 *
 * Validates that appointment start/end times fall within a barbershop's
 * configured working hours, using the barbershop's local timezone.
 *
 * Timezone strategy:
 * - Barbershop.timezone is used to convert UTC appointment times to local time
 * - Day-of-week and time-of-day are extracted from the local time
 * - WorkingHours.openTime/closeTime are interpreted in the barbershop's timezone
 * - Relies on Node.js Intl.DateTimeFormat (no external tz library needed)
 *
 * Current assumption: appointments never cross midnight.
 * Service durations are short (15-120 min), so startAt and endAt are always
 * on the same calendar day in local time. If multi-day appointments are ever
 * supported, this validator must be extended.
 */
import { prisma } from './prisma.js';
import { BadRequestError } from './errors.js';
import {
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
} from './dateUtils.js';
import { resolveEffectiveScheduleForDate } from './effectiveSchedule.js';

/**
 * Converts "HH:mm" string to minutes since midnight for comparison.
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours! * 60 + minutes!;
}

/**
 * Extracts day-of-week (0=Sunday, 1=Monday, ...) and time-of-day in minutes
 * from a UTC Date, converted to the given IANA timezone.
 */
export function getLocalDayAndTime(
  utcDate: Date,
  timezone: string
): { dayOfWeek: number; minutesSinceMidnight: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = p.value;
    }
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = weekdayMap[partMap.weekday!] ?? 0;
  const hours = parseInt(partMap.hour!, 10);
  const minutes = parseInt(partMap.minute!, 10);
  const minutesSinceMidnight = hours * 60 + minutes;

  return { dayOfWeek, minutesSinceMidnight };
}

export interface BusinessHoursParams {
  barbershopId: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Validates that both startAt and endAt fall within the barbershop's
 * configured business hours for the appointment day.
 *
 * Throws BadRequestError if:
 * - The barbershop has no working hours configured for that day (closed)
 * - The appointment starts before opening time
 * - The appointment ends after closing time
 *
 * Tenant isolation: naturally enforced — WorkingHours is filtered by barbershopId.
 */
export async function validateBusinessHours(
  params: BusinessHoursParams
): Promise<void> {
  const { barbershopId, startAt, endAt } = params;

  // 1. Fetch barbershop timezone
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { timezone: true },
  });

  if (!barbershop) {
    throw new BadRequestError('Barbershop not found');
  }

  const timezone = barbershop.timezone;

  // 2. Get local date/day/time for startAt and endAt
  const startLocalDate = getLocalDateStringInTimeZone(timezone, startAt);
  const endLocalDate = getLocalDateStringInTimeZone(timezone, endAt);
  const startLocal = getLocalDayAndTime(startAt, timezone);
  const endLocal = getLocalDayAndTime(endAt, timezone);

  // 3. Appointments must remain within one local calendar date
  if (startLocalDate !== endLocalDate || startLocal.dayOfWeek !== endLocal.dayOfWeek) {
    throw new BadRequestError(
      'Appointments cannot span across multiple days'
    );
  }

  // 4. Resolve the effective schedule for the local date
  const effectiveSchedule = await resolveEffectiveScheduleForDate({
    barbershopId,
    localDate: startLocalDate,
  });

  if (effectiveSchedule.intervals.length === 0) {
    throw new BadRequestError(
      'Appointments cannot be booked on this day — the barbershop is closed'
    );
  }

  // 5. Validate the appointment fits entirely within one effective interval
  const matchingInterval = effectiveSchedule.intervals.find((interval) => {
    const openMinutes = timeToMinutes(interval.openTime);
    const closeMinutes = timeToMinutes(interval.closeTime);

    return (
      startLocal.minutesSinceMidnight >= openMinutes &&
      endLocal.minutesSinceMidnight <= closeMinutes
    );
  });

  if (matchingInterval) {
    return;
  }

  if (effectiveSchedule.intervals.length === 1) {
    const [interval] = effectiveSchedule.intervals;
    const openMinutes = timeToMinutes(interval!.openTime);
    const closeMinutes = timeToMinutes(interval!.closeTime);

    if (startLocal.minutesSinceMidnight < openMinutes) {
      throw new BadRequestError(
        `Appointment starts before opening hours (opens at ${interval!.openTime})`
      );
    }

    if (endLocal.minutesSinceMidnight > closeMinutes) {
      throw new BadRequestError(
        `Appointment ends after closing hours (closes at ${interval!.closeTime})`
      );
    }
  }

  const startLocalTime = getLocalTimeStringInTimeZone(timezone, startAt);
  const endLocalTime = getLocalTimeStringInTimeZone(timezone, endAt);

  throw new BadRequestError(
    `Appointment must fit within a single working interval for this date (${startLocalTime}-${endLocalTime})`
  );
}
