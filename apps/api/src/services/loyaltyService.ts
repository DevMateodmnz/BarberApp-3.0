import crypto from 'node:crypto';

import { Prisma, type UserRole } from '@prisma/client';

import { AppError, BadRequestError, NotFoundError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export type LoyaltyDb = Prisma.TransactionClient | typeof prisma;

const LOYALTY_VISITS_MIN = 2;
const LOYALTY_VISITS_MAX = 20;
const LOYALTY_VALIDITY_DAYS_MAX = 365;
const DEFAULT_VISITS_REQUIRED = 5;

interface RewardTemplateRecord {
  id: string;
  barbershopId: string;
  name: string;
  code: string;
  discountType: 'FIXED' | 'PERCENTAGE';
  fixedDiscountCents: number | null;
  percentageBasisPoints: number | null;
  minimumPriceCents: number | null;
  serviceScope: 'ALL' | 'SELECTED';
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  deletedAt: Date | null;
  services: Array<{ serviceId: string }>;
  loyaltyReward?: { id: string } | null;
}

interface ProgramWithTemplate {
  id: string;
  barbershopId: string;
  isEnabled: boolean;
  visitsRequired: number;
  rewardValidityDays: number | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  rewardPromotion: RewardTemplateRecord | null;
}

export interface LoyaltyProgramDto {
  id: string | null;
  isEnabled: boolean;
  visitsRequired: number;
  rewardValidityDays: number | null;
  rewardPromotion: null | {
    id: string;
    name: string;
    code: string;
    discountType: 'FIXED' | 'PERCENTAGE';
    fixedDiscountCents: number | null;
    percentageBasisPoints: number | null;
    minimumPriceCents: number | null;
    serviceScope: 'ALL' | 'SELECTED';
    appliesToPublicBookings: boolean;
    appliesToStaffBookings: boolean;
    serviceIds: string[];
  };
}

export interface CustomerLoyaltySummaryDto {
  customerId: string;
  visitsRequired: number | null;
  programEnabled: boolean;
  currentStampCount: number;
  lifetimeEligibleVisits: number;
  availableRewardCount: number;
  lastEarnedAt: string | null;
  nextRewardProgress: {
    current: number;
    target: number | null;
  };
  rewards: Array<{
    id: string;
    code: string;
    status: 'AVAILABLE' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
    issuedAt: string;
    expiresAt: string | null;
    redeemedAt: string | null;
    revokedAt: string | null;
    promotionName: string;
  }>;
}

export interface LoyaltyLedgerPageDto {
  items: Array<{
    id: string;
    eventType: string;
    stampDelta: number;
    rewardDelta: number;
    reason: string | null;
    customerId: string;
    customerName: string;
    sourceAppointmentId: string | null;
    loyaltyRewardId: string | null;
    actorRole: UserRole | null;
    actorDisplayName: string | null;
    createdAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
}

function normalizeOptionalReason(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function assertVisitsRequired(value: number): number {
  if (!Number.isInteger(value) || value < LOYALTY_VISITS_MIN || value > LOYALTY_VISITS_MAX) {
    throw new AppError(
      400,
      'LOYALTY_VISITS_REQUIRED_INVALID',
      `Visits required must be an integer between ${LOYALTY_VISITS_MIN} and ${LOYALTY_VISITS_MAX}`,
    );
  }
  return value;
}

function assertRewardValidityDays(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1 || value > LOYALTY_VALIDITY_DAYS_MAX) {
    throw new AppError(
      400,
      'LOYALTY_REWARD_VALIDITY_INVALID',
      `Reward validity must be between 1 and ${LOYALTY_VALIDITY_DAYS_MAX} days`,
    );
  }
  return value;
}

function buildProgramDto(program: ProgramWithTemplate | null): LoyaltyProgramDto {
  if (!program) {
    return {
      id: null,
      isEnabled: false,
      visitsRequired: DEFAULT_VISITS_REQUIRED,
      rewardValidityDays: null,
      rewardPromotion: null,
    };
  }

  return {
    id: program.id,
    isEnabled: program.isEnabled,
    visitsRequired: program.visitsRequired,
    rewardValidityDays: program.rewardValidityDays,
    rewardPromotion: program.rewardPromotion
      ? {
          id: program.rewardPromotion.id,
          name: program.rewardPromotion.name,
          code: program.rewardPromotion.code,
          discountType: program.rewardPromotion.discountType,
          fixedDiscountCents: program.rewardPromotion.fixedDiscountCents,
          percentageBasisPoints: program.rewardPromotion.percentageBasisPoints,
          minimumPriceCents: program.rewardPromotion.minimumPriceCents,
          serviceScope: program.rewardPromotion.serviceScope,
          appliesToPublicBookings: program.rewardPromotion.appliesToPublicBookings,
          appliesToStaffBookings: program.rewardPromotion.appliesToStaffBookings,
          serviceIds: program.rewardPromotion.services.map((row) => row.serviceId),
        }
      : null,
  };
}

async function getProgramWithTemplate(db: LoyaltyDb, barbershopId: string): Promise<ProgramWithTemplate | null> {
  return db.barbershopLoyaltyProgram.findUnique({
    where: { barbershopId },
    include: {
      rewardPromotion: {
        include: {
          services: {
            select: { serviceId: true },
          },
        },
      },
    },
  }) as Promise<ProgramWithTemplate | null>;
}

async function requireTemplatePromotion(db: LoyaltyDb, barbershopId: string, promotionId: string): Promise<RewardTemplateRecord> {
  const promotion = await db.promotion.findFirst({
    where: {
      id: promotionId,
      barbershopId,
      deletedAt: null,
    },
    include: {
      services: {
        select: { serviceId: true },
      },
      loyaltyReward: {
        select: { id: true },
      },
    },
  });

  if (!promotion) {
    throw new NotFoundError('Promotion');
  }

  return promotion as RewardTemplateRecord;
}

function generateOpaqueRewardCode(): string {
  const raw = crypto.randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9_-]/gu, '').toUpperCase();
  return raw.slice(0, 16);
}

export async function expireAvailableRewardsForCustomer(db: LoyaltyDb, input: {
  barbershopId: string;
  customerId: string;
  now: Date;
}): Promise<void> {
  const rewards = await db.loyaltyReward.findMany({
    where: {
      barbershopId: input.barbershopId,
      customerId: input.customerId,
      status: 'AVAILABLE',
      expiresAt: { lte: input.now },
    },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
  });

  if (rewards.length === 0) {
    return;
  }

  for (const reward of rewards) {
    const updated = await db.loyaltyReward.updateMany({
      where: {
        id: reward.id,
        status: 'AVAILABLE',
      },
      data: {
        status: 'EXPIRED',
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    await db.customerLoyaltySummary.upsert({
      where: { customerId: input.customerId },
      create: {
        barbershopId: input.barbershopId,
        customerId: input.customerId,
        currentStampCount: 0,
        lifetimeEligibleVisits: 0,
        availableRewardCount: 0,
      },
      update: {
        availableRewardCount: {
          decrement: 1,
        },
      },
    });

    await db.customerLoyaltySummary.updateMany({
      where: { customerId: input.customerId, availableRewardCount: { lt: 0 } },
      data: { availableRewardCount: 0 },
    });

    await db.loyaltyLedgerEvent.create({
      data: {
        barbershopId: input.barbershopId,
        customerId: input.customerId,
        loyaltyProgramId: reward.loyaltyProgramId,
        loyaltyRewardId: reward.id,
        eventType: 'REWARD_EXPIRED',
        stampDelta: 0,
        rewardDelta: -1,
        metadata: {
          expiresAt: reward.expiresAt?.toISOString() ?? null,
        },
      },
    });
  }
}

async function createIssuedReward(db: LoyaltyDb, input: {
  program: ProgramWithTemplate;
  customerId: string;
  barbershopId: string;
  sourceAppointmentId: string | null;
  userId: string;
  actorRole: UserRole;
  now: Date;
}) {
  const template = input.program.rewardPromotion;
  if (!template) {
    throw new AppError(409, 'LOYALTY_PROGRAM_MISCONFIGURED', 'Loyalty program reward template is missing');
  }

  const expiresAt = input.program.rewardValidityDays
    ? new Date(input.now.getTime() + input.program.rewardValidityDays * 24 * 60 * 60_000)
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateOpaqueRewardCode();
    try {
      const createdPromotion = await db.promotion.create({
        data: {
          barbershopId: input.barbershopId,
          name: `${template.name} • Loyalty reward`,
          code,
          codeNormalized: code,
          discountType: template.discountType,
          fixedDiscountCents: template.fixedDiscountCents,
          percentageBasisPoints: template.percentageBasisPoints,
          startsAt: input.now,
          endsAt: expiresAt ?? new Date(input.now.getTime() + 3650 * 24 * 60 * 60_000),
          isActive: true,
          appliesToPublicBookings: template.appliesToPublicBookings,
          appliesToStaffBookings: template.appliesToStaffBookings,
          maxActiveRedemptions: 1,
          maxRedemptionsPerCustomer: 1,
          minimumPriceCents: template.minimumPriceCents,
          serviceScope: template.serviceScope,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        },
      });

      if (template.serviceScope === 'SELECTED' && template.services.length > 0) {
        await db.promotionService.createMany({
          data: template.services.map((row) => ({
            promotionId: createdPromotion.id,
            serviceId: row.serviceId,
            barbershopId: input.barbershopId,
          })),
        });
      }

      const reward = await db.loyaltyReward.create({
        data: {
          barbershopId: input.barbershopId,
          customerId: input.customerId,
          loyaltyProgramId: input.program.id,
          promotionId: createdPromotion.id,
          ...(input.sourceAppointmentId ? { sourceAppointmentId: input.sourceAppointmentId } : {}),
          issuedAt: input.now,
          expiresAt,
          status: 'AVAILABLE',
        },
      });

      await db.loyaltyLedgerEvent.create({
        data: {
          barbershopId: input.barbershopId,
          customerId: input.customerId,
          loyaltyProgramId: input.program.id,
          loyaltyRewardId: reward.id,
          ...(input.sourceAppointmentId ? { sourceAppointmentId: input.sourceAppointmentId } : {}),
          actorUserId: input.userId,
          actorRole: input.actorRole,
          eventType: 'REWARD_ISSUED',
          stampDelta: 0,
          rewardDelta: 1,
          metadata: {
            promotionId: createdPromotion.id,
            code,
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        },
      });

      return reward;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError(500, 'LOYALTY_REWARD_CODE_GENERATION_FAILED', 'Failed to generate a unique loyalty reward code');
}

export async function processCompletedAppointmentLoyalty(db: LoyaltyDb, input: {
  appointmentId: string;
  barbershopId: string;
  customerId: string | null;
  userId: string;
  role: UserRole;
  now: Date;
}): Promise<void> {
  if (!input.customerId) {
    return;
  }

  const program = await getProgramWithTemplate(db, input.barbershopId);
  if (!program || !program.isEnabled || !program.rewardPromotion || program.rewardPromotion.deletedAt) {
    return;
  }

  const visitsRequired = assertVisitsRequired(program.visitsRequired);

  const stampEvent = await db.loyaltyLedgerEvent.createMany({
    data: [{
      barbershopId: input.barbershopId,
      customerId: input.customerId,
      loyaltyProgramId: program.id,
      sourceAppointmentId: input.appointmentId,
      actorUserId: input.userId,
      actorRole: input.role,
      eventType: 'STAMP_EARNED',
      stampDelta: 1,
      rewardDelta: 0,
    }],
    skipDuplicates: true,
  });

  if (stampEvent.count !== 1) {
    return;
  }

  await expireAvailableRewardsForCustomer(db, {
    barbershopId: input.barbershopId,
    customerId: input.customerId,
    now: input.now,
  });

  const summary = await db.customerLoyaltySummary.upsert({
    where: { customerId: input.customerId },
    create: {
      barbershopId: input.barbershopId,
      customerId: input.customerId,
      currentStampCount: 0,
      lifetimeEligibleVisits: 0,
      availableRewardCount: 0,
      lastEarnedAt: null,
    },
    update: {},
  });

  let nextStampCount = summary.currentStampCount + 1;
  let nextAvailableRewardCount = summary.availableRewardCount;

  while (nextStampCount >= visitsRequired) {
    nextStampCount -= visitsRequired;
    await createIssuedReward(db, {
      program,
      customerId: input.customerId,
      barbershopId: input.barbershopId,
      sourceAppointmentId: input.appointmentId,
      userId: input.userId,
      actorRole: input.role,
      now: input.now,
    });
    nextAvailableRewardCount += 1;
  }

  await db.customerLoyaltySummary.update({
    where: { customerId: input.customerId },
    data: {
      currentStampCount: nextStampCount,
      lifetimeEligibleVisits: summary.lifetimeEligibleVisits + 1,
      availableRewardCount: nextAvailableRewardCount,
      lastEarnedAt: input.now,
    },
  });
}

export async function consumeLoyaltyRewardForAppointment(db: LoyaltyDb, input: {
  appointmentId: string;
  now: Date;
}): Promise<void> {
  const redemption = await db.promotionRedemption.findUnique({
    where: { appointmentId: input.appointmentId },
    include: {
      promotion: {
        include: {
          loyaltyReward: true,
        },
      },
    },
  });

  const reward = redemption?.promotion.loyaltyReward;
  if (!redemption || !reward) {
    return;
  }

  const updated = await db.loyaltyReward.updateMany({
    where: {
      id: reward.id,
      status: 'AVAILABLE',
    },
    data: {
      status: 'REDEEMED',
      redeemedAt: input.now,
      redemptionAppointmentId: input.appointmentId,
    },
  });

  if (updated.count !== 1) {
    return;
  }

  await db.customerLoyaltySummary.updateMany({
    where: {
      customerId: reward.customerId,
      availableRewardCount: { gt: 0 },
    },
    data: {
      availableRewardCount: {
        decrement: 1,
      },
    },
  });

  await db.loyaltyLedgerEvent.create({
    data: {
      barbershopId: reward.barbershopId,
      customerId: reward.customerId,
      loyaltyProgramId: reward.loyaltyProgramId,
      loyaltyRewardId: reward.id,
      sourceAppointmentId: input.appointmentId,
      eventType: 'REWARD_REDEEMED',
      stampDelta: 0,
      rewardDelta: -1,
      metadata: {
        appointmentId: input.appointmentId,
      },
    },
  });
}

export async function getLoyaltyProgram(barbershopId: string): Promise<LoyaltyProgramDto> {
  return buildProgramDto(await getProgramWithTemplate(prisma, barbershopId));
}

export async function upsertLoyaltyProgram(barbershopId: string, userId: string, input: {
  isEnabled: boolean;
  visitsRequired: number;
  rewardPromotionId?: string | null;
  rewardValidityDays?: number | null;
}): Promise<LoyaltyProgramDto> {
  const visitsRequired = assertVisitsRequired(input.visitsRequired);
  const rewardValidityDays = assertRewardValidityDays(input.rewardValidityDays);

  return prisma.$transaction(async (tx) => {
    const rewardPromotion = input.rewardPromotionId
      ? await requireTemplatePromotion(tx, barbershopId, input.rewardPromotionId)
      : null;

    if (input.isEnabled && !rewardPromotion) {
      throw new AppError(400, 'LOYALTY_REWARD_PROMOTION_REQUIRED', 'An enabled loyalty program must reference a reward promotion');
    }

    if (rewardPromotion?.loyaltyReward) {
      throw new AppError(409, 'LOYALTY_REWARD_TEMPLATE_INVALID', 'Issued loyalty reward promotions cannot be reused as the template');
    }

    const program = await tx.barbershopLoyaltyProgram.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        isEnabled: input.isEnabled,
        visitsRequired,
        rewardPromotionId: rewardPromotion?.id ?? null,
        rewardValidityDays,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      update: {
        isEnabled: input.isEnabled,
        visitsRequired,
        rewardPromotionId: rewardPromotion?.id ?? null,
        rewardValidityDays,
        updatedByUserId: userId,
      },
      include: {
        rewardPromotion: {
          include: {
            services: {
              select: { serviceId: true },
            },
          },
        },
      },
    });

    return buildProgramDto(program as ProgramWithTemplate);
  });
}

export async function getCustomerLoyaltySummary(input: {
  barbershopId: string;
  customerId: string;
  now?: Date;
}): Promise<CustomerLoyaltySummaryDto | null> {
  const now = input.now ?? new Date();
  const customer = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      barbershopId: input.barbershopId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!customer) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await expireAvailableRewardsForCustomer(tx, {
      barbershopId: input.barbershopId,
      customerId: input.customerId,
      now,
    });
  });

  const [program, summary, rewards] = await Promise.all([
    getProgramWithTemplate(prisma, input.barbershopId),
    prisma.customerLoyaltySummary.findUnique({ where: { customerId: input.customerId } }),
    prisma.loyaltyReward.findMany({
      where: {
        barbershopId: input.barbershopId,
        customerId: input.customerId,
      },
      include: {
        promotion: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: 10,
    }),
  ]);

  const currentStampCount = summary?.currentStampCount ?? 0;
  const lifetimeEligibleVisits = summary?.lifetimeEligibleVisits ?? 0;
  const availableRewardCount = summary?.availableRewardCount ?? 0;

  return {
    customerId: input.customerId,
    visitsRequired: program?.visitsRequired ?? null,
    programEnabled: program?.isEnabled ?? false,
    currentStampCount,
    lifetimeEligibleVisits,
    availableRewardCount,
    lastEarnedAt: summary?.lastEarnedAt?.toISOString() ?? null,
    nextRewardProgress: {
      current: currentStampCount,
      target: program?.visitsRequired ?? null,
    },
    rewards: rewards.map((reward) => ({
      id: reward.id,
      code: reward.promotion.code,
      status: reward.status,
      issuedAt: reward.issuedAt.toISOString(),
      expiresAt: reward.expiresAt?.toISOString() ?? null,
      redeemedAt: reward.redeemedAt?.toISOString() ?? null,
      revokedAt: reward.revokedAt?.toISOString() ?? null,
      promotionName: reward.promotion.name,
    })),
  };
}

export async function listLoyaltyLedger(input: {
  barbershopId: string;
  page?: number;
  limit?: number;
  customerId?: string;
  now?: Date;
}): Promise<LoyaltyLedgerPageDto> {
  const page = Math.max(input.page ?? 1, 1);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const now = input.now ?? new Date();

  if (input.customerId) {
    await prisma.$transaction(async (tx) => {
      await expireAvailableRewardsForCustomer(tx, {
        barbershopId: input.barbershopId,
        customerId: input.customerId!,
        now,
      });
    });
  }

  const where: Prisma.LoyaltyLedgerEventWhereInput = {
    barbershopId: input.barbershopId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.loyaltyLedgerEvent.count({ where }),
    prisma.loyaltyLedgerEvent.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        actorUser: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      eventType: item.eventType,
      stampDelta: item.stampDelta,
      rewardDelta: item.rewardDelta,
      reason: item.reason,
      customerId: item.customerId,
      customerName: item.customer.name,
      sourceAppointmentId: item.sourceAppointmentId,
      loyaltyRewardId: item.loyaltyRewardId,
      actorRole: item.actorRole,
      actorDisplayName: item.actorUser?.name?.trim() || item.actorUser?.email || null,
      createdAt: item.createdAt.toISOString(),
    })),
    page,
    limit,
    total,
  };
}

export async function createLoyaltyAdminAdjustment(input: {
  barbershopId: string;
  customerId: string;
  userId: string;
  actorRole: UserRole;
  stampDelta: number;
  reason: string;
  now?: Date;
}): Promise<CustomerLoyaltySummaryDto> {
  const now = input.now ?? new Date();

  if (!Number.isInteger(input.stampDelta) || input.stampDelta === 0) {
    throw new BadRequestError('Stamp adjustment must be a non-zero integer');
  }

  const reason = normalizeOptionalReason(input.reason);
  if (!reason) {
    throw new BadRequestError('Adjustment reason is required');
  }

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: input.customerId,
        barbershopId: input.barbershopId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    const program = await getProgramWithTemplate(tx, input.barbershopId);
    await expireAvailableRewardsForCustomer(tx, {
      barbershopId: input.barbershopId,
      customerId: input.customerId,
      now,
    });

    const summary = await tx.customerLoyaltySummary.upsert({
      where: { customerId: input.customerId },
      create: {
        barbershopId: input.barbershopId,
        customerId: input.customerId,
        currentStampCount: 0,
        lifetimeEligibleVisits: 0,
        availableRewardCount: 0,
      },
      update: {},
    });

    const nextStampCount = summary.currentStampCount + input.stampDelta;
    if (nextStampCount < 0) {
      throw new AppError(409, 'LOYALTY_ADJUSTMENT_UNDERFLOW', 'Adjustment would make the customer stamp count negative');
    }

    await tx.loyaltyLedgerEvent.create({
      data: {
        barbershopId: input.barbershopId,
        customerId: input.customerId,
        loyaltyProgramId: program?.id ?? null,
        actorUserId: input.userId,
        actorRole: input.actorRole,
        eventType: 'ADMIN_ADJUSTMENT',
        stampDelta: input.stampDelta,
        rewardDelta: 0,
        reason,
      },
    });

    let finalStampCount = nextStampCount;
    let nextAvailableRewardCount = summary.availableRewardCount;
    if (input.stampDelta > 0 && program?.isEnabled && program.rewardPromotion) {
      while (finalStampCount >= program.visitsRequired) {
        finalStampCount -= program.visitsRequired;
        await createIssuedReward(tx, {
          program,
          customerId: input.customerId,
          barbershopId: input.barbershopId,
          sourceAppointmentId: null,
          userId: input.userId,
          actorRole: input.actorRole,
          now,
        });
        nextAvailableRewardCount += 1;
      }
    }

    await tx.customerLoyaltySummary.update({
      where: { customerId: input.customerId },
      data: {
        currentStampCount: finalStampCount,
        availableRewardCount: nextAvailableRewardCount,
      },
    });
  });

  const summary = await getCustomerLoyaltySummary({
    barbershopId: input.barbershopId,
    customerId: input.customerId,
    now,
  });

  if (!summary) {
    throw new NotFoundError('Customer');
  }

  return summary;
}
