/**
 * Barbershop business logic service
 *
 * Provides barbershop creation with automatic default WorkingHours setup.
 * Keeps tenant isolation and reuses existing validation patterns.
 */
import { prisma } from '../lib/prisma.js';
import type { Barbershop } from '@prisma/client';

/** Default working hours: Monday-Friday 09:00-19:00, Saturday 09:00-14:00 */
const DEFAULT_WORKING_HOURS = [
  { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' }, // Monday
  { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' }, // Tuesday
  { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' }, // Wednesday
  { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' }, // Thursday
  { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' }, // Friday
  { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' }, // Saturday
  // Sunday (0) = closed, no row
] as const;

export interface CreateBarbershopInput {
  ownerId: string;
  name: string;
  address?: string;
  phone?: string;
  timezone?: string;
}

/**
 * Sets up default working hours for a barbershop.
 *
 * Idempotent: uses createMany with skipDuplicates so calling it
 * multiple times for the same barbershop does not create duplicate rows.
 * Existing custom WorkingHours are NOT overwritten.
 */
export async function setupDefaultWorkingHours(
  barbershopId: string
): Promise<void> {
  await prisma.workingHours.createMany({
    data: DEFAULT_WORKING_HOURS.map((day) => ({
      barbershopId,
      dayOfWeek: day.dayOfWeek,
      openTime: day.openTime,
      closeTime: day.closeTime,
    })),
    skipDuplicates: true,
  });
}

/**
 * Creates a new Barbershop with automatic default WorkingHours setup.
 *
 * The created barbershop is immediately ready to accept appointments
 * within the default schedule (Mon-Fri 9-19, Sat 9-14).
 *
 * Tenant isolation is preserved: the barbershop is owned by ownerId
 * and its WorkingHours are scoped to this barbershop only.
 */
export async function createBarbershop(
  input: CreateBarbershopInput
): Promise<Barbershop> {
  const barbershop = await prisma.barbershop.create({
    data: {
      ownerId: input.ownerId,
      name: input.name,
      address: input.address || null,
      phone: input.phone || null,
      timezone: input.timezone || 'America/Argentina/Tucuman',
      isActive: true,
    },
  });

  // Automatically set up default working hours
  await setupDefaultWorkingHours(barbershop.id);

  return barbershop;
}
