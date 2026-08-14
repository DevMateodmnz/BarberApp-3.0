import { Prisma, type Appointment } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { calculateCommissionCents } from '../lib/commissionMath.js';
import { getUtcRangeForLocalDate, addDaysToDateString } from '../lib/dateUtils.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import type {
  CommissionRangeQuery,
  CreateLiquidationInput,
  UpdateCommissionSettingsInput,
} from '../schemas/commission.js';

type TransactionClient = Prisma.TransactionClient;

function assertRange(dateFrom: string, dateTo: string) {
  if (dateFrom > dateTo) {
    throw new BadRequestError('dateFrom must be on or before dateTo');
  }
  const dayCount = Math.round(
    (Date.parse(`${dateTo}T00:00:00.000Z`) - Date.parse(`${dateFrom}T00:00:00.000Z`)) /
      86_400_000
  );
  const parsedFrom = new Date(`${dateFrom}T00:00:00.000Z`);
  const parsedTo = new Date(`${dateTo}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedFrom.getTime()) ||
    Number.isNaN(parsedTo.getTime()) ||
    parsedFrom.toISOString().slice(0, 10) !== dateFrom ||
    parsedTo.toISOString().slice(0, 10) !== dateTo ||
    !Number.isFinite(dayCount) ||
    dayCount > 366
  ) {
    throw new BadRequestError('Commission date range cannot exceed 367 days');
  }
}

async function resolveRange(barbershopId: string, dateFrom: string, dateTo: string) {
  assertRange(dateFrom, dateTo);
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { timezone: true },
  });
  if (!shop) throw new NotFoundError('Barbershop');
  const { startUtc } = getUtcRangeForLocalDate(dateFrom, shop.timezone);
  const { startUtc: endUtc } = getUtcRangeForLocalDate(
    addDaysToDateString(dateTo, 1),
    shop.timezone
  );
  return { startUtc, endUtc, timezone: shop.timezone };
}

async function requireEmployee(barbershopId: string, employeeId: string, activeOnly = false) {
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      barbershopId,
      deletedAt: null,
      ...(activeOnly ? { isActive: true } : {}),
    },
    select: { id: true },
  });
  if (!employee) throw new NotFoundError('Employee');
  return employee;
}

export async function accrueCommissionForCompletedAppointment(
  db: TransactionClient,
  appointment: Pick<
    Appointment,
    'id' | 'barbershopId' | 'employeeId' | 'finalPriceCents' | 'serviceCurrency'
  >,
  earnedAt: Date
) {
  const [shop, policy] = await Promise.all([
    db.barbershop.findUniqueOrThrow({
      where: { id: appointment.barbershopId },
      select: { defaultCommissionBasisPoints: true },
    }),
    db.employeeCommissionPolicy.findUnique({
      where: { employeeId: appointment.employeeId },
      select: { percentageBasisPoints: true, barbershopId: true },
    }),
  ]);
  if (policy && policy.barbershopId !== appointment.barbershopId) {
    throw new AppError(409, 'COMMISSION_POLICY_TENANT_MISMATCH', 'Commission policy is not valid for this appointment');
  }
  const basisPoints = policy?.percentageBasisPoints ?? shop.defaultCommissionBasisPoints;
  const commissionAmountCents = calculateCommissionCents(
    appointment.finalPriceCents,
    basisPoints
  );

  return db.commissionEntry.create({
    data: {
      barbershopId: appointment.barbershopId,
      employeeId: appointment.employeeId,
      appointmentId: appointment.id,
      type: 'ACCRUAL',
      grossAmountCents: appointment.finalPriceCents,
      percentageBasisPoints: basisPoints,
      commissionAmountCents,
      currency: appointment.serviceCurrency,
      earnedAt,
    },
  });
}

export async function getCommissionSettings(barbershopId: string) {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      defaultCommissionBasisPoints: true,
      employees: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          isActive: true,
          user: { select: { name: true, email: true } },
          commissionPolicy: { select: { percentageBasisPoints: true } },
        },
      },
    },
  });
  if (!shop) throw new NotFoundError('Barbershop');
  return {
    defaultPercentageBasisPoints: shop.defaultCommissionBasisPoints,
    employees: shop.employees.map((employee) => ({
      employeeId: employee.id,
      name: employee.user.name ?? employee.user.email,
      isActive: employee.isActive,
      overridePercentageBasisPoints: employee.commissionPolicy?.percentageBasisPoints ?? null,
      effectivePercentageBasisPoints:
        employee.commissionPolicy?.percentageBasisPoints ?? shop.defaultCommissionBasisPoints,
    })),
  };
}

export async function updateCommissionSettings(
  barbershopId: string,
  input: UpdateCommissionSettingsInput
) {
  const ids = input.employeeOverrides.map((item) => item.employeeId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestError('Each employee may appear only once');
  }
  const employees = await prisma.employee.findMany({
    where: { id: { in: ids }, barbershopId, deletedAt: null },
    select: { id: true, isActive: true },
  });
  if (employees.length !== ids.length) throw new NotFoundError('Employee');
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  if (input.employeeOverrides.some((item) => item.percentageBasisPoints !== null && !employeeById.get(item.employeeId)?.isActive)) {
    throw new BadRequestError('Commission overrides can only be configured for active employees');
  }

  await prisma.$transaction(async (tx) => {
    await tx.barbershop.update({
      where: { id: barbershopId },
      data: { defaultCommissionBasisPoints: input.defaultPercentageBasisPoints },
    });
    for (const item of input.employeeOverrides) {
      if (item.percentageBasisPoints === null) {
        await tx.employeeCommissionPolicy.deleteMany({
          where: { barbershopId, employeeId: item.employeeId },
        });
      } else {
        await tx.employeeCommissionPolicy.upsert({
          where: { employeeId: item.employeeId },
          create: {
            barbershopId,
            employeeId: item.employeeId,
            percentageBasisPoints: item.percentageBasisPoints,
          },
          update: { percentageBasisPoints: item.percentageBasisPoints },
        });
      }
    }
  });
  return getCommissionSettings(barbershopId);
}

const entryInclude = {
  appointment: {
    select: {
      id: true,
      startAt: true,
      clientName: true,
      serviceName: true,
      status: true,
    },
  },
  liquidation: { select: { id: true, status: true, paidAt: true } },
} satisfies Prisma.CommissionEntryInclude;

const liquidationDetailInclude = {
  entries: { include: entryInclude, orderBy: { earnedAt: 'asc' as const } },
} satisfies Prisma.CommissionLiquidationInclude;

export async function getCommissionOverview(
  barbershopId: string,
  employeeId: string,
  query: CommissionRangeQuery
) {
  await requireEmployee(barbershopId, employeeId);
  const { startUtc, endUtc, timezone } = await resolveRange(
    barbershopId,
    query.dateFrom,
    query.dateTo
  );
  const where: Prisma.CommissionEntryWhereInput = {
    barbershopId,
    employeeId,
    earnedAt: { gte: startUtc, lt: endUtc },
  };
  const [entries, total, sums, unsettled, open, paid] = await Promise.all([
    prisma.commissionEntry.findMany({
      where,
      include: entryInclude,
      orderBy: [{ earnedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.commissionEntry.count({ where }),
    prisma.commissionEntry.aggregate({ where, _sum: { grossAmountCents: true, commissionAmountCents: true } }),
    prisma.commissionEntry.aggregate({ where: { ...where, liquidationId: null }, _sum: { commissionAmountCents: true } }),
    prisma.commissionEntry.aggregate({ where: { ...where, liquidation: { status: 'OPEN' } }, _sum: { commissionAmountCents: true } }),
    prisma.commissionEntry.aggregate({ where: { ...where, liquidation: { status: 'PAID' } }, _sum: { commissionAmountCents: true } }),
  ]);
  return {
    employeeId,
    timezone,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    summary: {
      grossAmountCents: sums._sum.grossAmountCents ?? 0,
      commissionAmountCents: sums._sum.commissionAmountCents ?? 0,
      unsettledAmountCents: unsettled._sum.commissionAmountCents ?? 0,
      openLiquidationAmountCents: open._sum.commissionAmountCents ?? 0,
      paidAmountCents: paid._sum.commissionAmountCents ?? 0,
    },
    items: entries,
    page: query.page,
    limit: query.limit,
    total,
    hasMore: query.page * query.limit < total,
  };
}

export async function previewLiquidation(
  barbershopId: string,
  employeeId: string,
  dateFrom: string,
  dateTo: string
) {
  await requireEmployee(barbershopId, employeeId);
  const { startUtc, endUtc, timezone } = await resolveRange(barbershopId, dateFrom, dateTo);
  const eligibleEntries = await prisma.commissionEntry.findMany({
    where: { barbershopId, employeeId, liquidationId: null, earnedAt: { gte: startUtc, lt: endUtc } },
    include: entryInclude,
    orderBy: [{ earnedAt: 'asc' }, { id: 'asc' }],
    take: 501,
  });
  const entries = eligibleEntries.slice(0, 500);
  return {
    employeeId,
    timezone,
    dateFrom,
    dateTo,
    entryCount: entries.length,
    grossAmountCents: entries.reduce((sum, item) => sum + item.grossAmountCents, 0),
    commissionAmountCents: entries.reduce((sum, item) => sum + item.commissionAmountCents, 0),
    currency: entries[0]?.currency ?? 'ARS',
    items: entries,
    truncated: eligibleEntries.length > entries.length,
  };
}

export async function createLiquidation(
  barbershopId: string,
  userId: string,
  input: CreateLiquidationInput
) {
  await requireEmployee(barbershopId, input.employeeId);
  const { startUtc, endUtc } = await resolveRange(barbershopId, input.dateFrom, input.dateTo);
  const existing = await prisma.commissionLiquidation.findUnique({
    where: { barbershopId_idempotencyKey: { barbershopId, idempotencyKey: input.idempotencyKey } },
    include: { entries: { include: entryInclude } },
  });
  if (existing) {
    if (
      existing.employeeId !== input.employeeId ||
      existing.periodStart.getTime() !== startUtc.getTime() ||
      existing.periodEnd.getTime() !== endUtc.getTime()
    ) {
      throw new ConflictError('Idempotency key was already used for a different liquidation');
    }
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
    const entries = await tx.commissionEntry.findMany({
      where: {
        barbershopId,
        employeeId: input.employeeId,
        liquidationId: null,
        earnedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { id: 'asc' },
      take: 501,
    });
    if (entries.length === 0) throw new BadRequestError('No unsettled commission entries are eligible');
    if (entries.length > 500) throw new BadRequestError('Liquidation contains more than 500 entries; use a smaller date range');
    const currencies = new Set(entries.map((entry) => entry.currency));
    if (currencies.size !== 1) throw new BadRequestError('A liquidation cannot mix currencies');

    const liquidation = await tx.commissionLiquidation.create({
      data: {
        barbershopId,
        employeeId: input.employeeId,
        periodStart: startUtc,
        periodEnd: endUtc,
        grossAmountCents: entries.reduce((sum, item) => sum + item.grossAmountCents, 0),
        commissionAmountCents: entries.reduce((sum, item) => sum + item.commissionAmountCents, 0),
        currency: entries[0]!.currency,
        entryCount: entries.length,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: userId,
      },
    });
    const claimed = await tx.commissionEntry.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) }, liquidationId: null },
      data: { liquidationId: liquidation.id },
    });
    if (claimed.count !== entries.length) {
      throw new ConflictError('Some commission entries were claimed by another liquidation');
    }
    return tx.commissionLiquidation.findUniqueOrThrow({
      where: { id: liquidation.id },
      include: { entries: { include: entryInclude } },
    });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      const raced = await prisma.commissionLiquidation.findUnique({
        where: { barbershopId_idempotencyKey: { barbershopId, idempotencyKey: input.idempotencyKey } },
        include: { entries: { include: entryInclude } },
      });
      if (raced && raced.employeeId === input.employeeId && raced.periodStart.getTime() === startUtc.getTime() && raced.periodEnd.getTime() === endUtc.getTime()) {
        return raced;
      }
      if (error.code === 'P2034') {
        throw new ConflictError('Commission entries were changed by another liquidation');
      }
    }
    throw error;
  }
}

export async function listLiquidations(barbershopId: string, employeeId: string) {
  await requireEmployee(barbershopId, employeeId);
  return prisma.commissionLiquidation.findMany({
    where: { barbershopId, employeeId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getLiquidation(barbershopId: string, liquidationId: string, employeeId?: string) {
  const item = await prisma.commissionLiquidation.findFirst({
    where: { id: liquidationId, barbershopId, ...(employeeId ? { employeeId } : {}) },
    include: liquidationDetailInclude,
  });
  if (!item) throw new NotFoundError('Liquidation');
  return item;
}

export async function markLiquidationPaid(
  barbershopId: string,
  liquidationId: string,
  userId: string,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.commissionLiquidation.findFirst({
      where: { id: liquidationId, barbershopId },
      include: liquidationDetailInclude,
    });
    if (!current) throw new NotFoundError('Liquidation');
    if (current.status === 'PAID') return current;
    if (current.status !== 'OPEN') throw new ConflictError('Only an open liquidation can be marked paid');
    const updated = await tx.commissionLiquidation.updateMany({
      where: { id: liquidationId, barbershopId, status: 'OPEN' },
      data: { status: 'PAID', paidAt: now, paidByUserId: userId },
    });
    if (updated.count === 0) {
      const raced = await tx.commissionLiquidation.findFirst({
        where: { id: liquidationId, barbershopId },
        include: liquidationDetailInclude,
      });
      if (raced?.status === 'PAID') return raced;
      throw new ConflictError('Only an open liquidation can be marked paid');
    }
    return tx.commissionLiquidation.findUniqueOrThrow({
      where: { id: liquidationId },
      include: liquidationDetailInclude,
    });
  });
}

export async function voidLiquidation(
  barbershopId: string,
  liquidationId: string,
  userId: string,
  reason: string,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.commissionLiquidation.findFirst({
      where: { id: liquidationId, barbershopId },
      include: liquidationDetailInclude,
    });
    if (!current) throw new NotFoundError('Liquidation');
    if (current.status === 'VOIDED') return current;
    if (current.status === 'PAID') throw new ConflictError('Paid liquidations are immutable');
    const updated = await tx.commissionLiquidation.updateMany({
      where: { id: liquidationId, barbershopId, status: 'OPEN' },
      data: { status: 'VOIDED', voidedAt: now, voidedByUserId: userId, voidReason: reason },
    });
    if (updated.count === 0) {
      const raced = await tx.commissionLiquidation.findFirst({
        where: { id: liquidationId, barbershopId },
        include: liquidationDetailInclude,
      });
      if (raced?.status === 'VOIDED') return raced;
      if (raced?.status === 'PAID') throw new ConflictError('Paid liquidations are immutable');
      throw new ConflictError('Only an open liquidation can be voided');
    }
    await tx.commissionEntry.updateMany({
      where: { liquidationId, barbershopId },
      data: { liquidationId: null },
    });
    return tx.commissionLiquidation.findUniqueOrThrow({
      where: { id: liquidationId },
      include: liquidationDetailInclude,
    });
  });
}
