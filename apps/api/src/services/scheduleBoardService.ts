import { type AppointmentStatus, type PrismaClient, type UserRole } from '@prisma/client';

import { APPOINTMENT_SLOT_INTERVAL_MINUTES, roundMinutesUpToSlotBoundary } from '../lib/appointmentScheduling.js';
import { isBlockingAppointmentStatus } from '../lib/appointmentBlocking.js';
import { timeToMinutes } from '../lib/businessHours.js';
import {
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
  getUtcRangeForLocalDate,
  tryLocalDateTimeToUtc,
} from '../lib/dateUtils.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import {
  resolveEffectiveScheduleForDate,
} from '../lib/effectiveSchedule.js';
import {
  buildEmployeeEffectiveSchedule,
  mapAppointmentOutsideScheduleReason,
  type EmployeeEffectiveScheduleResult,
} from '../lib/employeeEffectiveSchedule.js';
import { prisma } from '../lib/prisma.js';
import { normalizeScheduleExceptionIntervals } from '../lib/scheduleIntervals.js';
import { stripIntervalInputPositions } from '../lib/scheduleIntervalMath.js';

type ScheduleBoardDb = Pick<
  PrismaClient,
  | 'appointment'
  | 'appointmentNotification'
  | 'barbershop'
  | 'barbershopScheduleException'
  | 'employee'
  | 'employeeScheduleException'
  | 'employeeService'
  | 'employeeWorkingInterval'
  | 'workingHours'
>;

export interface DailyScheduleBoardQuery {
  date: string;
  employeeId?: string;
}

export interface GetDailyScheduleBoardInput {
  barbershopId: string;
  query: DailyScheduleBoardQuery;
  userId: string;
  userRole: UserRole;
  authenticatedEmployeeId?: string;
  now?: Date;
}

interface VisibleEmployee {
  id: string;
  userId: string;
  name: string;
  isCurrentUser: boolean;
  scheduleMode: 'INHERIT_BARBERSHOP' | 'CUSTOM';
}

interface ClosedInterval {
  startAt: string;
  endAt: string;
  startTime: string;
  endTime: string;
  reason: 'SCHEDULE_EXCEPTION';
}

interface AppointmentBoardCustomerAggregate {
  completedCount: number;
  noShowCount: number;
}

function toDisplayName(input: { name: string | null; email: string }): string {
  return input.name?.trim() || input.email.trim();
}

function getNotificationSummary(failedCount: number) {
  if (failedCount <= 0) {
    return null;
  }

  return {
    hasFailures: true,
    failedCount,
  };
}

function canCancelAppointment(role: UserRole, status: AppointmentStatus): boolean {
  return role === 'OWNER' && (status === 'PENDING' || status === 'CONFIRMED');
}

function canStartAppointment(role: UserRole, status: AppointmentStatus): boolean {
  return (role === 'OWNER' || role === 'BARBER') && status === 'CONFIRMED';
}

function canCompleteAppointment(role: UserRole, status: AppointmentStatus): boolean {
  return (role === 'OWNER' || role === 'BARBER') && status === 'IN_PROGRESS';
}

function canRescheduleAppointment(input: {
  role: UserRole;
  status: AppointmentStatus;
  deletedAt: Date | null;
  startAt: Date;
  now: Date;
}): boolean {
  return (
    (input.role === 'OWNER' || input.role === 'BARBER') &&
    input.status === 'CONFIRMED' &&
    input.deletedAt === null &&
    input.startAt.getTime() > input.now.getTime()
  );
}

function createStatusSummary() {
  return {
    pending: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    occupiedMinutes: 0,
  };
}

function addAppointmentToSummary(
  summary: ReturnType<typeof createStatusSummary>,
  appointment: { status: AppointmentStatus; startAt: Date; endAt: Date }
) {
  if (appointment.status === 'PENDING') {
    summary.pending += 1;
  } else if (appointment.status === 'CONFIRMED') {
    summary.confirmed += 1;
  } else if (appointment.status === 'IN_PROGRESS') {
    summary.inProgress += 1;
  } else if (appointment.status === 'COMPLETED') {
    summary.completed += 1;
  } else if (appointment.status === 'NO_SHOW') {
    summary.noShow += 1;
  } else if (appointment.status === 'CANCELLED') {
    summary.cancelled += 1;
  }

  if (isBlockingAppointmentStatus(appointment.status)) {
    summary.occupiedMinutes += Math.max(
      0,
      Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000)
    );
  }
}

function deriveClosedIntervals(
  localDate: string,
  timezone: string,
  intervals: Array<{ openTime: string; closeTime: string }>
): ClosedInterval[] {
  if (intervals.length <= 1) {
    return [];
  }

  const closedIntervals: ClosedInterval[] = [];

  for (let index = 0; index < intervals.length - 1; index += 1) {
    const current = intervals[index]!;
    const next = intervals[index + 1]!;

    if (current.closeTime >= next.openTime) {
      continue;
    }

    const startAt = tryLocalDateTimeToUtc(localDate, current.closeTime, timezone);
    const endAt = tryLocalDateTimeToUtc(localDate, next.openTime, timezone);

    if (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) {
      continue;
    }

    closedIntervals.push({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      startTime: current.closeTime,
      endTime: next.openTime,
      reason: 'SCHEDULE_EXCEPTION',
    });
  }

  return closedIntervals;
}

function clipGapStartForOperationalToday(input: {
  date: string;
  timezone: string;
  now: Date;
  gapStartAt: Date;
  gapEndAt: Date;
}): Date | null {
  const todayLocalDate = getLocalDateStringInTimeZone(input.timezone, input.now);
  if (input.date !== todayLocalDate) {
    return input.gapStartAt;
  }

  if (input.gapEndAt.getTime() <= input.now.getTime()) {
    return null;
  }

  if (input.gapStartAt.getTime() >= input.now.getTime()) {
    return input.gapStartAt;
  }

  const currentLocalMinutes = timeToMinutes(
    getLocalTimeStringInTimeZone(input.timezone, input.now)
  );
  const roundedMinutes = roundMinutesUpToSlotBoundary(
    currentLocalMinutes,
    APPOINTMENT_SLOT_INTERVAL_MINUTES
  );
  const roundedTime = `${String(Math.floor(roundedMinutes / 60)).padStart(2, '0')}:${String(roundedMinutes % 60).padStart(2, '0')}`;
  const roundedStartAt = tryLocalDateTimeToUtc(
    input.date,
    roundedTime,
    input.timezone
  );

  if (!roundedStartAt) {
    return null;
  }

  if (roundedStartAt.getTime() >= input.gapEndAt.getTime()) {
    return null;
  }

  return roundedStartAt.getTime() > input.gapStartAt.getTime()
    ? roundedStartAt
    : input.gapStartAt;
}

function buildAvailableGaps(input: {
  date: string;
  timezone: string;
  now: Date;
  intervals: Array<{ openTime: string; closeTime: string }>;
  blockingAppointments: Array<{ startAt: Date; endAt: Date }>;
  minimumBookableDuration: number | null;
}) {
  const gaps: Array<{
    startAt: string;
    endAt: string;
    localStartTime: string;
    localEndTime: string;
    durationMinutes: number;
    isPast: boolean;
    minimumBookableDuration: number | null;
  }> = [];

  for (const interval of input.intervals) {
    const intervalStartAt = tryLocalDateTimeToUtc(
      input.date,
      interval.openTime,
      input.timezone
    );
    const intervalEndAt = tryLocalDateTimeToUtc(
      input.date,
      interval.closeTime,
      input.timezone
    );

    if (!intervalStartAt || !intervalEndAt) {
      continue;
    }

    let cursor = intervalStartAt;

    for (const appointment of input.blockingAppointments) {
      if (appointment.endAt.getTime() <= intervalStartAt.getTime()) {
        continue;
      }

      if (appointment.startAt.getTime() >= intervalEndAt.getTime()) {
        break;
      }

      if (appointment.startAt.getTime() > cursor.getTime()) {
        const clippedStart = clipGapStartForOperationalToday({
          date: input.date,
          timezone: input.timezone,
          now: input.now,
          gapStartAt: cursor,
          gapEndAt: appointment.startAt,
        });

        if (clippedStart) {
          const durationMinutes = Math.round(
            (appointment.startAt.getTime() - clippedStart.getTime()) / 60_000
          );

          if (
            durationMinutes > 0 &&
            (
              input.minimumBookableDuration === null ||
              durationMinutes >= input.minimumBookableDuration
            )
          ) {
            gaps.push({
              startAt: clippedStart.toISOString(),
              endAt: appointment.startAt.toISOString(),
              localStartTime: getLocalTimeStringInTimeZone(
                input.timezone,
                clippedStart
              ),
              localEndTime: getLocalTimeStringInTimeZone(
                input.timezone,
                appointment.startAt
              ),
              durationMinutes,
              isPast: false,
              minimumBookableDuration: input.minimumBookableDuration,
            });
          }
        }
      }

      if (appointment.endAt.getTime() > cursor.getTime()) {
        cursor = appointment.endAt;
      }
    }

    if (cursor.getTime() < intervalEndAt.getTime()) {
      const clippedStart = clipGapStartForOperationalToday({
        date: input.date,
        timezone: input.timezone,
        now: input.now,
        gapStartAt: cursor,
        gapEndAt: intervalEndAt,
      });

      if (!clippedStart) {
        continue;
      }

      const durationMinutes = Math.round(
        (intervalEndAt.getTime() - clippedStart.getTime()) / 60_000
      );

      if (
        durationMinutes > 0 &&
        (
          input.minimumBookableDuration === null ||
          durationMinutes >= input.minimumBookableDuration
        )
      ) {
        gaps.push({
          startAt: clippedStart.toISOString(),
          endAt: intervalEndAt.toISOString(),
          localStartTime: getLocalTimeStringInTimeZone(input.timezone, clippedStart),
          localEndTime: getLocalTimeStringInTimeZone(input.timezone, intervalEndAt),
          durationMinutes,
          isPast: false,
          minimumBookableDuration: input.minimumBookableDuration,
        });
      }
    }
  }

  return gaps;
}

async function assertOwnerOwnsBarbershop(
  barbershopId: string,
  userId: string,
  db: Pick<PrismaClient, 'barbershop'> = prisma
) {
  const shop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: { ownerId: true, deletedAt: true },
  });

  if (!shop || shop.deletedAt) {
    throw new NotFoundError('Barbershop');
  }

  if (shop.ownerId !== userId) {
    throw new NotFoundError('Barbershop');
  }
}

async function resolveVisibleEmployees(input: {
  barbershopId: string;
  requestedEmployeeId?: string;
  userId: string;
  userRole: UserRole;
  authenticatedEmployeeId?: string;
  db?: ScheduleBoardDb;
}): Promise<VisibleEmployee[]> {
  const db = input.db ?? prisma;

  if (input.userRole === 'OWNER') {
    await assertOwnerOwnsBarbershop(input.barbershopId, input.userId, db);

    if (input.requestedEmployeeId) {
      const employee = await db.employee.findFirst({
        where: {
          id: input.requestedEmployeeId,
          barbershopId: input.barbershopId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          userId: true,
          scheduleMode: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundError('Employee');
      }

      return [{
        id: employee.id,
        userId: employee.userId,
        name: toDisplayName(employee.user),
        isCurrentUser: employee.userId === input.userId,
        scheduleMode: employee.scheduleMode,
      }];
    }

    const employees = await db.employee.findMany({
      where: {
        barbershopId: input.barbershopId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        scheduleMode: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return employees.map((employee) => ({
      id: employee.id,
      userId: employee.userId,
      name: toDisplayName(employee.user),
      isCurrentUser: employee.userId === input.userId,
      scheduleMode: employee.scheduleMode,
    }));
  }

  if (input.userRole === 'BARBER') {
    const authenticatedEmployee = input.authenticatedEmployeeId
      ? await db.employee.findFirst({
          where: {
            id: input.authenticatedEmployeeId,
            userId: input.userId,
            barbershopId: input.barbershopId,
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            userId: true,
            scheduleMode: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        })
      : await db.employee.findFirst({
          where: {
            userId: input.userId,
            barbershopId: input.barbershopId,
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            userId: true,
            scheduleMode: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        });

    if (!authenticatedEmployee) {
      throw new NotFoundError('Barbershop');
    }

    if (
      input.requestedEmployeeId &&
      input.requestedEmployeeId !== authenticatedEmployee.id
    ) {
      throw new AppError(
        403,
        'FORBIDDEN_EMPLOYEE_SCOPE',
        'Barbers can only view their own schedule board'
      );
    }

    return [{
      id: authenticatedEmployee.id,
      userId: authenticatedEmployee.userId,
      name: toDisplayName(authenticatedEmployee.user),
      isCurrentUser: true,
      scheduleMode: authenticatedEmployee.scheduleMode,
    }];
  }

  throw new NotFoundError('Barbershop');
}

async function resolveEmployeeSchedulesForBoard(input: {
  barbershopId: string;
  localDate: string;
  visibleEmployees: VisibleEmployee[];
  db: ScheduleBoardDb;
}): Promise<Map<string, EmployeeEffectiveScheduleResult>> {
  const employeeIds = input.visibleEmployees.map((employee) => employee.id);
  const dayOfWeek = new Date(`${input.localDate}T00:00:00.000Z`).getUTCDay();

  const [barbershopSchedule, weeklyIntervals, employeeExceptions] = await Promise.all([
    resolveEffectiveScheduleForDate(
      {
        barbershopId: input.barbershopId,
        localDate: input.localDate,
      },
      input.db,
    ),
    employeeIds.length > 0
      ? input.db.employeeWorkingInterval.findMany({
          where: {
            barbershopId: input.barbershopId,
            employeeId: { in: employeeIds },
            dayOfWeek,
          },
          select: {
            employeeId: true,
            openTime: true,
            closeTime: true,
          },
          orderBy: [
            { employeeId: 'asc' },
            { openTime: 'asc' },
          ],
        })
      : Promise.resolve([]),
    employeeIds.length > 0
      ? input.db.employeeScheduleException.findMany({
          where: {
            barbershopId: input.barbershopId,
            employeeId: { in: employeeIds },
            localDate: input.localDate,
          },
          include: {
            intervals: {
              orderBy: {
                position: 'asc',
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const weeklyIntervalsByEmployee = new Map<
    string,
    Array<{ openTime: string; closeTime: string }>
  >();
  for (const interval of weeklyIntervals) {
    const bucket = weeklyIntervalsByEmployee.get(interval.employeeId) ?? [];
    bucket.push({
      openTime: interval.openTime,
      closeTime: interval.closeTime,
    });
    weeklyIntervalsByEmployee.set(interval.employeeId, bucket);
  }

  const exceptionByEmployee = new Map(
    employeeExceptions.map((exception) => [
      exception.employeeId,
      {
        type: exception.type,
        reason: null,
        intervals: stripIntervalInputPositions(
          normalizeScheduleExceptionIntervals(exception.intervals),
        ),
      },
    ]),
  );

  return new Map(
    input.visibleEmployees.map((employee) => [
      employee.id,
      buildEmployeeEffectiveSchedule({
        barbershopSchedule,
        employee: {
          id: employee.id,
          barbershopId: input.barbershopId,
          isActive: true,
          deletedAt: null,
          scheduleMode: employee.scheduleMode,
        },
        weeklyIntervals: weeklyIntervalsByEmployee.get(employee.id) ?? [],
        employeeException: exceptionByEmployee.get(employee.id) ?? null,
      }),
    ]),
  );
}

export async function getDailyScheduleBoard(
  input: GetDailyScheduleBoardInput,
  db: ScheduleBoardDb = prisma
) {
  const now = input.now ?? new Date();
  const visibleEmployees = await resolveVisibleEmployees({
    barbershopId: input.barbershopId,
    requestedEmployeeId: input.query.employeeId,
    userId: input.userId,
    userRole: input.userRole,
    authenticatedEmployeeId: input.authenticatedEmployeeId,
    db,
  });

  const barbershop = await db.barbershop.findUnique({
    where: { id: input.barbershopId },
    select: {
      id: true,
      timezone: true,
      deletedAt: true,
    },
  });

  if (!barbershop || barbershop.deletedAt) {
    throw new NotFoundError('Barbershop');
  }

  const { startUtc, endUtc } = getUtcRangeForLocalDate(
    input.query.date,
    barbershop.timezone
  );
  const employeeSchedules = await resolveEmployeeSchedulesForBoard({
    barbershopId: input.barbershopId,
    localDate: input.query.date,
    visibleEmployees,
    db,
  });

  const employeeIds = visibleEmployees.map((employee) => employee.id);
  const [appointments, assignedServices] = await Promise.all([
    db.appointment.findMany({
      where: {
        barbershopId: input.barbershopId,
        employeeId: { in: employeeIds },
        deletedAt: null,
        startAt: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      select: {
        id: true,
        barbershopId: true,
        employeeId: true,
        customerId: true,
        serviceId: true,
        clientName: true,
        serviceName: true,
        startAt: true,
        endAt: true,
        status: true,
        deletedAt: true,
      },
      orderBy: [
        { employeeId: 'asc' },
        { startAt: 'asc' },
        { id: 'asc' },
      ],
    }),
    db.employeeService.findMany({
      where: {
        employeeId: { in: employeeIds },
        service: {
          isActive: true,
          deletedAt: null,
          barbershopId: input.barbershopId,
        },
      },
      select: {
        employeeId: true,
        service: {
          select: {
            durationMinutes: true,
          },
        },
      },
    }),
  ]);

  const appointmentIds = appointments.map((appointment) => appointment.id);
  const failedNotifications = appointmentIds.length > 0
    ? await db.appointmentNotification.groupBy({
        by: ['appointmentId'],
        where: {
          barbershopId: input.barbershopId,
          appointmentId: {
            in: appointmentIds,
          },
          status: 'FAILED',
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const customerIds = appointments
    .map((appointment) => appointment.customerId)
    .filter((customerId): customerId is string => Boolean(customerId));

  const customerStatusGroups = customerIds.length > 0
    ? await db.appointment.groupBy({
        by: ['customerId', 'status'],
        where: {
          barbershopId: input.barbershopId,
          deletedAt: null,
          customerId: { in: customerIds },
          status: {
            in: ['COMPLETED', 'NO_SHOW'],
          },
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const customerAggregates = new Map<string, AppointmentBoardCustomerAggregate>();
  for (const row of customerStatusGroups) {
    if (!row.customerId) {
      continue;
    }

    const current = customerAggregates.get(row.customerId) ?? {
      completedCount: 0,
      noShowCount: 0,
    };

    if (row.status === 'COMPLETED') {
      current.completedCount += row._count._all;
    } else if (row.status === 'NO_SHOW') {
      current.noShowCount += row._count._all;
    }

    customerAggregates.set(row.customerId, current);
  }

  const failedNotificationMap = new Map<string, number>();
  for (const row of failedNotifications) {
    failedNotificationMap.set(row.appointmentId, row._count._all);
  }

  const minimumDurationByEmployee = new Map<string, number | null>();
  for (const employee of visibleEmployees) {
    minimumDurationByEmployee.set(employee.id, null);
  }

  for (const link of assignedServices) {
    const current = minimumDurationByEmployee.get(link.employeeId) ?? null;
    const nextDuration = link.service.durationMinutes;
    minimumDurationByEmployee.set(
      link.employeeId,
      current === null ? nextDuration : Math.min(current, nextDuration)
    );
  }

  const appointmentsByEmployee = new Map<string, typeof appointments>();
  for (const employee of visibleEmployees) {
    appointmentsByEmployee.set(employee.id, []);
  }

  for (const appointment of appointments) {
    appointmentsByEmployee.get(appointment.employeeId)?.push(appointment);
  }

  const todayLocalDate = getLocalDateStringInTimeZone(barbershop.timezone, now);

  return {
    date: input.query.date,
    timezone: barbershop.timezone,
    generatedAt: now.toISOString(),
    currentTime:
      input.query.date === todayLocalDate
        ? {
            iso: now.toISOString(),
            localTime: getLocalTimeStringInTimeZone(barbershop.timezone, now),
          }
        : null,
    employees: visibleEmployees.map((employee) => {
      const employeeSchedule = employeeSchedules.get(employee.id)!;
      const employeeAppointments = appointmentsByEmployee.get(employee.id) ?? [];
      const blockingAppointments = employeeAppointments
        .filter((appointment) => isBlockingAppointmentStatus(appointment.status))
        .map((appointment) => ({
          startAt: appointment.startAt,
          endAt: appointment.endAt,
        }));
      const minimumBookableDuration =
        minimumDurationByEmployee.get(employee.id) ?? null;
      const summary = createStatusSummary();

      for (const appointment of employeeAppointments) {
        addAppointmentToSummary(summary, appointment);
      }

      const closedIntervals = deriveClosedIntervals(
        input.query.date,
        barbershop.timezone,
        employeeSchedule.intervals,
      );

      return {
        id: employee.id,
        name: employee.name,
        isCurrentUser: employee.isCurrentUser,
        workingDay: {
          source: employeeSchedule.source,
          scheduleMode: employee.scheduleMode,
          availabilityState:
            employeeSchedule.source === 'EMPLOYEE_FULL_DAY_OFF'
              ? 'TIME_OFF'
              : employeeSchedule.source === 'EMPLOYEE_CUSTOM_HOURS'
                ? 'CUSTOM_HOURS'
                : employeeSchedule.intervals.length > 0
                  ? 'WORKING'
                  : 'OFF',
          intervals: employeeSchedule.intervals.map((interval) => ({
            startTime: interval.openTime,
            endTime: interval.closeTime,
            startAt: tryLocalDateTimeToUtc(
              input.query.date,
              interval.openTime,
              barbershop.timezone
            )?.toISOString() ?? null,
            endAt: tryLocalDateTimeToUtc(
              input.query.date,
              interval.closeTime,
              barbershop.timezone
            )?.toISOString() ?? null,
          })),
          closedIntervals,
        },
        summary,
        minimumBookableDuration,
        availableGaps: buildAvailableGaps({
          date: input.query.date,
          timezone: barbershop.timezone,
          now,
          intervals: employeeSchedule.intervals,
          blockingAppointments,
          minimumBookableDuration,
        }),
        appointments: employeeAppointments.map((appointment) => {
          const customerAggregate = appointment.customerId
            ? customerAggregates.get(appointment.customerId) ?? {
                completedCount: 0,
                noShowCount: 0,
              }
            : {
                completedCount: 0,
                noShowCount: 0,
              };
          const failedCount = failedNotificationMap.get(appointment.id) ?? 0;
          const outsideWorkingHoursReasonCode = mapAppointmentOutsideScheduleReason(
            employeeSchedule,
            getLocalTimeStringInTimeZone(barbershop.timezone, appointment.startAt),
            getLocalTimeStringInTimeZone(barbershop.timezone, appointment.endAt),
          );

          return {
            id: appointment.id,
            employeeId: employee.id,
            employeeName: employee.name,
            serviceId: appointment.serviceId,
            serviceName: appointment.serviceName,
            startAt: appointment.startAt.toISOString(),
            endAt: appointment.endAt.toISOString(),
            localStartTime: getLocalTimeStringInTimeZone(
              barbershop.timezone,
              appointment.startAt
            ),
            localEndTime: getLocalTimeStringInTimeZone(
              barbershop.timezone,
              appointment.endAt
            ),
            status: appointment.status,
            clientDisplayName: appointment.clientName,
            customerId: appointment.customerId,
            isReturningCustomer: customerAggregate.completedCount > 0,
            completedVisitCount: customerAggregate.completedCount,
            noShowCount: customerAggregate.noShowCount,
            hasPreviousNoShows: customerAggregate.noShowCount > 0,
            notificationSummary: getNotificationSummary(failedCount),
            canReschedule: canRescheduleAppointment({
              role: input.userRole,
              status: appointment.status,
              deletedAt: appointment.deletedAt,
              startAt: appointment.startAt,
              now,
            }),
            isOutsideWorkingHours: outsideWorkingHoursReasonCode !== null,
            outsideWorkingHoursReasonCode,
            canStart: canStartAppointment(input.userRole, appointment.status),
            canComplete: canCompleteAppointment(input.userRole, appointment.status),
            canMarkNoShow: canCompleteAppointment(input.userRole, appointment.status),
            canCancel: canCancelAppointment(input.userRole, appointment.status),
          };
        }),
      };
    }),
  };
}
