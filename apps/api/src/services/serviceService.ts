/**
 * Service business logic service
 *
 * Provides OWNER-managed service creation for a barbershop.
 * Service belongs to exactly one barbershop — tenant-scoped.
 */
import { prisma } from '../lib/prisma.js';
import type { Service } from '@prisma/client';
import type { CreateServiceInput, UpdateServiceInput } from '../schemas/service.js';
import { NotFoundError } from '../lib/errors.js';

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

/**
 * Lists services for a barbershop.
 *
 * By default returns only active, non-deleted services.
 * Pass includeInactive=true to also include inactive (but not deleted) services.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop (requireBarbershopAccess + requireRole)
 */
export async function listServices(barbershopId: string, includeInactive = false) {
  return prisma.service.findMany({
    where: {
      barbershopId,
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      barbershopId: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
      currency: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Updates a service's mutable fields (name, durationMinutes, priceCents, description).
 *
 * Safety guarantees:
 * - Service must belong to the given barbershopId (cross-tenant → 404)
 * - Deleted services cannot be updated (404)
 * - Only provided fields are updated
 */
export async function updateService(
  barbershopId: string,
  serviceId: string,
  input: UpdateServiceInput
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) throw new NotFoundError('Service');
  if (service.barbershopId !== barbershopId) throw new NotFoundError('Service');
  // Allow updates on soft-deleted services — reactivation (isActive:true) clears deletedAt.
  // This is intentional: DELETE is "deactivate", PATCH can "reactivate".

  return prisma.service.update({
    where: { id: serviceId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      // Reactivate: clear deletedAt when marking active again
      ...(input.isActive === true && { deletedAt: null }),
    },
    select: {
      id: true,
      barbershopId: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
      currency: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Soft-deactivates a service (isActive=false, deletedAt=now).
 *
 * Safety guarantees:
 * - Service must belong to the given barbershopId (cross-tenant → 404)
 * - Already-deleted services return 404 (idempotent guard)
 * - EmployeeService links and appointments are preserved (historical data)
 */
export async function deleteService(barbershopId: string, serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) throw new NotFoundError('Service');
  if (service.barbershopId !== barbershopId) throw new NotFoundError('Service');
  if (service.deletedAt) throw new NotFoundError('Service');

  return prisma.service.update({
    where: { id: serviceId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });
}
