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
 * Lists all active, non-deleted services for a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop (requireBarbershopAccess + requireRole)
 */
export async function listServices(barbershopId: string) {
  return prisma.service.findMany({
    where: {
      barbershopId,
      deletedAt: null,
      isActive: true,
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
  if (service.deletedAt) throw new NotFoundError('Service');

  return prisma.service.update({
    where: { id: serviceId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.description !== undefined && { description: input.description }),
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
