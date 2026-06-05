/**
 * Employee business logic service
 *
 * Provides OWNER-managed employee creation for a barbershop.
 * Employee is a tenant-scoped link between a User and a Barbershop.
 * Does NOT modify User.role — role is managed via Clerk metadata (PR-013).
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import type { Employee, EmployeeService } from '@prisma/client';

/**
 * Adds an existing user as an employee of a barbershop.
 *
 * Preconditions (enforced by upstream middleware/routes):
 * - Caller is the OWNER of the barbershop (requireBarbershopAccess + requireRole)
 * - barbershopId is a valid, existing barbershop
 *
 * Behavior:
 * - Target user must exist and not be soft-deleted → 404 otherwise
 * - Duplicate employee link (same user + same barbershop) → 409 Conflict
 * - Does NOT modify User.role
 * - Does NOT create Clerk users
 * - Does NOT send invitations
 */
export async function addEmployee(
  barbershopId: string,
  userId: string
): Promise<Employee> {
  // Verify target user exists and is not soft-deleted
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User');
  }

  try {
    return await prisma.employee.create({
      data: {
        barbershopId,
        userId,
        isActive: true,
      },
      include: {
        user: true,
        barbershop: true,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(
        'User is already an employee of this barbershop'
      );
    }
    throw err;
  }
}

// ============================================
// EMPLOYEE-SERVICE ASSIGNMENT
// ============================================

/**
 * Validates that an employee exists, is active, and belongs to the barbershop.
 */
async function validateEmployeeInBarbershop(
  employeeId: string,
  barbershopId: string
): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee || employee.deletedAt) {
    throw new NotFoundError('Employee');
  }

  if (employee.barbershopId !== barbershopId) {
    throw new BadRequestError(
      'Employee does not belong to this barbershop'
    );
  }

  if (!employee.isActive) {
    throw new BadRequestError('Employee is not active');
  }
}

/**
 * Validates that a service exists and belongs to the barbershop.
 */
async function validateServiceInBarbershop(
  serviceId: string,
  barbershopId: string
): Promise<void> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    throw new NotFoundError('Service');
  }

  if (service.barbershopId !== barbershopId) {
    throw new BadRequestError(
      'Service does not belong to this barbershop'
    );
  }
}

/**
 * Assigns a service to an employee within a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Validates employee belongs to barbershop and is active
 * - Validates service belongs to barbershop
 * - Duplicate assignment → 409 ConflictError (via @@unique constraint)
 * - Does NOT modify User.role, Service, or Employee (except the link)
 */
export async function assignService(
  barbershopId: string,
  employeeId: string,
  serviceId: string
): Promise<EmployeeService> {
  await validateEmployeeInBarbershop(employeeId, barbershopId);
  await validateServiceInBarbershop(serviceId, barbershopId);

  try {
    return await prisma.employeeService.create({
      data: { employeeId, serviceId },
      include: {
        employee: true,
        service: true,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(
        'Employee is already assigned to this service'
      );
    }
    throw err;
  }
}

/**
 * Unassigns a service from an employee within a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Validates employee belongs to barbershop and is active
 * - Validates the EmployeeService link exists → 404 if not
 * - Deleting the last service from an employee is allowed
 */
export async function unassignService(
  barbershopId: string,
  employeeId: string,
  serviceId: string
): Promise<void> {
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  const link = await prisma.employeeService.findUnique({
    where: {
      employeeId_serviceId: { employeeId, serviceId },
    },
  });

  if (!link) {
    throw new NotFoundError('Employee service assignment');
  }

  await prisma.employeeService.delete({
    where: { id: link.id },
  });
}
