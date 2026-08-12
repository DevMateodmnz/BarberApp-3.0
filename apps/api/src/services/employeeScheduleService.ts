import type {
  EmployeeScheduleMode,
  Prisma,
  UserRole,
} from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import {
  addDaysToDateString,
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
} from '../lib/dateUtils.js';
import { resolveEffectiveScheduleForDate } from '../lib/effectiveSchedule.js';
import {
  mapAppointmentOutsideScheduleReason,
  resolveEmployeeEffectiveScheduleForDate,
  type EmployeeAvailabilityViolationCode,
  type EmployeeEffectiveScheduleSource,
} from '../lib/employeeEffectiveSchedule.js';
import { normalizeScheduleExceptionIntervals } from '../lib/scheduleIntervals.js';
import { validateEmployeeInBarbershop } from './employeeService.js';
import type {
  UpdateEmployeeScheduleInput,
  UpsertEmployeeScheduleExceptionInput,
} from '../schemas/employeeSchedule.js';
import { timeToMinutes } from '../lib/businessHours.js';

const EMPLOYEE_SCHEDULE_READ_SELECT = {
  id: true,
  barbershopId: true,
  userId: true,
  isActive: true,
  scheduleMode: true,
  updatedAt: true,
  deletedAt: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
  barbershop: {
    select: {
      id: true,
      ownerId: true,
      timezone: true,
      deletedAt: true,
      name: true,
    },
  },
} satisfies Prisma.EmployeeSelect;

type EmployeeScheduleReadRecord = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_SCHEDULE_READ_SELECT;
}>;

type EmployeeScheduleMutationDb = Prisma.TransactionClient | typeof prisma;

type ScheduleConflictReasonCode = Exclude<
  EmployeeAvailabilityViolationCode,
  'EMPLOYEE_SCHEDULE_CONFLICT'
> | 'OUTSIDE_CUSTOM_HOURS';

export interface EmployeeScheduleConflictSummary {
  appointmentId: string;
  startAt: string;
  endAt: string;
  customerDisplayName: string;
  serviceName: string;
  reasonCode: ScheduleConflictReasonCode;
}

export interface EmployeeScheduleResponse {
  employee: {
    id: string;
    displayName: string;
    isActive: boolean;
  };
  timezone: string;
  scheduleMode: EmployeeScheduleMode;
  expectedUpdatedAt: string;
  weeklyIntervals: Array<{
    dayOfWeek: number;
    start: string;
    end: string;
  }>;
  barbershopWeeklyIntervals: Array<{
    dayOfWeek: number;
    start: string;
    end: string;
  }>;
  upcomingExceptions: Array<{
    localDate: string;
    type: 'FULL_DAY_OFF' | 'CUSTOM_HOURS';
    reason: string | null;
    intervals: Array<{
      start: string;
      end: string;
    }>;
  }>;
  effectivePreview: Array<{
    localDate: string;
    source: EmployeeEffectiveScheduleSource;
    intervals: Array<{
      start: string;
      end: string;
    }>;
  }>;
  conflictingFutureAppointmentsCount: number;
  conflictingFutureAppointments: EmployeeScheduleConflictSummary[];
}

function toDisplayName(input: { name: string | null; email: string }): string {
  return input.name?.trim() || input.email.trim();
}

function normalizeReason(reason?: string | null): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function assertExpectedUpdatedAt(
  expectedUpdatedAt: string | undefined,
  currentUpdatedAt: Date,
): void {
  if (!expectedUpdatedAt) {
    return;
  }

  if (currentUpdatedAt.toISOString() !== expectedUpdatedAt) {
    throw new AppError(
      409,
      'EMPLOYEE_SCHEDULE_VERSION_CONFLICT',
      'The employee schedule was changed by another operation. Refresh and try again.',
    );
  }
}

async function loadEmployeeScheduleForOwner(
  barbershopId: string,
  employeeId: string,
  ownerUserId: string,
  db: EmployeeScheduleMutationDb = prisma,
): Promise<EmployeeScheduleReadRecord> {
  const employee = await db.employee.findFirst({
    where: {
      id: employeeId,
      barbershopId,
      deletedAt: null,
      barbershop: {
        id: barbershopId,
        ownerId: ownerUserId,
        deletedAt: null,
      },
    },
    select: EMPLOYEE_SCHEDULE_READ_SELECT,
  });

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  return employee;
}

async function loadEmployeeScheduleForRead(input: {
  barbershopId: string;
  employeeId: string;
  userId: string;
  role: UserRole;
  authenticatedEmployeeId?: string;
  db?: EmployeeScheduleMutationDb;
}): Promise<EmployeeScheduleReadRecord> {
  const db = input.db ?? prisma;

  if (input.role === 'OWNER') {
    return loadEmployeeScheduleForOwner(
      input.barbershopId,
      input.employeeId,
      input.userId,
      db,
    );
  }

  if (input.role === 'BARBER') {
    if (!input.authenticatedEmployeeId || input.authenticatedEmployeeId !== input.employeeId) {
      throw new NotFoundError('Employee');
    }

    const employee = await db.employee.findFirst({
      where: {
        id: input.employeeId,
        barbershopId: input.barbershopId,
        userId: input.userId,
        deletedAt: null,
      },
      select: EMPLOYEE_SCHEDULE_READ_SELECT,
    });

    if (!employee) {
      throw new NotFoundError('Employee');
    }

    return employee;
  }

  throw new ForbiddenError('Clients cannot access employee schedules');
}

async function loadBarbershopWeeklyIntervals(
  barbershopId: string,
  db: EmployeeScheduleMutationDb = prisma,
): Promise<Array<{ dayOfWeek: number; start: string; end: string }>> {
  const rows = await db.workingHours.findMany({
    where: {
      barbershopId,
      isActive: true,
    },
    select: {
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
    },
    orderBy: {
      dayOfWeek: 'asc',
    },
  });

  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    start: row.openTime,
    end: row.closeTime,
  }));
}

async function loadEmployeeWeeklyIntervals(
  employeeId: string,
  barbershopId: string,
  db: EmployeeScheduleMutationDb = prisma,
): Promise<Array<{ dayOfWeek: number; start: string; end: string }>> {
  const rows = await db.employeeWorkingInterval.findMany({
    where: {
      employeeId,
      barbershopId,
    },
    select: {
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
    },
    orderBy: [
      { dayOfWeek: 'asc' },
      { openTime: 'asc' },
    ],
  });

  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    start: row.openTime,
    end: row.closeTime,
  }));
}

async function loadUpcomingExceptions(input: {
  employeeId: string;
  barbershopId: string;
  todayLocalDate: string;
  includeReason: boolean;
  db?: EmployeeScheduleMutationDb;
}) {
  const db = input.db ?? prisma;
  const exceptions = await db.employeeScheduleException.findMany({
    where: {
      employeeId: input.employeeId,
      barbershopId: input.barbershopId,
      localDate: {
        gte: input.todayLocalDate,
      },
    },
    include: {
      intervals: {
        orderBy: {
          position: 'asc',
        },
      },
    },
    orderBy: {
      localDate: 'asc',
    },
    take: 30,
  });

  return exceptions.map((exception) => ({
    localDate: exception.localDate,
    type: exception.type,
    reason: input.includeReason ? exception.reason : null,
    intervals:
      exception.type === 'CUSTOM_HOURS'
        ? normalizeScheduleExceptionIntervals(exception.intervals).map((interval) => ({
            start: interval.openTime,
            end: interval.closeTime,
          }))
        : [],
  }));
}

async function buildConflictSummaries(input: {
  employee: EmployeeScheduleReadRecord;
  now: Date;
  db?: EmployeeScheduleMutationDb;
}): Promise<EmployeeScheduleConflictSummary[]> {
  const db = input.db ?? prisma;
  const futureAppointments = await db.appointment.findMany({
    where: {
      employeeId: input.employee.id,
      barbershopId: input.employee.barbershopId,
      deletedAt: null,
      status: {
        not: 'CANCELLED',
      },
      startAt: {
        gt: input.now,
      },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      clientName: true,
      serviceName: true,
    },
    orderBy: {
      startAt: 'asc',
    },
    take: 50,
  });

  if (futureAppointments.length === 0) {
    return [];
  }

  const scheduleByDate = new Map<string, Awaited<ReturnType<typeof resolveEmployeeEffectiveScheduleForDate>>>();

  for (const appointment of futureAppointments) {
    const localDate = getLocalDateStringInTimeZone(input.employee.barbershop.timezone, appointment.startAt);
    if (!scheduleByDate.has(localDate)) {
      scheduleByDate.set(
        localDate,
        await resolveEmployeeEffectiveScheduleForDate(
          {
            barbershopId: input.employee.barbershopId,
            employeeId: input.employee.id,
            localDate,
          },
          db,
        ),
      );
    }
  }

  const conflicts: EmployeeScheduleConflictSummary[] = [];

  for (const appointment of futureAppointments) {
    const localDate = getLocalDateStringInTimeZone(input.employee.barbershop.timezone, appointment.startAt);
    const schedule = scheduleByDate.get(localDate)!;
    const reason = mapAppointmentOutsideScheduleReason(
      schedule,
      getLocalTimeStringInTimeZone(input.employee.barbershop.timezone, appointment.startAt),
      getLocalTimeStringInTimeZone(input.employee.barbershop.timezone, appointment.endAt),
    );

    if (!reason) {
      continue;
    }

    conflicts.push({
      appointmentId: appointment.id,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      customerDisplayName: appointment.clientName,
      serviceName: appointment.serviceName,
      reasonCode:
        reason === 'EMPLOYEE_SCHEDULE_CONFLICT' ? 'OUTSIDE_CUSTOM_HOURS' : reason,
    });
  }

  return conflicts;
}

async function buildEffectivePreview(input: {
  employee: EmployeeScheduleReadRecord;
  todayLocalDate: string;
  db?: EmployeeScheduleMutationDb;
}) {
  const db = input.db ?? prisma;
  const previewDates = Array.from({ length: 7 }, (_, offset) =>
    addDaysToDateString(input.todayLocalDate, offset),
  );

  const preview = await Promise.all(
    previewDates.map((localDate) =>
      resolveEmployeeEffectiveScheduleForDate(
        {
          barbershopId: input.employee.barbershopId,
          employeeId: input.employee.id,
          localDate,
        },
        db,
      ),
    ),
  );

  return preview.map((day) => ({
    localDate: day.localDate,
    source: day.source,
    intervals: day.intervals.map((interval) => ({
      start: interval.openTime,
      end: interval.closeTime,
    })),
  }));
}

async function buildScheduleResponse(input: {
  employee: EmployeeScheduleReadRecord;
  includeReason: boolean;
  now?: Date;
  db?: EmployeeScheduleMutationDb;
}): Promise<EmployeeScheduleResponse> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  const todayLocalDate = getLocalDateStringInTimeZone(input.employee.barbershop.timezone, now);
  const [weeklyIntervals, barbershopWeeklyIntervals, upcomingExceptions, effectivePreview, conflicts] =
    await Promise.all([
      loadEmployeeWeeklyIntervals(input.employee.id, input.employee.barbershopId, db),
      loadBarbershopWeeklyIntervals(input.employee.barbershopId, db),
      loadUpcomingExceptions({
        employeeId: input.employee.id,
        barbershopId: input.employee.barbershopId,
        todayLocalDate,
        includeReason: input.includeReason,
        db,
      }),
      buildEffectivePreview({ employee: input.employee, todayLocalDate, db }),
      buildConflictSummaries({ employee: input.employee, now, db }),
    ]);

  return {
    employee: {
      id: input.employee.id,
      displayName: toDisplayName(input.employee.user),
      isActive: input.employee.isActive,
    },
    timezone: input.employee.barbershop.timezone,
    scheduleMode: input.employee.scheduleMode,
    expectedUpdatedAt: input.employee.updatedAt.toISOString(),
    weeklyIntervals,
    barbershopWeeklyIntervals,
    upcomingExceptions,
    effectivePreview,
    conflictingFutureAppointmentsCount: conflicts.length,
    conflictingFutureAppointments: conflicts,
  };
}

async function validateWeeklyIntervalsWithinBarbershop(
  barbershopId: string,
  weeklyIntervals: UpdateEmployeeScheduleInput['weeklyIntervals'],
  db: EmployeeScheduleMutationDb = prisma,
): Promise<void> {
  if (weeklyIntervals.length === 0) {
    return;
  }

  const days = [...new Set(weeklyIntervals.map((interval) => interval.dayOfWeek))];
  const workingHours = await db.workingHours.findMany({
    where: {
      barbershopId,
      dayOfWeek: { in: days },
    },
    select: {
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
      isActive: true,
    },
  });
  const byDay = new Map(workingHours.map((row) => [row.dayOfWeek, row]));

  for (const interval of weeklyIntervals) {
    const daySchedule = byDay.get(interval.dayOfWeek);
    if (!daySchedule || !daySchedule.isActive) {
      throw new AppError(
        400,
        'EMPLOYEE_SCHEDULE_OUTSIDE_BARBERSHOP_HOURS',
        'Employee custom hours must remain within the barbershop weekly schedule',
      );
    }

    if (interval.start < daySchedule.openTime || interval.end > daySchedule.closeTime) {
      throw new AppError(
        400,
        'EMPLOYEE_SCHEDULE_OUTSIDE_BARBERSHOP_HOURS',
        'Employee custom hours must remain within the barbershop weekly schedule',
      );
    }
  }
}

async function validateExceptionIntervalsWithinBarbershop(input: {
  barbershopId: string;
  localDate: string;
  intervals: Array<{ start: string; end: string }>;
  db?: EmployeeScheduleMutationDb;
}): Promise<void> {
  const db = input.db ?? prisma;
  const barbershopSchedule = await resolveEffectiveScheduleForDate(
    {
      barbershopId: input.barbershopId,
      localDate: input.localDate,
    },
    db,
  );

  if (barbershopSchedule.intervals.length === 0) {
    throw new AppError(
      400,
      'EMPLOYEE_SCHEDULE_OUTSIDE_BARBERSHOP_HOURS',
      'Employee special hours must remain within the barbershop schedule for that date',
    );
  }

  for (const interval of input.intervals) {
    const matches = barbershopSchedule.intervals.some(
      (shopInterval) => interval.start >= shopInterval.openTime && interval.end <= shopInterval.closeTime,
    );

    if (!matches) {
      throw new AppError(
        400,
        'EMPLOYEE_SCHEDULE_OUTSIDE_BARBERSHOP_HOURS',
        'Employee special hours must remain within the barbershop schedule for that date',
      );
    }
  }
}

export async function getEmployeeSchedule(input: {
  barbershopId: string;
  employeeId: string;
  userId: string;
  userRole: UserRole;
  authenticatedEmployeeId?: string;
  now?: Date;
}): Promise<EmployeeScheduleResponse> {
  const employee = await loadEmployeeScheduleForRead({
    barbershopId: input.barbershopId,
    employeeId: input.employeeId,
    userId: input.userId,
    role: input.userRole,
    authenticatedEmployeeId: input.authenticatedEmployeeId,
  });

  return buildScheduleResponse({
    employee,
    includeReason: input.userRole === 'OWNER',
    now: input.now,
  });
}

export async function updateEmployeeSchedule(input: {
  barbershopId: string;
  employeeId: string;
  body: UpdateEmployeeScheduleInput;
  ownerUserId: string;
  now?: Date;
}): Promise<EmployeeScheduleResponse> {
  const employee = await loadEmployeeScheduleForOwner(
    input.barbershopId,
    input.employeeId,
    input.ownerUserId,
  );

  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  assertExpectedUpdatedAt(input.body.expectedUpdatedAt, employee.updatedAt);

  if (input.body.mode === 'CUSTOM') {
    await validateWeeklyIntervalsWithinBarbershop(
      input.barbershopId,
      input.body.weeklyIntervals,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.employeeWorkingInterval.deleteMany({
      where: {
        employeeId: input.employeeId,
        barbershopId: input.barbershopId,
      },
    });

    if (input.body.mode === 'CUSTOM' && input.body.weeklyIntervals.length > 0) {
      await tx.employeeWorkingInterval.createMany({
        data: input.body.weeklyIntervals.map((interval) => ({
          barbershopId: input.barbershopId,
          employeeId: input.employeeId,
          dayOfWeek: interval.dayOfWeek,
          openTime: interval.start,
          closeTime: interval.end,
        })),
      });
    }

    const updatedEmployee = await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        scheduleMode: input.body.mode,
      },
      select: EMPLOYEE_SCHEDULE_READ_SELECT,
    });

    return buildScheduleResponse({
      employee: updatedEmployee,
      includeReason: true,
      now: input.now,
      db: tx,
    });
  });
}

export async function upsertEmployeeScheduleException(input: {
  barbershopId: string;
  employeeId: string;
  localDate: string;
  body: UpsertEmployeeScheduleExceptionInput;
  ownerUserId: string;
  now?: Date;
}): Promise<EmployeeScheduleResponse> {
  const employee = await loadEmployeeScheduleForOwner(
    input.barbershopId,
    input.employeeId,
    input.ownerUserId,
  );

  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  const normalizedIntervals =
    input.body.type === 'CUSTOM_HOURS'
      ? normalizeScheduleExceptionIntervals(
          (input.body.intervals ?? []).map((interval, position) => ({
            openTime: interval.start,
            closeTime: interval.end,
            position,
          })),
        )
      : [];

  if (input.body.type === 'CUSTOM_HOURS') {
    await validateExceptionIntervalsWithinBarbershop({
      barbershopId: input.barbershopId,
      localDate: input.localDate,
      intervals: normalizedIntervals.map((interval) => ({
        start: interval.openTime,
        end: interval.closeTime,
      })),
    });
  }

  return prisma.$transaction(async (tx) => {
    const exception = await tx.employeeScheduleException.upsert({
      where: {
        employeeId_localDate: {
          employeeId: input.employeeId,
          localDate: input.localDate,
        },
      },
      create: {
        barbershopId: input.barbershopId,
        employeeId: input.employeeId,
        localDate: input.localDate,
        type: input.body.type,
        reason: normalizeReason(input.body.reason),
      },
      update: {
        type: input.body.type,
        reason: normalizeReason(input.body.reason),
      },
    });

    await tx.employeeScheduleExceptionInterval.deleteMany({
      where: {
        scheduleExceptionId: exception.id,
      },
    });

    if (normalizedIntervals.length > 0) {
      await tx.employeeScheduleExceptionInterval.createMany({
        data: normalizedIntervals.map((interval) => ({
          scheduleExceptionId: exception.id,
          openTime: interval.openTime,
          closeTime: interval.closeTime,
          position: interval.position,
        })),
      });
    }

    const updatedEmployee = await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        scheduleMode: employee.scheduleMode,
      },
      select: EMPLOYEE_SCHEDULE_READ_SELECT,
    });

    return buildScheduleResponse({
      employee: updatedEmployee,
      includeReason: true,
      now: input.now,
      db: tx,
    });
  });
}

export async function deleteEmployeeScheduleException(input: {
  barbershopId: string;
  employeeId: string;
  localDate: string;
  ownerUserId: string;
  now?: Date;
}): Promise<EmployeeScheduleResponse> {
  const employee = await loadEmployeeScheduleForOwner(
    input.barbershopId,
    input.employeeId,
    input.ownerUserId,
  );

  await prisma.$transaction(async (tx) => {
    await tx.employeeScheduleException.deleteMany({
      where: {
        employeeId: input.employeeId,
        barbershopId: input.barbershopId,
        localDate: input.localDate,
      },
    });

    await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        scheduleMode: employee.scheduleMode,
      },
    });
  });

  const refreshedEmployee = await loadEmployeeScheduleForOwner(
    input.barbershopId,
    input.employeeId,
    input.ownerUserId,
  );

  return buildScheduleResponse({
    employee: refreshedEmployee,
    includeReason: true,
    now: input.now,
  });
}

export async function validateEmployeeAvailabilityWindow(input: {
  barbershopId: string;
  employeeId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  db?: EmployeeScheduleMutationDb;
}): Promise<void> {
  const db = input.db ?? prisma;
  const startLocalDate = getLocalDateStringInTimeZone(input.timezone, input.startAt);
  const endLocalDate = getLocalDateStringInTimeZone(input.timezone, input.endAt);

  if (startLocalDate !== endLocalDate) {
    throw new AppError(
      400,
      'EMPLOYEE_SCHEDULE_CONFLICT',
      'Appointments must fit within one employee working day',
    );
  }

  await validateEmployeeInBarbershop(input.employeeId, input.barbershopId);

  const schedule = await resolveEmployeeEffectiveScheduleForDate(
    {
      barbershopId: input.barbershopId,
      employeeId: input.employeeId,
      localDate: startLocalDate,
    },
    db,
  );
  const startLocalTime = getLocalTimeStringInTimeZone(input.timezone, input.startAt);
  const endLocalTime = getLocalTimeStringInTimeZone(input.timezone, input.endAt);

  const reason = mapAppointmentOutsideScheduleReason(
    schedule,
    startLocalTime,
    endLocalTime,
  );

  if (!reason) {
    return;
  }

  const inheritedBarbershopSource =
    schedule.source === 'weekly' ||
    schedule.source === 'weekly_closed' ||
    schedule.source === 'date_exception_closed' ||
    schedule.source === 'date_exception_custom';

  switch (reason) {
    case 'BARBERSHOP_CLOSED':
      if (inheritedBarbershopSource) {
        throw new BadRequestError('The barbershop is closed for that time');
      }
      throw new AppError(400, 'BARBERSHOP_CLOSED', 'The barbershop is closed for that time');
    case 'EMPLOYEE_TIME_OFF':
      throw new AppError(400, 'EMPLOYEE_TIME_OFF', 'The employee has time off for that time');
    case 'EMPLOYEE_NOT_WORKING':
      throw new AppError(400, 'EMPLOYEE_NOT_WORKING', 'The employee is not working at that time');
    case 'EMPLOYEE_SCHEDULE_CONFLICT':
    default:
      if (
        (schedule.source === 'weekly' || schedule.source === 'date_exception_custom') &&
        schedule.intervals.length === 1
      ) {
        const [interval] = schedule.intervals;
        const startMinutes = timeToMinutes(startLocalTime);
        const endMinutes = timeToMinutes(endLocalTime);
        const openMinutes = timeToMinutes(interval!.openTime);
        const closeMinutes = timeToMinutes(interval!.closeTime);

        if (startMinutes < openMinutes) {
          if (inheritedBarbershopSource) {
            throw new BadRequestError(
              `Appointment starts before opening hours (opens at ${interval!.openTime})`,
            );
          }

          throw new AppError(
            400,
            'EMPLOYEE_SCHEDULE_CONFLICT',
            `Appointment starts before opening hours (opens at ${interval!.openTime})`,
          );
        }

        if (endMinutes > closeMinutes) {
          if (inheritedBarbershopSource) {
            throw new BadRequestError(
              `Appointment ends after closing hours (closes at ${interval!.closeTime})`,
            );
          }

          throw new AppError(
            400,
            'EMPLOYEE_SCHEDULE_CONFLICT',
            `Appointment ends after closing hours (closes at ${interval!.closeTime})`,
          );
        }
      }

      if (inheritedBarbershopSource) {
        throw new BadRequestError('The requested time is outside the business hours');
      }

      throw new AppError(
        400,
        'EMPLOYEE_SCHEDULE_CONFLICT',
        'The requested time is outside the employee schedule',
      );
  }
}
