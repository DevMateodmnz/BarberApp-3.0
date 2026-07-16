import { AppError, BadRequestError } from '../../lib/errors.js';
import { calculateDepositAmountCents } from '../../lib/payments/policy.js';
import { prisma } from '../../lib/prisma.js';
import type { DepositPolicyMode, Prisma } from '@prisma/client';

export interface DepositPolicyDto {
  mode: DepositPolicyMode;
  fixedAmountCents: number | null;
  percentageBasisPoints: number | null;
  holdDurationMinutes: number;
  currency: 'ARS';
  publicTerms: string | null;
}

export interface UpdateDepositPolicyInput {
  mode: DepositPolicyMode;
  fixedAmountCents?: number | null;
  percentageBasisPoints?: number | null;
  holdDurationMinutes: number;
  publicTerms?: string | null;
}

export async function ensureDepositPolicy(
  barbershopId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const existing = await db.barbershopDepositPolicy.findUnique({
    where: { barbershopId },
  });

  if (existing) {
    return existing;
  }

  return db.barbershopDepositPolicy.create({
    data: {
      barbershopId,
      mode: 'DISABLED',
      holdDurationMinutes: 15,
      currency: 'ARS',
    },
  });
}

function trimPublicTerms(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

export async function getDepositPolicy(barbershopId: string): Promise<DepositPolicyDto> {
  const policy = await ensureDepositPolicy(barbershopId);
  return {
    mode: policy.mode,
    fixedAmountCents: policy.fixedAmountCents,
    percentageBasisPoints: policy.percentageBasisPoints,
    holdDurationMinutes: policy.holdDurationMinutes,
    currency: 'ARS',
    publicTerms: policy.publicTerms,
  };
}

export async function updateDepositPolicy(
  barbershopId: string,
  input: UpdateDepositPolicyInput
): Promise<DepositPolicyDto> {
  if (input.holdDurationMinutes < 5 || input.holdDurationMinutes > 30) {
    throw new BadRequestError('Hold duration must be between 5 and 30 minutes');
  }

  const connection = await prisma.barbershopPaymentConnection.findUnique({
    where: {
      barbershopId_provider: {
        barbershopId,
        provider: 'MERCADO_PAGO',
      },
    },
  });

  if (input.mode !== 'DISABLED' && connection?.status !== 'CONNECTED') {
    throw new AppError(
      409,
      'PAYMENT_CONNECTION_REQUIRED',
      'Connect Mercado Pago before enabling deposits'
    );
  }

  if (input.mode !== 'DISABLED') {
    calculateDepositAmountCents({
      mode: input.mode,
      fixedAmountCents: input.fixedAmountCents ?? null,
      percentageBasisPoints: input.percentageBasisPoints ?? null,
      servicePriceCents: 10_000,
    });
  }

  const updated = await prisma.barbershopDepositPolicy.upsert({
    where: { barbershopId },
    create: {
      barbershopId,
      mode: input.mode,
      fixedAmountCents: input.mode === 'FIXED' ? input.fixedAmountCents ?? null : null,
      percentageBasisPoints:
        input.mode === 'PERCENTAGE' ? input.percentageBasisPoints ?? null : null,
      holdDurationMinutes: input.holdDurationMinutes,
      currency: 'ARS',
      publicTerms: trimPublicTerms(input.publicTerms),
    },
    update: {
      mode: input.mode,
      fixedAmountCents: input.mode === 'FIXED' ? input.fixedAmountCents ?? null : null,
      percentageBasisPoints:
        input.mode === 'PERCENTAGE' ? input.percentageBasisPoints ?? null : null,
      holdDurationMinutes: input.holdDurationMinutes,
      currency: 'ARS',
      publicTerms: trimPublicTerms(input.publicTerms),
    },
  });

  return {
    mode: updated.mode,
    fixedAmountCents: updated.fixedAmountCents,
    percentageBasisPoints: updated.percentageBasisPoints,
    holdDurationMinutes: updated.holdDurationMinutes,
    currency: 'ARS',
    publicTerms: updated.publicTerms,
  };
}

export async function getDepositPolicyPreviewForService(input: {
  barbershopId: string;
  servicePriceCents: number;
}) {
  const policy = await ensureDepositPolicy(input.barbershopId);

  if (policy.mode === 'DISABLED') {
    return {
      enabled: false as const,
      mode: policy.mode,
      amountCents: null,
      remainingAmountCents: null,
      holdDurationMinutes: policy.holdDurationMinutes,
      currency: 'ARS' as const,
      publicTerms: policy.publicTerms,
    };
  }

  const calculated = calculateDepositAmountCents({
    mode: policy.mode,
    fixedAmountCents: policy.fixedAmountCents,
    percentageBasisPoints: policy.percentageBasisPoints,
    servicePriceCents: input.servicePriceCents,
  });

  return {
    enabled: true as const,
    mode: policy.mode,
    amountCents: calculated.amountCents,
    remainingAmountCents: input.servicePriceCents - calculated.amountCents,
    holdDurationMinutes: policy.holdDurationMinutes,
    currency: 'ARS' as const,
    publicTerms: policy.publicTerms,
  };
}
