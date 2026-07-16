import type { Prisma } from '@prisma/client';
import type { AppointmentStatus } from '@prisma/client';

export interface BlockingAppointmentLike {
  status: AppointmentStatus;
  paymentHoldExpiresAt: Date | null;
}

export function isBlockingAppointment(
  appointment: BlockingAppointmentLike,
  now: Date = new Date()
): boolean {
  if (appointment.status === 'CONFIRMED' || appointment.status === 'IN_PROGRESS') {
    return true;
  }

  if (appointment.status !== 'PENDING') {
    return false;
  }

  return Boolean(
    appointment.paymentHoldExpiresAt && appointment.paymentHoldExpiresAt.getTime() > now.getTime()
  );
}

export function buildBlockingAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  return {
    OR: [
      { status: 'CONFIRMED' },
      { status: 'IN_PROGRESS' },
      {
        status: 'PENDING',
        paymentHoldExpiresAt: { gt: now },
      },
    ],
  };
}
