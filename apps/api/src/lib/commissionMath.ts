import { BadRequestError } from './errors.js';

export const MAX_COMMISSION_BASIS_POINTS = 10_000;

export function calculateCommissionCents(
  grossAmountCents: number,
  percentageBasisPoints: number
): number {
  if (!Number.isSafeInteger(grossAmountCents) || grossAmountCents < 0) {
    throw new BadRequestError('Appointment final price is not valid for commission accrual');
  }
  if (
    !Number.isInteger(percentageBasisPoints) ||
    percentageBasisPoints < 0 ||
    percentageBasisPoints > MAX_COMMISSION_BASIS_POINTS
  ) {
    throw new BadRequestError('Commission percentage must be between 0 and 100 percent');
  }

  const numerator = grossAmountCents * percentageBasisPoints;
  if (!Number.isSafeInteger(numerator)) {
    throw new BadRequestError('Commission amount exceeds the supported range');
  }

  // Exact integer arithmetic, rounded half-up to the nearest cent.
  return Math.floor((numerator + 5_000) / 10_000);
}
