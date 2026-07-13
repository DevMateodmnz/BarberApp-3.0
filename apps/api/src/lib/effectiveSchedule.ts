import type { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';
import { NotFoundError } from './errors.js';
import {
  normalizeScheduleExceptionIntervals,
  stripIntervalPositions,
} from './scheduleIntervals.js';

type EffectiveScheduleDatabase = Pick<
  PrismaClient,
  'barbershop' | 'workingHours' | 'barbershopScheduleException'
>;

export interface EffectiveScheduleInterval {
  openTime: string;
  closeTime: string;
}

export interface ResolveEffectiveScheduleInput {
  barbershopId: string;
  localDate: string;
}

export interface EffectiveScheduleResult {
  barbershopId: string;
  localDate: string;
  timezone: string;
  source:
    | 'weekly'
    | 'weekly_closed'
    | 'date_exception_closed'
    | 'date_exception_custom';
  intervals: EffectiveScheduleInterval[];
}

function getUtcDayOfWeek(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function resolveEffectiveScheduleForDate(
  input: ResolveEffectiveScheduleInput,
  db: EffectiveScheduleDatabase = prisma
): Promise<EffectiveScheduleResult> {
  const { barbershopId, localDate } = input;

  const [barbershop, exception] = await Promise.all([
    db.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        id: true,
        timezone: true,
        deletedAt: true,
      },
    }),
    db.barbershopScheduleException.findUnique({
      where: {
        barbershopId_localDate: {
          barbershopId,
          localDate,
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

  if (!barbershop || barbershop.deletedAt) {
    throw new NotFoundError('Barbershop');
  }

  if (exception) {
    if (exception.isClosed) {
      return {
        barbershopId,
        localDate,
        timezone: barbershop.timezone,
        source: 'date_exception_closed',
        intervals: [],
      };
    }

    return {
      barbershopId,
      localDate,
      timezone: barbershop.timezone,
      source: 'date_exception_custom',
      intervals: stripIntervalPositions(
        normalizeScheduleExceptionIntervals(exception.intervals)
      ),
    };
  }

  const workingHours = await db.workingHours.findUnique({
    where: {
      barbershopId_dayOfWeek: {
        barbershopId,
        dayOfWeek: getUtcDayOfWeek(localDate),
      },
    },
    select: {
      openTime: true,
      closeTime: true,
      isActive: true,
    },
  });

  if (!workingHours || !workingHours.isActive) {
    return {
      barbershopId,
      localDate,
      timezone: barbershop.timezone,
      source: 'weekly_closed',
      intervals: [],
    };
  }

  return {
    barbershopId,
    localDate,
    timezone: barbershop.timezone,
    source: 'weekly',
    intervals: [
      {
        openTime: workingHours.openTime,
        closeTime: workingHours.closeTime,
      },
    ],
  };
}
