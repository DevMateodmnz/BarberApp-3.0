import { BadRequestError } from '../errors.js';
import type { DepositPolicyMode } from '@prisma/client';

export interface DepositPolicySnapshot {
  mode: DepositPolicyMode;
  valueSnapshot: number;
  amountCents: number;
  currency: 'ARS';
  holdDurationMinutes: number;
  publicTerms: string | null;
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function calculateDepositAmountCents(input: {
  mode: DepositPolicyMode;
  fixedAmountCents: number | null;
  percentageBasisPoints: number | null;
  servicePriceCents: number;
}): { amountCents: number; valueSnapshot: number } {
  if (input.servicePriceCents <= 0) {
    throw new BadRequestError('Service price must be greater than zero');
  }

  if (input.mode === 'DISABLED') {
    return { amountCents: 0, valueSnapshot: 0 };
  }

  if (input.mode === 'FIXED') {
    const fixed = input.fixedAmountCents ?? 0;
    if (fixed <= 0) {
      throw new BadRequestError('Fixed deposit amount must be greater than zero');
    }
    if (fixed > input.servicePriceCents) {
      throw new BadRequestError('Fixed deposit amount cannot exceed service price');
    }
    return { amountCents: fixed, valueSnapshot: fixed };
  }

  const basisPoints = input.percentageBasisPoints ?? 0;
  if (basisPoints <= 0 || basisPoints > 10000) {
    throw new BadRequestError('Percentage deposit must be between 1 and 10000 basis points');
  }

  const amount = roundHalfUp((input.servicePriceCents * basisPoints) / 10000);
  if (amount <= 0) {
    throw new BadRequestError('Calculated deposit amount must be greater than zero');
  }
  if (amount > input.servicePriceCents) {
    throw new BadRequestError('Calculated deposit amount cannot exceed service price');
  }

  return { amountCents: amount, valueSnapshot: basisPoints };
}
