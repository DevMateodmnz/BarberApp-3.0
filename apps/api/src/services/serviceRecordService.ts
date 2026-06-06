/**
 * Service Record business logic service
 *
 * Provides walk-in service record creation and listing for barbershops.
 * BARBER can only record their own work. OWNER can record/list for any employee.
 * CLIENTs are denied all access.
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { CreateServiceRecordInput } from '../schemas/serviceRecord.js';
import type { UserRole } from '@prisma/client';

/**
 * Creates a new service record for a completed service/cut.
 *
 * Validations (in order):
 * 1. Employee must exist, be active, belong to the barbershop, not deleted
 * 2. BARBERs can only record for themselves
 * 3. CLIENTs are denied
 * 4. Service must exist, be active, belong to the barbershop, not deleted
 * 5. Employee must be assigned to the service
 */
export async function createServiceRecord(
  barbershopId: string,
  input: CreateServiceRecordInput,
  userId: string,
  userRole: UserRole
) {
  // 1. Validate employee exists, is active, belongs to barbershop, not deleted
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }
  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }
  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  // 2. BARBER check: can only record for themselves
  if (userRole === 'BARBER') {
    if (employee.userId !== userId) {
      throw new ForbiddenError('You can only record services for yourself');
    }
  }

  // 3. CLIENT check: denied
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot create service records');
  }

  // 4. Validate service
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
  });

  if (!service) {
    throw new NotFoundError('Service');
  }
  if (service.barbershopId !== barbershopId) {
    throw new NotFoundError('Service');
  }
  if (!service.isActive || service.deletedAt) {
    throw new BadRequestError('Service is not available');
  }

  // 5. Validate employee-service assignment
  const assignment = await prisma.employeeService.findUnique({
    where: {
      employeeId_serviceId: {
        employeeId: input.employeeId,
        serviceId: input.serviceId,
      },
    },
  });

  if (!assignment) {
    throw new BadRequestError('Employee is not assigned to this service');
  }

  // 6. Create the record
  return prisma.serviceRecord.create({
    data: {
      barbershopId,
      employeeId: input.employeeId,
      serviceId: input.serviceId,
      priceCents: input.priceCents,
      performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
      clientName: input.clientName?.trim() || null,
      paymentMethod: input.paymentMethod || null,
      notes: input.notes?.trim() || null,
      appointmentId: null,
    },
    include: {
      service: { select: { id: true, name: true } },
      employee: { select: { id: true, user: { select: { id: true, name: true } } } },
    },
  });
}

/**
 * Lists service records for a barbershop (OWNER only).
 *
 * Defense-in-depth: validates barbershop ownership.
 * Supports optional filters: employeeId, date.
 */
export async function listBarbershopRecords(
  barbershopId: string,
  userId: string,
  filters?: { employeeId?: string; date?: string }
) {
  // Validate barbershop ownership (defense-in-depth)
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
  });

  if (!barbershop || barbershop.ownerId !== userId) {
    throw new NotFoundError('Barbershop');
  }

  const where: Record<string, unknown> = {
    barbershopId,
    deletedAt: null,
  };

  if (filters?.employeeId) {
    where.employeeId = filters.employeeId;
  }

  if (filters?.date) {
    const dateStr = filters.date;
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
    where.performedAt = {
      gte: startOfDay,
      lte: endOfDay,
    };
  }

  return prisma.serviceRecord.findMany({
    where,
    include: {
      service: { select: { id: true, name: true } },
      employee: { select: { id: true, user: { select: { id: true, name: true } } } },
    },
    orderBy: { performedAt: 'desc' },
    take: 100,
  });
}

/**
 * Lists service records for a specific employee (OWNER or BARBER self only).
 *
 * BARBERs can only view their own records.
 * CLIENTs are denied.
 */
export async function listEmployeeRecords(
  barbershopId: string,
  employeeId: string,
  userId: string,
  userRole: UserRole
) {
  // Validate employee exists, is active, belongs to barbershop, not deleted
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }
  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }
  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }

  // BARBER check: can only view own records
  if (userRole === 'BARBER') {
    if (employee.userId !== userId) {
      throw new ForbiddenError('You can only view your own records');
    }
  }

  // CLIENT check: denied
  if (userRole === 'CLIENT') {
    throw new ForbiddenError('Clients cannot access service records');
  }

  return prisma.serviceRecord.findMany({
    where: {
      barbershopId,
      employeeId,
      deletedAt: null,
    },
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { performedAt: 'desc' },
    take: 100,
  });
}
