import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import {
  normalizeScheduleExceptionIntervals,
  type NormalizedScheduleInterval,
} from '../lib/scheduleIntervals.js';

type ScheduleExceptionProvisioningDatabase = Pick<
  PrismaClient,
  | '$transaction'
  | 'barbershop'
  | 'barbershopScheduleException'
  | 'barbershopScheduleExceptionInterval'
>;

type ExceptionStatus = 'none' | 'closed' | 'custom';

export type ProvisionBarbershopScheduleExceptionInput =
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'closed';
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'clear';
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'set_intervals';
      intervals: Array<NormalizedScheduleInterval | { openTime: string; closeTime: string }>;
    };

export interface ProvisionBarbershopScheduleExceptionResult {
  barbershopId: string;
  barbershopName: string;
  changed: boolean;
  dryRun: boolean;
  localDate: string;
  mode: ProvisionBarbershopScheduleExceptionInput['mode'];
  nextIntervals: Array<{ openTime: string; closeTime: string; position: number }>;
  nextStatus: ExceptionStatus;
  previousIntervals: Array<{ openTime: string; closeTime: string; position: number }>;
  previousStatus: ExceptionStatus;
  timezone: string;
}

function deriveExceptionStatus(input: {
  isClosed: boolean;
  intervals: Array<{ openTime: string; closeTime: string; position: number }>;
} | null): ExceptionStatus {
  if (!input) {
    return 'none';
  }

  return input.isClosed ? 'closed' : 'custom';
}

function serializeIntervals(
  intervals: Array<{ openTime: string; closeTime: string; position: number }>
): string {
  return JSON.stringify(intervals);
}

export async function provisionBarbershopScheduleException(
  input: ProvisionBarbershopScheduleExceptionInput,
  db: ScheduleExceptionProvisioningDatabase = prisma
): Promise<ProvisionBarbershopScheduleExceptionResult> {
  const barbershop = await db.barbershop.findUnique({
    where: { id: input.barbershopId },
    select: {
      id: true,
      name: true,
      timezone: true,
      deletedAt: true,
    },
  });

  if (!barbershop || barbershop.deletedAt) {
    throw new NotFoundError('Barbershop');
  }

  const existing = await db.barbershopScheduleException.findUnique({
    where: {
      barbershopId_localDate: {
        barbershopId: input.barbershopId,
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
  });

  const previousIntervals = existing?.intervals.map((interval) => ({
    openTime: interval.openTime,
    closeTime: interval.closeTime,
    position: interval.position,
  })) ?? [];
  const previousStatus = deriveExceptionStatus(
    existing
      ? {
          isClosed: existing.isClosed,
          intervals: previousIntervals,
        }
      : null
  );

  let nextStatus: ExceptionStatus = 'none';
  let nextIntervals: Array<{ openTime: string; closeTime: string; position: number }> = [];

  if (input.mode === 'closed') {
    nextStatus = 'closed';
  } else if (input.mode === 'set_intervals') {
    nextStatus = 'custom';
    nextIntervals = normalizeScheduleExceptionIntervals(input.intervals);
  }

  const changed =
    previousStatus !== nextStatus ||
    serializeIntervals(previousIntervals) !== serializeIntervals(nextIntervals);

  if (!input.dryRun && changed) {
    await db.$transaction(async (tx) => {
      if (input.mode === 'clear') {
        await tx.barbershopScheduleException.deleteMany({
          where: {
            barbershopId: input.barbershopId,
            localDate: input.localDate,
          },
        });
        return;
      }

      const exception = await tx.barbershopScheduleException.upsert({
        where: {
          barbershopId_localDate: {
            barbershopId: input.barbershopId,
            localDate: input.localDate,
          },
        },
        create: {
          barbershopId: input.barbershopId,
          localDate: input.localDate,
          isClosed: input.mode === 'closed',
        },
        update: {
          isClosed: input.mode === 'closed',
        },
        select: {
          id: true,
        },
      });

      await tx.barbershopScheduleExceptionInterval.deleteMany({
        where: {
          scheduleExceptionId: exception.id,
        },
      });

      if (input.mode === 'set_intervals' && nextIntervals.length > 0) {
        await tx.barbershopScheduleExceptionInterval.createMany({
          data: nextIntervals.map((interval) => ({
            scheduleExceptionId: exception.id,
            openTime: interval.openTime,
            closeTime: interval.closeTime,
            position: interval.position,
          })),
        });
      }
    });
  }

  return {
    barbershopId: barbershop.id,
    barbershopName: barbershop.name,
    changed,
    dryRun: input.dryRun,
    localDate: input.localDate,
    mode: input.mode,
    nextIntervals,
    nextStatus,
    previousIntervals,
    previousStatus,
    timezone: barbershop.timezone,
  };
}
