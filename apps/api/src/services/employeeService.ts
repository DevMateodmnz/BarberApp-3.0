/**
 * Employee business logic service
 *
 * Provides OWNER-managed employee creation for a barbershop.
 * Employee is a tenant-scoped link between a User and a Barbershop.
 * Does NOT modify User.role — role is managed via Clerk metadata (PR-013).
 */
import { prisma } from '../lib/prisma.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import type { Employee, EmployeeService, Service } from '@prisma/client';
import type { CreateEmployeeInput } from '../schemas/employee.js';

/**
 * Resolves a user ID from either a direct userId or an email lookup.
 * Returns the internal user ID. Throws NotFoundError if the user doesn't exist.
 */
async function resolveUserId(input: CreateEmployeeInput): Promise<string> {
  if (input.userId) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.deletedAt) throw new NotFoundError('User');
    return user.id;
  }

  // email path
  const normalizedEmail = input.email!.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.deletedAt) throw new NotFoundError('User');
  return user.id;
}

/**
 * Adds an existing user as an employee of a barbershop.
 *
 * Preconditions (enforced by upstream middleware/routes):
 * - Caller is the OWNER of the barbershop (requireBarbershopAccess + requireRole)
 * - barbershopId is a valid, existing barbershop
 *
 * Behavior:
 * - Target user must exist and not be soft-deleted → 404 otherwise
 * - Supports lookup by userId or email (exactly one required)
 * - Email is trimmed and lowercased before lookup
 * - Duplicate employee link (same user + same barbershop) → 409 Conflict
 * - Does NOT modify User.role
 * - Does NOT create Clerk users
 * - Does NOT send invitations
 */
export async function addEmployee(
  barbershopId: string,
  input: CreateEmployeeInput
): Promise<Employee> {
  const userId = await resolveUserId(input);

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
export async function validateEmployeeInBarbershop(
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

// ============================================
// EMPLOYEE LISTING
// ============================================

/**
 * Lists employees for a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Returns all non-deleted employees (active + inactive)
 * - Includes safe user fields only: id, email, name, role
 * - Excludes internal fields: clerkUserId, deletedAt
 * - Does NOT include assigned services (deferred to separate endpoint)
 */
export async function listEmployees(barbershopId: string) {
  return prisma.employee.findMany({
    where: { barbershopId, deletedAt: null },
    select: {
      id: true,
      barbershopId: true,
      userId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

// ============================================
// EMPLOYEE SERVICE LISTING
// ============================================

/**
 * Lists services assigned to an employee within a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Validates employee belongs to barbershop and is active
 * - Returns only active, non-deleted services assigned to the employee
 * - Returns the service objects (not junction table rows)
 */
export async function listEmployeeServices(
  barbershopId: string,
  employeeId: string
): Promise<Service[]> {
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  const assignments = await prisma.employeeService.findMany({
    where: {
      employeeId,
      service: {
        isActive: true,
        deletedAt: null,
      },
    },
    include: {
      service: true,
    },
  });

  return assignments.map((a) => a.service);
}

/**
 * Lists active services assigned to the authenticated barber's own employee
 * record within a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is an authenticated BARBER with access to the barbershop
 *
 * Defense-in-depth:
 * - Employee is inferred from userId + barbershopId, never from user input
 * - Missing/inactive/deleted employee returns 403 (same access semantics as
 *   requireBarbershopAccess for BARBER)
 * - Returns only safe service fields needed by mobile record creation
 */
export async function listOwnAssignedServices(
  barbershopId: string,
  userId: string
) {
  const employee = await prisma.employee.findFirst({
    where: {
      barbershopId,
      userId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!employee) {
    throw new ForbiddenError('You are not an employee of this barbershop');
  }

  const assignments = await prisma.employeeService.findMany({
    where: {
      employeeId: employee.id,
      service: {
        isActive: true,
        deletedAt: null,
      },
    },
    select: {
      service: {
        select: {
          id: true,
          name: true,
          description: true,
          durationMinutes: true,
          priceCents: true,
          currency: true,
          isActive: true,
        },
      },
    },
  });

  return assignments.map((assignment) => assignment.service);
}

// ============================================
// EMPLOYEE DEACTIVATION
// ============================================

/**
 * Soft-deactivates an employee in a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Sets isActive = false and deletedAt = now (soft-delete)
 * - Does NOT hard-delete the Employee record
 * - Does NOT delete or modify User, User.role, appointments, or EmployeeService links
 * - Already-deactivated employees return 404 (via validateEmployeeInBarbershop)
 * - Existing appointments remain as historical records
 * - Future bookings for this employee are rejected by existing appointmentService validation
 */
export async function deactivateEmployee(
  barbershopId: string,
  employeeId: string
): Promise<void> {
  await validateEmployeeInBarbershop(employeeId, barbershopId);

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });
}

// ============================================
// EMPLOYEE REACTIVATION
// ============================================

/**
 * Reactivates a previously deactivated employee in a barbershop.
 *
 * Preconditions (enforced by upstream middleware):
 * - Caller is the OWNER of the barbershop
 *
 * Behavior:
 * - Finds the employee WITHOUT filtering by deletedAt (so deactivated employees are found)
 * - If employee doesn't exist → NotFoundError
 * - If employee.barbershopId doesn't match → NotFoundError (don't leak cross-tenant existence)
 * - If employee is already active → ConflictError
 * - Otherwise: sets isActive = true, deletedAt = null
 * - Returns the updated employee with safe user fields (id, email, name, role)
 * - Does NOT modify User.role
 * - Does NOT recreate EmployeeService links
 */
export async function reactivateEmployee(
  barbershopId: string,
  employeeId: string
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.barbershopId !== barbershopId) {
    throw new NotFoundError('Employee');
  }

  if (employee.isActive && !employee.deletedAt) {
    throw new ConflictError('Employee is already active');
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      barbershopId: true,
      userId: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  return updated;
}
