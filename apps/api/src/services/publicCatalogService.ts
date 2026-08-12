import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { getPublicBookingConsent } from '../lib/publicBookingConsent.js';
import { getPublicBookingPolicy } from '../lib/publicBookingPolicy.js';
import { validatePublicSlug } from '../lib/publicSlug.js';
import { getDepositPolicyPreviewForService } from './payments/depositPolicyService.js';
import type { PaymentRuntimeConfig } from '../lib/payments/runtime.js';

export interface PublicBarbershopDto {
  slug: string;
  name: string;
  timezone: string;
}

export interface PublicServiceDto {
  serviceId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  depositRequired: boolean;
  depositAmountCents: number | null;
  remainingAmountCents: number | null;
}

export interface PublicBarberDto {
  barberId: string;
  displayName: string;
}

export interface PublicBookingConfigDto {
  consent: {
    version: string;
    text: string;
  };
  policy: {
    minimumNoticeMinutes: number;
    maximumBookingHorizonDays: number;
    slotIntervalMinutes: number;
  };
  depositPolicy: {
    enabled: boolean;
    mode: 'DISABLED' | 'FIXED' | 'PERCENTAGE';
    holdDurationMinutes: number;
    currency: 'ARS';
    publicTerms: string | null;
  };
}

interface ResolvedPublicBarbershop {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

function createPublicNotFoundError(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Public resource not found');
}

function toPublicBarbershopDto(
  barbershop: ResolvedPublicBarbershop
): PublicBarbershopDto {
  return {
    slug: barbershop.slug,
    name: barbershop.name,
    timezone: barbershop.timezone,
  };
}

function resolvePublicBarberDisplayName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Barber';
}

export async function resolvePublishedPublicBarbershop(
  slug: string
): Promise<ResolvedPublicBarbershop> {
  if (!validatePublicSlug(slug).success) {
    throw createPublicNotFoundError();
  }

  const barbershop = await prisma.barbershop.findFirst({
    where: {
      publicSlug: slug,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      publicSlug: true,
      name: true,
      timezone: true,
    },
  });

  if (!barbershop?.publicSlug) {
    throw createPublicNotFoundError();
  }

  return {
    id: barbershop.id,
    slug: barbershop.publicSlug,
    name: barbershop.name,
    timezone: barbershop.timezone,
  };
}

export async function getPublicBarbershopBySlug(
  slug: string
): Promise<PublicBarbershopDto> {
  return toPublicBarbershopDto(await resolvePublishedPublicBarbershop(slug));
}

export async function listPublicServicesBySlug(
  slug: string,
  paymentRuntime?: PaymentRuntimeConfig
): Promise<PublicServiceDto[]> {
  const barbershop = await resolvePublishedPublicBarbershop(slug);

  const services = await prisma.service.findMany({
    where: {
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
      currency: true,
    },
  });

  const result: PublicServiceDto[] = [];

  for (const service of services) {
    const depositPreview = await getDepositPolicyPreviewForService({
      barbershopId: barbershop.id,
      servicePriceCents: service.priceCents,
      paymentRuntime,
    });

    result.push({
      serviceId: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      currency: service.currency,
      depositRequired: depositPreview.enabled,
      depositAmountCents: depositPreview.amountCents,
      remainingAmountCents: depositPreview.remainingAmountCents,
    });
  }

  return result;
}

export async function listEligiblePublicBarbersBySlug(
  slug: string,
  serviceId: string
): Promise<PublicBarberDto[]> {
  const barbershop = await resolvePublishedPublicBarbershop(slug);

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!service) {
    throw createPublicNotFoundError();
  }

  const employees = await prisma.employee.findMany({
    where: {
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
      employeeServices: {
        some: {
          serviceId: service.id,
          service: {
            isActive: true,
            deletedAt: null,
            barbershopId: barbershop.id,
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  return employees.map((employee) => ({
    barberId: employee.id,
    displayName: resolvePublicBarberDisplayName(employee.user.name),
  }));
}

export async function getPublicBookingConfigBySlug(
  slug: string,
  paymentRuntime?: PaymentRuntimeConfig
): Promise<PublicBookingConfigDto> {
  const barbershop = await resolvePublishedPublicBarbershop(slug);

  const consent = getPublicBookingConsent();
  const policy = getPublicBookingPolicy();
  const depositPolicy = await getDepositPolicyPreviewForService({
    barbershopId: barbershop.id,
    servicePriceCents: 10_000,
    paymentRuntime,
  });

  return {
    consent: {
      version: consent.version,
      text: consent.text,
    },
    policy: {
      minimumNoticeMinutes: policy.minimumNoticeMinutes,
      maximumBookingHorizonDays: policy.maximumBookingHorizonDays,
      slotIntervalMinutes: policy.slotIntervalMinutes,
    },
    depositPolicy: {
      enabled: depositPolicy.enabled,
      mode: depositPolicy.mode,
      holdDurationMinutes: depositPolicy.holdDurationMinutes,
      currency: depositPolicy.currency,
      publicTerms: depositPolicy.publicTerms,
    },
  };
}
