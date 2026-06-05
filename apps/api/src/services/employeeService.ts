/**
 * Employee business logic service
 *
 * Provides OWNER-managed employee creation for a barbershop.
 * Employee is a tenant-scoped link between a User and a Barbershop.
 * Does NOT modify User.role — role is managed via Clerk metadata (PR-013).
 */
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { Prisma } from '@prisma/client';
import type { Employee } from '@prisma/client';

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
