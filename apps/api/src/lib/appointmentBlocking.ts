import type { AppointmentStatus } from '@prisma/client';

export const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
];

export function isBlockingAppointmentStatus(status: AppointmentStatus): boolean {
  return BLOCKING_APPOINTMENT_STATUSES.includes(status);
}
