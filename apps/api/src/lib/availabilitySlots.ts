import type { AppointmentStatus, PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';
import { AppError } from './errors.js';
import { roundMinutesUpToSlotBoundary } from './appointmentScheduling.js';
import {
  addDaysToDateString,
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
  tryLocalDateTimeToUtc,
} from './dateUtils.js';
import { timeToMinutes } from './businessHours.js';
import { resolveEmployeeEffectiveScheduleForDate } from './employeeEffectiveSchedule.js';
import { buildBlockingAppointmentWhereInput } from './appointmentBlocking.js';

type AvailabilityDatabase = Pick<PrismaClient, 'appointment'>;

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
  localStartTime: string;
  localEndTime: string;
}

export interface BuildAvailabilitySlotsInput {
  barbershopId: string;
  employeeId: string;
  localDate: string;
  timezone: string;
  serviceDurationMinutes: number;
  slotIntervalMinutes: number;
  blockingStatuses: AppointmentStatus[];
  now?: Date;
  minimumNoticeMinutes?: number;
  maximumBookingHorizonDays?: number;
  excludeAppointmentId?: string;
}

function candidateSlotsOverlap(
  candidateStartAt: Date,
  candidateEndAt: Date,
  appointments: Array<{ startAt: Date; endAt: Date }>
): boolean {
  return appointments.some(
    (appointment) =>
      appointment.startAt < candidateEndAt && appointment.endAt > candidateStartAt
  );
}

export function validateAvailabilityDateRange(
  localDate: string,
  timezone: string,
  now: Date,
  options: {
    allowTodayOnlyOrFuture: boolean;
    maximumBookingHorizonDays?: number;
    invalidPastCode: string;
    invalidPastMessage: string;
    invalidHorizonCode?: string;
    invalidHorizonMessage?: string;
  }
): void {
  const todayLocalDate = getLocalDateStringInTimeZone(timezone, now);

  if (options.allowTodayOnlyOrFuture && localDate < todayLocalDate) {
    throw new AppError(400, options.invalidPastCode, options.invalidPastMessage);
  }

  if (options.maximumBookingHorizonDays !== undefined) {
    const finalAllowedDate = addDaysToDateString(
      todayLocalDate,
      options.maximumBookingHorizonDays
    );

    if (localDate > finalAllowedDate) {
      throw new AppError(
        400,
        options.invalidHorizonCode ?? 'INVALID_APPOINTMENT_DATE',
        options.invalidHorizonMessage ??
          'Availability cannot be requested beyond the booking horizon'
      );
    }
  }
}

export async function buildAvailabilitySlots(
  input: BuildAvailabilitySlotsInput,
  db: AvailabilityDatabase = prisma
): Promise<AvailabilitySlot[]> {
  const {
    barbershopId,
    employeeId,
    localDate,
    timezone,
    serviceDurationMinutes,
    slotIntervalMinutes,
  } = input;

  const now = input.now ?? new Date();
  const effectiveSchedule = await resolveEmployeeEffectiveScheduleForDate({
    barbershopId,
    employeeId,
    localDate,
  });

  if (effectiveSchedule.intervals.length === 0) {
    return [];
  }

  const dayStart = tryLocalDateTimeToUtc(localDate, '00:00', timezone);
  const nextDayStart = tryLocalDateTimeToUtc(
    addDaysToDateString(localDate, 1),
    '00:00',
    timezone
  );

  if (!dayStart || !nextDayStart) {
    return [];
  }

  const blockingAppointments = await db.appointment.findMany({
    where: {
      id: input.excludeAppointmentId
        ? { not: input.excludeAppointmentId }
        : undefined,
      employeeId,
      ...buildBlockingAppointmentWhereInput(now),
      startAt: { lt: nextDayStart },
      endAt: { gt: dayStart },
    },
    select: {
      startAt: true,
      endAt: true,
    },
    orderBy: { startAt: 'asc' },
  });

  const minimumNoticeMinutes = input.minimumNoticeMinutes ?? 0;
  const minimumBookableAt = new Date(
    now.getTime() + (minimumNoticeMinutes * 60_000)
  );
  const slots: AvailabilitySlot[] = [];

  for (const interval of effectiveSchedule.intervals) {
    const openMinutes = timeToMinutes(interval.openTime);
    const closeMinutes = timeToMinutes(interval.closeTime);

    for (
      let startMinutes = roundMinutesUpToSlotBoundary(
        openMinutes,
        slotIntervalMinutes
      );
      startMinutes < closeMinutes;
      startMinutes += slotIntervalMinutes
    ) {
      const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
      const candidateStartAt = tryLocalDateTimeToUtc(
        localDate,
        startTime,
        timezone
      );

      if (!candidateStartAt) {
        continue;
      }

      const tooSoon =
        minimumNoticeMinutes === 0
          ? candidateStartAt.getTime() <= now.getTime()
          : candidateStartAt.getTime() < minimumBookableAt.getTime();
      if (tooSoon) {
        continue;
      }

      const candidateEndAt = new Date(
        candidateStartAt.getTime() + (serviceDurationMinutes * 60_000)
      );

      const candidateEndLocalDate = getLocalDateStringInTimeZone(
        timezone,
        candidateEndAt
      );
      if (candidateEndLocalDate !== localDate) {
        continue;
      }

      const candidateEndLocalTime = getLocalTimeStringInTimeZone(
        timezone,
        candidateEndAt
      );
      if (timeToMinutes(candidateEndLocalTime) > closeMinutes) {
        continue;
      }

      if (
        candidateSlotsOverlap(
          candidateStartAt,
          candidateEndAt,
          blockingAppointments
        )
      ) {
        continue;
      }

      slots.push({
        startAt: candidateStartAt.toISOString(),
        endAt: candidateEndAt.toISOString(),
        localStartTime: getLocalTimeStringInTimeZone(timezone, candidateStartAt),
        localEndTime: candidateEndLocalTime,
      });
    }
  }

  return slots;
}
