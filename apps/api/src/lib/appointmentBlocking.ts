import type { Prisma } from '@prisma/client';
import type { AppointmentStatus } from '@prisma/client';
import { buildBlockingAppointmentWhere, isBlockingAppointment } from './payments/blocking.js';

export const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
];

export function isBlockingAppointmentStatus(
  status: AppointmentStatus,
  paymentHoldExpiresAt: Date | null = null,
  now: Date = new Date()
): boolean {
  return isBlockingAppointment({ status, paymentHoldExpiresAt }, now);
}

export function buildBlockingAppointmentWhereInput(now: Date): Prisma.AppointmentWhereInput {
  return buildBlockingAppointmentWhere(now);
}
