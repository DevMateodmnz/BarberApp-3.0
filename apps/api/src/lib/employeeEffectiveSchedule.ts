import type {
  EmployeeScheduleExceptionType,
  EmployeeScheduleMode,
  PrismaClient,
} from '@prisma/client';

import { resolveEffectiveScheduleForDate, type EffectiveScheduleResult } from './effectiveSchedule.js';
import { NotFoundError } from './errors.js';
import {
  intersectTimeIntervals,
  intervalContainsRange,
  normalizeTimeIntervals,
  stripIntervalInputPositions,
  type TimeInterval,
} from './scheduleIntervalMath.js';
import {
  normalizeScheduleExceptionIntervals,
  parseLocalTimeToMinutes,
} from './scheduleIntervals.js';
import { prisma } from './prisma.js';

export type EmployeeAvailabilityViolationCode =
  | 'BARBERSHOP_CLOSED'
  | 'EMPLOYEE_NOT_WORKING'
  | 'EMPLOYEE_TIME_OFF'
  | 'EMPLOYEE_SCHEDULE_CONFLICT';

export type EmployeeEffectiveScheduleSource =
  | 'weekly'
  | 'weekly_closed'
  | 'date_exception_closed'
  | 'date_exception_custom'
  | 'CUSTOM_WEEKLY'
  | 'EMPLOYEE_CUSTOM_HOURS'
  | 'EMPLOYEE_FULL_DAY_OFF'
  | 'EMPLOYEE_CLOSED_DAY'
  | 'INACTIVE_EMPLOYEE';

export interface EmployeeScheduleSnapshot {
  id: string;
  barbershopId: string;
  isActive: boolean;
  deletedAt: Date | null;
  scheduleMode: EmployeeScheduleMode;
}

export interface EmployeeScheduleExceptionSnapshot {
  type: EmployeeScheduleExceptionType;
  reason: string | null;
  intervals: TimeInterval[];
}

export interface EmployeeEffectiveScheduleResult {
  barbershopId: string;
  employeeId: string;
  localDate: string;
  timezone: string;
  scheduleMode: EmployeeScheduleMode;
  barbershopSource: EffectiveScheduleResult['source'];
  source: EmployeeEffectiveScheduleSource;
  intervals: TimeInterval[];
  availabilityViolationCode: EmployeeAvailabilityViolationCode | null;
  exception: EmployeeScheduleExceptionSnapshot | null;
}

type EmployeeEffectiveScheduleDb = Pick<
  PrismaClient,
  | 'barbershop'
  | 'workingHours'
  | 'barbershopScheduleException'
  | 'employee'
  | 'employeeWorkingInterval'
  | 'employeeScheduleException'
>;

function getUtcDayOfWeek(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function buildEmployeeEffectiveSchedule(input: {
  barbershopSchedule: EffectiveScheduleResult;
  employee: EmployeeScheduleSnapshot;
  weeklyIntervals: TimeInterval[];
  employeeException: EmployeeScheduleExceptionSnapshot | null;
}): EmployeeEffectiveScheduleResult {
  const { barbershopSchedule, employee, weeklyIntervals, employeeException } = input;

  if (employee.deletedAt || employee.barbershopId !== barbershopSchedule.barbershopId) {
    throw new NotFoundError('Employee');
  }

  if (!employee.isActive) {
    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: 'INACTIVE_EMPLOYEE',
      intervals: [],
      availabilityViolationCode: 'EMPLOYEE_NOT_WORKING',
      exception: employeeException,
    };
  }

  if (barbershopSchedule.intervals.length === 0) {
    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: barbershopSchedule.source,
      intervals: [],
      availabilityViolationCode: 'BARBERSHOP_CLOSED',
      exception: employeeException,
    };
  }

  if (employeeException?.type === 'FULL_DAY_OFF') {
    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: 'EMPLOYEE_FULL_DAY_OFF',
      intervals: [],
      availabilityViolationCode: 'EMPLOYEE_TIME_OFF',
      exception: employeeException,
    };
  }

  if (employeeException?.type === 'CUSTOM_HOURS') {
    const intervals = intersectTimeIntervals(
      employeeException.intervals,
      barbershopSchedule.intervals,
    );

    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: 'EMPLOYEE_CUSTOM_HOURS',
      intervals,
      availabilityViolationCode:
        intervals.length === 0 ? 'EMPLOYEE_SCHEDULE_CONFLICT' : null,
      exception: employeeException,
    };
  }

  if (employee.scheduleMode === 'INHERIT_BARBERSHOP') {
    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: barbershopSchedule.source,
      intervals: normalizeTimeIntervals(barbershopSchedule.intervals),
      availabilityViolationCode: null,
      exception: null,
    };
  }

  if (weeklyIntervals.length === 0) {
    return {
      barbershopId: barbershopSchedule.barbershopId,
      employeeId: employee.id,
      localDate: barbershopSchedule.localDate,
      timezone: barbershopSchedule.timezone,
      scheduleMode: employee.scheduleMode,
      barbershopSource: barbershopSchedule.source,
      source: 'EMPLOYEE_CLOSED_DAY',
      intervals: [],
      availabilityViolationCode: 'EMPLOYEE_NOT_WORKING',
      exception: null,
    };
  }

  const intervals = intersectTimeIntervals(weeklyIntervals, barbershopSchedule.intervals);

  return {
    barbershopId: barbershopSchedule.barbershopId,
    employeeId: employee.id,
    localDate: barbershopSchedule.localDate,
    timezone: barbershopSchedule.timezone,
    scheduleMode: employee.scheduleMode,
    barbershopSource: barbershopSchedule.source,
    source: intervals.length === 0 ? 'EMPLOYEE_CLOSED_DAY' : 'CUSTOM_WEEKLY',
    intervals,
    availabilityViolationCode:
      intervals.length === 0 ? 'EMPLOYEE_NOT_WORKING' : null,
    exception: null,
  };
}

export async function resolveEmployeeEffectiveScheduleForDate(
  input: {
    barbershopId: string;
    employeeId: string;
    localDate: string;
  },
  db: EmployeeEffectiveScheduleDb = prisma,
): Promise<EmployeeEffectiveScheduleResult> {
  const [barbershopSchedule, employee] = await Promise.all([
    resolveEffectiveScheduleForDate(
      {
        barbershopId: input.barbershopId,
        localDate: input.localDate,
      },
      db,
    ),
    db.employee.findUnique({
      where: { id: input.employeeId },
      select: {
        id: true,
        barbershopId: true,
        isActive: true,
        deletedAt: true,
        scheduleMode: true,
      },
    }),
  ]);

  if (!employee || employee.deletedAt || employee.barbershopId !== input.barbershopId) {
    throw new NotFoundError('Employee');
  }

  const dayOfWeek = getUtcDayOfWeek(input.localDate);

  const [weeklyIntervals, employeeException] = await Promise.all([
    employee.scheduleMode === 'CUSTOM'
      ? db.employeeWorkingInterval.findMany({
          where: {
            employeeId: input.employeeId,
            barbershopId: input.barbershopId,
            dayOfWeek,
          },
          select: {
            openTime: true,
            closeTime: true,
          },
          orderBy: {
            openTime: 'asc',
          },
        })
      : Promise.resolve([]),
    db.employeeScheduleException.findUnique({
      where: {
        employeeId_localDate: {
          employeeId: input.employeeId,
          localDate: input.localDate,
        },
      },
      include: {
        intervals: {
          orderBy: {
            position: 'asc',
          },
        },
      },
    }),
  ]);

  return buildEmployeeEffectiveSchedule({
    barbershopSchedule,
    employee,
    weeklyIntervals,
    employeeException: employeeException
      ? {
          type: employeeException.type,
          reason: employeeException.reason,
          intervals:
            employeeException.type === 'CUSTOM_HOURS'
              ? stripIntervalInputPositions(
                  normalizeScheduleExceptionIntervals(employeeException.intervals),
                )
              : [],
        }
      : null,
  });
}

export function appointmentFitsEmployeeSchedule(
  schedule: EmployeeEffectiveScheduleResult,
  startTime: string,
  endTime: string,
): boolean {
  return intervalContainsRange(schedule.intervals, startTime, endTime);
}

export function validateIntervalsWithinBarbershopSchedule(input: {
  intervals: readonly TimeInterval[];
  barbershopIntervals: readonly TimeInterval[];
}): void {
  const { intervals, barbershopIntervals } = input;

  for (const interval of intervals) {
    if (!intervalContainsRange(barbershopIntervals, interval.openTime, interval.closeTime)) {
      throw new Error('Interval must remain within the barbershop working schedule');
    }
  }
}

export function mapAppointmentOutsideScheduleReason(
  schedule: EmployeeEffectiveScheduleResult,
  startTime: string,
  endTime: string,
): EmployeeAvailabilityViolationCode | null {
  if (appointmentFitsEmployeeSchedule(schedule, startTime, endTime)) {
    return null;
  }

  if (schedule.availabilityViolationCode) {
    return schedule.availabilityViolationCode;
  }

  if (
    schedule.source === 'weekly' ||
    schedule.source === 'date_exception_custom' ||
    schedule.source === 'EMPLOYEE_CUSTOM_HOURS' ||
    schedule.source === 'CUSTOM_WEEKLY'
  ) {
    return 'EMPLOYEE_SCHEDULE_CONFLICT';
  }

  if (schedule.source === 'EMPLOYEE_FULL_DAY_OFF') {
    return 'EMPLOYEE_TIME_OFF';
  }

  return 'EMPLOYEE_NOT_WORKING';
}

export function buildTimeInterval(openTime: string, closeTime: string): TimeInterval {
  if (parseLocalTimeToMinutes(openTime) >= parseLocalTimeToMinutes(closeTime)) {
    throw new Error('Interval start must be before interval end');
  }

  return { openTime, closeTime };
}

export { buildEmployeeEffectiveSchedule };
