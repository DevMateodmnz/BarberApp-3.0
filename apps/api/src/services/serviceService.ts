/**
 * Service business logic service
 *
 * Provides OWNER-managed service creation for a barbershop.
 * Service belongs to exactly one barbershop — tenant-scoped.
 */
import { prisma } from '../lib/prisma.js';
import type { Service } from '@prisma/client';
import type { CreateServiceInput } from '../schemas/service.js';

/**
 * Creates a new service for a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop (requireBarbershopAccess + requireRole)
 * - barbershopId is a valid, existing barbershop
 *
 * Behavior:
 * - barbershopId is taken from the route param (trusted via middleware), not the body
 * - Duplicate service names within the same barbershop are allowed (no unique constraint)
 * - Service is created as active by default
 */
export async function createService(
  barbershopId: string,
  input: CreateServiceInput
): Promise<Service> {
  return prisma.service.create({
    data: {
      barbershopId,
      name: input.name,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      description: input.description ?? null,
      isActive: true,
    },
  });
}
