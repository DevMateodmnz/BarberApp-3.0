import { Prisma, type PromotionDiscountType, type PromotionRedemptionReleaseReason, type PromotionRedemptionStatus, type PromotionServiceScope } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const PUBLIC_PROMOTION_UNAVAILABLE_CODE = 'PROMOTION_NOT_AVAILABLE';
export const PROMOTION_USAGE_LIMIT_REACHED_CODE = 'PROMOTION_USAGE_LIMIT_REACHED';
export const PROMOTION_CUSTOMER_IDENTITY_REQUIRED_CODE = 'PROMOTION_CUSTOMER_IDENTITY_REQUIRED';
export const PAID_APPOINTMENT_REPRICE_NOT_SUPPORTED_CODE = 'PAID_APPOINTMENT_REPRICE_NOT_SUPPORTED';
export const PROMOTION_IMMUTABLE_AFTER_USE_CODE = 'PROMOTION_IMMUTABLE_AFTER_USE';

export type PromotionDb = Prisma.TransactionClient | typeof prisma;
export type PromotionBookingChannel = 'PUBLIC' | 'STAFF';

export interface PromotionPricingSnapshot {
  servicePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
}

export interface PromotionEvaluationSuccess extends PromotionPricingSnapshot {
  eligible: true;
  promotion: {
    id: string;
    name: string;
    code: string;
    codeNormalized: string;
    discountType: PromotionDiscountType;
    fixedDiscountCents: number | null;
    percentageBasisPoints: number | null;
    maxRedemptionsPerCustomer: number | null;
  };
  policyValueSnapshot: number;
}

export interface PromotionEvaluationFailure {
  eligible: false;
  safeFailureCode: string;
  reason:
    | 'NOT_FOUND'
    | 'INACTIVE'
    | 'DELETED'
    | 'UPCOMING'
    | 'EXPIRED'
    | 'WRONG_CHANNEL'
    | 'WRONG_SERVICE'
    | 'MINIMUM_PRICE'
    | 'TOTAL_LIMIT'
    | 'PER_CUSTOMER_LIMIT'
    | 'CUSTOMER_IDENTITY_REQUIRED'
    | 'INVALID_POLICY';
}

export type PromotionEvaluationResult = PromotionEvaluationSuccess | PromotionEvaluationFailure;

export interface PromotionSummaryDto {
  activePromotions: number;
  upcomingPromotions: number;
  totalConsumedRedemptions: number;
  totalDiscountCents: number;
  reservedRedemptions: number;
  releasedRedemptions: number;
}

export function normalizePromotionCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/gu, '');
  if (!/^[A-Z0-9_-]{3,32}$/u.test(normalized)) {
    throw new AppError(400, 'PROMOTION_CODE_INVALID', 'Promotion code must use 3-32 characters: letters, numbers, hyphen, or underscore');
  }
  return normalized;
}

export function calculatePromotionDiscountCents(input: {
  discountType: PromotionDiscountType;
  fixedDiscountCents: number | null;
  percentageBasisPoints: number | null;
  servicePriceCents: number;
}): PromotionPricingSnapshot {
  if (!Number.isInteger(input.servicePriceCents) || input.servicePriceCents < 0) {
    throw new BadRequestError('Service price must be a non-negative integer amount in cents');
  }

  let discountCents = 0;
  if (input.discountType === 'FIXED') {
    if (!Number.isInteger(input.fixedDiscountCents) || (input.fixedDiscountCents ?? 0) <= 0) {
      throw new BadRequestError('Fixed discount must be a positive integer amount in cents');
    }
    discountCents = Math.min(input.fixedDiscountCents!, input.servicePriceCents);
  } else {
    const basisPoints = input.percentageBasisPoints;
    if (!Number.isInteger(basisPoints) || basisPoints! <= 0 || basisPoints! > 10_000) {
      throw new BadRequestError('Percentage discount must be between 1 and 10000 basis points');
    }
    discountCents = Math.floor(((input.servicePriceCents * basisPoints!) + 5000) / 10000);
    discountCents = Math.min(discountCents, input.servicePriceCents);
  }

  return {
    servicePriceCents: input.servicePriceCents,
    discountCents,
    finalPriceCents: input.servicePriceCents - discountCents,
  };
}

async function getPromotionRowForEvaluation(db: PromotionDb, input: {
  barbershopId: string;
  codeNormalized: string;
}) {
  return db.promotion.findFirst({
    where: {
      barbershopId: input.barbershopId,
      codeNormalized: input.codeNormalized,
    },
    include: {
      services: {
        select: {
          serviceId: true,
        },
      },
    },
  });
}

export async function evaluatePromotion(db: PromotionDb, input: {
  barbershopId: string;
  code: string;
  serviceId: string;
  servicePriceCents: number;
  bookingChannel: PromotionBookingChannel;
  customerId: string | null;
  now: Date;
  publicSafe?: boolean;
}): Promise<PromotionEvaluationResult> {
  const codeNormalized = normalizePromotionCode(input.code);
  const promotion = await getPromotionRowForEvaluation(db, {
    barbershopId: input.barbershopId,
    codeNormalized,
  });

  const fail = (reason: PromotionEvaluationFailure['reason'], code?: string): PromotionEvaluationFailure => ({
    eligible: false,
    reason,
    safeFailureCode: input.publicSafe ? PUBLIC_PROMOTION_UNAVAILABLE_CODE : (code ?? PUBLIC_PROMOTION_UNAVAILABLE_CODE),
  });

  if (!promotion) return fail('NOT_FOUND');
  if (promotion.deletedAt) return fail('DELETED');
  if (!promotion.isActive) return fail('INACTIVE');
  if (promotion.startsAt.getTime() > input.now.getTime()) return fail('UPCOMING');
  if (promotion.endsAt.getTime() <= input.now.getTime()) return fail('EXPIRED');
  if (input.bookingChannel === 'PUBLIC' && !promotion.appliesToPublicBookings) return fail('WRONG_CHANNEL');
  if (input.bookingChannel === 'STAFF' && !promotion.appliesToStaffBookings) return fail('WRONG_CHANNEL');
  if (promotion.serviceScope === 'SELECTED' && !promotion.services.some((row) => row.serviceId === input.serviceId)) {
    return fail('WRONG_SERVICE');
  }
  if (promotion.minimumPriceCents !== null && input.servicePriceCents < promotion.minimumPriceCents) {
    return fail('MINIMUM_PRICE');
  }
  if (promotion.maxActiveRedemptions !== null && promotion.activeRedemptionCount >= promotion.maxActiveRedemptions) {
    return fail('TOTAL_LIMIT', PROMOTION_USAGE_LIMIT_REACHED_CODE);
  }
  if (promotion.maxRedemptionsPerCustomer !== null) {
    if (!input.customerId) {
      return fail('CUSTOMER_IDENTITY_REQUIRED', PROMOTION_CUSTOMER_IDENTITY_REQUIRED_CODE);
    }
    const usage = await db.promotionCustomerUsage.findUnique({
      where: {
        promotionId_customerId: {
          promotionId: promotion.id,
          customerId: input.customerId,
        },
      },
    });
    if ((usage?.activeRedemptionCount ?? 0) >= promotion.maxRedemptionsPerCustomer) {
      return fail('PER_CUSTOMER_LIMIT', PROMOTION_USAGE_LIMIT_REACHED_CODE);
    }
  }

  const pricing = calculatePromotionDiscountCents({
    discountType: promotion.discountType,
    fixedDiscountCents: promotion.fixedDiscountCents,
    percentageBasisPoints: promotion.percentageBasisPoints,
    servicePriceCents: input.servicePriceCents,
  });

  return {
    eligible: true,
    ...pricing,
    promotion: {
      id: promotion.id,
      name: promotion.name,
      code: promotion.code,
      codeNormalized: promotion.codeNormalized,
      discountType: promotion.discountType,
      fixedDiscountCents: promotion.fixedDiscountCents,
      percentageBasisPoints: promotion.percentageBasisPoints,
      maxRedemptionsPerCustomer: promotion.maxRedemptionsPerCustomer,
    },
    policyValueSnapshot: promotion.discountType === 'FIXED'
      ? (promotion.fixedDiscountCents ?? 0)
      : (promotion.percentageBasisPoints ?? 0),
  };
}

async function reservePromotionAggregate(db: PromotionDb, input: {
  promotionId: string;
}): Promise<void> {
  const updated = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE promotions
    SET active_redemption_count = active_redemption_count + 1
    WHERE id = ${input.promotionId}
      AND (
        max_active_redemptions IS NULL
        OR active_redemption_count < max_active_redemptions
      )
    RETURNING id
  `;

  if (updated.length !== 1) {
    throw new AppError(409, PROMOTION_USAGE_LIMIT_REACHED_CODE, 'Promotion usage limit reached');
  }
}

async function reservePromotionCustomerAggregate(db: PromotionDb, input: {
  barbershopId: string;
  promotionId: string;
  customerId: string | null;
  maxRedemptionsPerCustomer: number | null;
}): Promise<void> {
  if (input.maxRedemptionsPerCustomer === null) {
    return;
  }
  if (!input.customerId) {
    throw new AppError(409, PROMOTION_CUSTOMER_IDENTITY_REQUIRED_CODE, 'A customer identity is required for this promotion');
  }

  await db.promotionCustomerUsage.upsert({
    where: {
      promotionId_customerId: {
        promotionId: input.promotionId,
        customerId: input.customerId,
      },
    },
    update: {},
    create: {
      barbershopId: input.barbershopId,
      promotionId: input.promotionId,
      customerId: input.customerId,
    },
  });

  const updated = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE promotion_customer_usages
    SET active_redemption_count = active_redemption_count + 1
    WHERE promotion_id = ${input.promotionId}
      AND customer_id = ${input.customerId}
      AND active_redemption_count < ${input.maxRedemptionsPerCustomer}
    RETURNING id
  `;

  if (updated.length !== 1) {
    throw new AppError(409, PROMOTION_USAGE_LIMIT_REACHED_CODE, 'Promotion usage limit reached for this customer');
  }
}

async function decrementPromotionAggregate(db: PromotionDb, promotionId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE promotions
    SET active_redemption_count = GREATEST(active_redemption_count - 1, 0)
    WHERE id = ${promotionId}
  `;
}

async function decrementPromotionCustomerAggregate(db: PromotionDb, input: {
  promotionId: string;
  customerId: string | null;
}): Promise<void> {
  if (!input.customerId) return;
  await db.$executeRaw`
    UPDATE promotion_customer_usages
    SET active_redemption_count = GREATEST(active_redemption_count - 1, 0)
    WHERE promotion_id = ${input.promotionId}
      AND customer_id = ${input.customerId}
  `;
}

export async function createPromotionRedemption(db: PromotionDb, input: {
  promotionEvaluation: PromotionEvaluationSuccess;
  barbershopId: string;
  appointmentId: string;
  customerId: string | null;
  status: PromotionRedemptionStatus;
  now: Date;
}) {
  await reservePromotionAggregate(db, {
    promotionId: input.promotionEvaluation.promotion.id,
  });
  await reservePromotionCustomerAggregate(db, {
    barbershopId: input.barbershopId,
    promotionId: input.promotionEvaluation.promotion.id,
    customerId: input.customerId,
    maxRedemptionsPerCustomer: input.promotionEvaluation.promotion.maxRedemptionsPerCustomer,
  });

  return db.promotionRedemption.create({
    data: {
      barbershopId: input.barbershopId,
      promotionId: input.promotionEvaluation.promotion.id,
      appointmentId: input.appointmentId,
      customerId: input.customerId,
      status: input.status,
      codeSnapshot: input.promotionEvaluation.promotion.code,
      promotionNameSnapshot: input.promotionEvaluation.promotion.name,
      discountTypeSnapshot: input.promotionEvaluation.promotion.discountType,
      policyValueSnapshot: input.promotionEvaluation.policyValueSnapshot,
      servicePriceCents: input.promotionEvaluation.servicePriceCents,
      discountCents: input.promotionEvaluation.discountCents,
      finalPriceCents: input.promotionEvaluation.finalPriceCents,
      reservedAt: input.now,
      consumedAt: input.status === 'CONSUMED' ? input.now : null,
    },
  });
}

export async function consumeReservedPromotionRedemptionForAppointment(db: PromotionDb, input: {
  appointmentId: string;
  now: Date;
}): Promise<boolean> {
  const result = await db.promotionRedemption.updateMany({
    where: {
      appointmentId: input.appointmentId,
      status: 'RESERVED',
    },
    data: {
      status: 'CONSUMED',
      consumedAt: input.now,
      releasedAt: null,
      releaseReason: null,
    },
  });
  return result.count === 1;
}

export async function releaseReservedPromotionRedemptionForAppointment(db: PromotionDb, input: {
  appointmentId: string;
  reason: PromotionRedemptionReleaseReason;
  now: Date;
}): Promise<boolean> {
  const redemption = await db.promotionRedemption.findFirst({
    where: {
      appointmentId: input.appointmentId,
      status: 'RESERVED',
    },
  });
  if (!redemption) {
    return false;
  }

  const result = await db.promotionRedemption.updateMany({
    where: {
      id: redemption.id,
      status: 'RESERVED',
    },
    data: {
      status: 'RELEASED',
      releasedAt: input.now,
      releaseReason: input.reason,
    },
  });

  if (result.count !== 1) {
    return false;
  }

  await decrementPromotionAggregate(db, redemption.promotionId);
  await decrementPromotionCustomerAggregate(db, {
    promotionId: redemption.promotionId,
    customerId: redemption.customerId,
  });
  return true;
}

export async function getPromotionRedemptionForAppointment(db: PromotionDb, appointmentId: string) {
  return db.promotionRedemption.findUnique({
    where: { appointmentId },
  });
}

export async function listBarbershopPromotions(barbershopId: string, now: Date = new Date()) {
  const items = await prisma.promotion.findMany({
    where: { barbershopId, deletedAt: null },
    include: {
      services: {
        select: { serviceId: true, service: { select: { name: true } } },
      },
      _count: {
        select: { redemptions: true },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    codeNormalized: item.codeNormalized,
    discountType: item.discountType,
    fixedDiscountCents: item.fixedDiscountCents,
    percentageBasisPoints: item.percentageBasisPoints,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    isActive: item.isActive,
    appliesToPublicBookings: item.appliesToPublicBookings,
    appliesToStaffBookings: item.appliesToStaffBookings,
    maxActiveRedemptions: item.maxActiveRedemptions,
    maxRedemptionsPerCustomer: item.maxRedemptionsPerCustomer,
    activeRedemptionCount: item.activeRedemptionCount,
    minimumPriceCents: item.minimumPriceCents,
    serviceScope: item.serviceScope,
    usageCount: item._count.redemptions,
    status: item.deletedAt
      ? 'DELETED'
      : !item.isActive
        ? 'INACTIVE'
        : item.startsAt.getTime() > now.getTime()
          ? 'UPCOMING'
          : item.endsAt.getTime() <= now.getTime()
            ? 'EXPIRED'
            : 'ACTIVE',
    services: item.services.map((row) => ({ id: row.serviceId, name: row.service.name })),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));
}

export async function getPromotionSummary(barbershopId: string, now: Date = new Date()): Promise<PromotionSummaryDto> {
  const [activePromotions, upcomingPromotions, aggregates] = await Promise.all([
    prisma.promotion.count({ where: { barbershopId, deletedAt: null, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } }),
    prisma.promotion.count({ where: { barbershopId, deletedAt: null, startsAt: { gt: now } } }),
    prisma.promotionRedemption.groupBy({
      by: ['status'],
      where: { barbershopId },
      _count: { _all: true },
      _sum: { discountCents: true },
    }),
  ]);

  return {
    activePromotions,
    upcomingPromotions,
    totalConsumedRedemptions: aggregates.find((row) => row.status === 'CONSUMED')?._count._all ?? 0,
    totalDiscountCents: aggregates.find((row) => row.status === 'CONSUMED')?._sum.discountCents ?? 0,
    reservedRedemptions: aggregates.find((row) => row.status === 'RESERVED')?._count._all ?? 0,
    releasedRedemptions: aggregates.find((row) => row.status === 'RELEASED')?._count._all ?? 0,
  };
}

function validatePromotionPayload(input: {
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  fixedDiscountCents?: number | null;
  percentageBasisPoints?: number | null;
  startsAt: string;
  endsAt: string;
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  maxActiveRedemptions?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  minimumPriceCents?: number | null;
  serviceScope: PromotionServiceScope;
  serviceIds?: string[];
}) {
  const name = input.name.trim();
  if (!name) throw new AppError(400, 'PROMOTION_NAME_REQUIRED', 'Promotion name is required');
  const codeNormalized = normalizePromotionCode(input.code);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt.getTime() >= endsAt.getTime()) {
    throw new AppError(400, 'PROMOTION_WINDOW_INVALID', 'Promotion validity window is invalid');
  }
  if (!input.appliesToPublicBookings && !input.appliesToStaffBookings) {
    throw new AppError(400, 'PROMOTION_CHANNEL_REQUIRED', 'Promotion must be available in at least one booking channel');
  }
  if (input.maxActiveRedemptions !== undefined && input.maxActiveRedemptions !== null && (!Number.isInteger(input.maxActiveRedemptions) || input.maxActiveRedemptions < 1)) {
    throw new AppError(400, 'PROMOTION_LIMIT_INVALID', 'Total usage limit must be a positive integer');
  }
  if (input.maxRedemptionsPerCustomer !== undefined && input.maxRedemptionsPerCustomer !== null && (!Number.isInteger(input.maxRedemptionsPerCustomer) || input.maxRedemptionsPerCustomer < 1 || input.maxRedemptionsPerCustomer > 1000)) {
    throw new AppError(400, 'PROMOTION_LIMIT_INVALID', 'Per-customer usage limit must be a positive integer');
  }
  if (input.minimumPriceCents !== undefined && input.minimumPriceCents !== null && (!Number.isInteger(input.minimumPriceCents) || input.minimumPriceCents < 0)) {
    throw new AppError(400, 'PROMOTION_MINIMUM_INVALID', 'Minimum price must be a non-negative integer');
  }
  calculatePromotionDiscountCents({
    discountType: input.discountType,
    fixedDiscountCents: input.fixedDiscountCents ?? null,
    percentageBasisPoints: input.percentageBasisPoints ?? null,
    servicePriceCents: Math.max(input.minimumPriceCents ?? 10_000, 10_000),
  });
  if (input.serviceScope === 'SELECTED' && (!input.serviceIds || input.serviceIds.length === 0)) {
    throw new AppError(400, 'PROMOTION_SERVICE_SCOPE_INVALID', 'Selected-service promotions must choose at least one service');
  }

  return {
    name,
    codeNormalized,
    startsAt,
    endsAt,
  };
}

export async function createPromotion(barbershopId: string, userId: string, input: {
  name: string;
  code: string;
  discountType: PromotionDiscountType;
  fixedDiscountCents?: number | null;
  percentageBasisPoints?: number | null;
  startsAt: string;
  endsAt: string;
  appliesToPublicBookings: boolean;
  appliesToStaffBookings: boolean;
  maxActiveRedemptions?: number | null;
  maxRedemptionsPerCustomer?: number | null;
  minimumPriceCents?: number | null;
  serviceScope: PromotionServiceScope;
  serviceIds?: string[];
}) {
  const validated = validatePromotionPayload(input);
  const serviceIds = Array.from(new Set(input.serviceIds ?? []));

  return prisma.$transaction(async (tx) => {
    if (serviceIds.length > 0) {
      const count = await tx.service.count({ where: { barbershopId, id: { in: serviceIds }, isActive: true, deletedAt: null } });
      if (count !== serviceIds.length) {
        throw new NotFoundError('Service');
      }
    }

    const created = await tx.promotion.create({
      data: {
        barbershopId,
        name: validated.name,
        code: input.code.trim(),
        codeNormalized: validated.codeNormalized,
        discountType: input.discountType,
        fixedDiscountCents: input.discountType === 'FIXED' ? input.fixedDiscountCents ?? null : null,
        percentageBasisPoints: input.discountType === 'PERCENTAGE' ? input.percentageBasisPoints ?? null : null,
        startsAt: validated.startsAt,
        endsAt: validated.endsAt,
        appliesToPublicBookings: input.appliesToPublicBookings,
        appliesToStaffBookings: input.appliesToStaffBookings,
        maxActiveRedemptions: input.maxActiveRedemptions ?? null,
        maxRedemptionsPerCustomer: input.maxRedemptionsPerCustomer ?? null,
        minimumPriceCents: input.minimumPriceCents ?? null,
        serviceScope: input.serviceScope,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });

    if (input.serviceScope === 'SELECTED' && serviceIds.length > 0) {
      await tx.promotionService.createMany({
        data: serviceIds.map((serviceId) => ({
          promotionId: created.id,
          serviceId,
          barbershopId,
        })),
      });
    }

    return created;
  });
}

export async function getPromotionDetail(barbershopId: string, promotionId: string) {
  const promotion = await prisma.promotion.findFirst({
    where: { id: promotionId, barbershopId },
    include: {
      services: { include: { service: { select: { id: true, name: true, isActive: true } } } },
      _count: { select: { redemptions: true } },
    },
  });
  if (!promotion) throw new NotFoundError('Promotion');
  return promotion;
}

export async function updatePromotion(barbershopId: string, promotionId: string, userId: string, input: {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  appliesToPublicBookings?: boolean;
  appliesToStaffBookings?: boolean;
  isActive?: boolean;
}) {
  const promotion = await prisma.promotion.findFirst({ where: { id: promotionId, barbershopId } });
  if (!promotion) throw new NotFoundError('Promotion');
  const redemptionCount = await prisma.promotionRedemption.count({ where: { promotionId } });
  if (redemptionCount > 0 && (input.name === undefined && input.startsAt === undefined && input.endsAt === undefined && input.appliesToPublicBookings === undefined && input.appliesToStaffBookings === undefined && input.isActive === undefined)) {
    throw new AppError(409, PROMOTION_IMMUTABLE_AFTER_USE_CODE, 'Used promotions only allow limited future-facing updates');
  }
  return prisma.promotion.update({
    where: { id: promotionId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
      ...(input.endsAt !== undefined ? { endsAt: new Date(input.endsAt) } : {}),
      ...(input.appliesToPublicBookings !== undefined ? { appliesToPublicBookings: input.appliesToPublicBookings } : {}),
      ...(input.appliesToStaffBookings !== undefined ? { appliesToStaffBookings: input.appliesToStaffBookings } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedByUserId: userId,
    },
  });
}

export async function setPromotionActive(barbershopId: string, promotionId: string, userId: string, isActive: boolean) {
  const promotion = await prisma.promotion.findFirst({ where: { id: promotionId, barbershopId } });
  if (!promotion) throw new NotFoundError('Promotion');
  return prisma.promotion.update({ where: { id: promotionId }, data: { isActive, updatedByUserId: userId } });
}

export async function listPromotionRedemptions(barbershopId: string, promotionId: string, input: {
  status?: PromotionRedemptionStatus;
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  const where: Prisma.PromotionRedemptionWhereInput = {
    barbershopId,
    promotionId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          createdAt: {
            ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.promotionRedemption.findMany({
      where,
      include: {
        appointment: {
          select: {
            id: true,
            clientName: true,
            serviceName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.promotionRedemption.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      appointmentId: item.appointmentId,
      customerDisplayName: item.appointment.clientName,
      serviceName: item.appointment.serviceName,
      status: item.status,
      servicePriceCents: item.servicePriceCents,
      discountCents: item.discountCents,
      finalPriceCents: item.finalPriceCents,
      reservedAt: item.reservedAt.toISOString(),
      consumedAt: item.consumedAt?.toISOString() ?? null,
      releasedAt: item.releasedAt?.toISOString() ?? null,
      safeReleaseReason: item.releaseReason,
    })),
    total,
    page: input.page,
    limit: input.limit,
  };
}

export async function findCustomerIdByPhone(barbershopId: string, phoneNormalized: string | null) {
  if (!phoneNormalized) return null;
  const customer = await prisma.customer.findFirst({
    where: {
      barbershopId,
      phoneNormalized,
      deletedAt: null,
    },
    select: { id: true },
  });
  return customer?.id ?? null;
}
