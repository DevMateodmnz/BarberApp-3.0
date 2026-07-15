/**
 * User context service — resolves authenticated user's
 * app context for the mobile dashboard.
 *
 * Returns: userId, role, barbershopId, barbershopName,
 * employeeId, employeeName.
 */
import { prisma } from '../lib/prisma.js';
import type { UserRole } from '@prisma/client';

interface UserContext {
  userId: string;
  role: UserRole;
  barbershopId: string | null;
  barbershopName: string | null;
  barbershopTimezone: string | null;
  employeeId: string | null;
  employeeName: string | null;
}

/**
 * Resolves the authenticated user's current app context.
 *
 * - OWNER: returns first active barbershop they own (createdAt ASC).
 *   employeeId stays null.
 * - BARBER: returns first active employee record linked to this user.
 *   Includes the barbershop context.
 * - CLIENT: returns null context fields.
 *
 * Soft-deleted or inactive barbershops/employees are excluded.
 * Missing context returns null fields (never 404).
 */
export async function getUserContext(
  userId: string,
  userRole: UserRole
): Promise<UserContext> {
  const base = {
    userId,
    role: userRole,
    barbershopId: null as string | null,
    barbershopName: null as string | null,
    barbershopTimezone: null as string | null,
    employeeId: null as string | null,
    employeeName: null as string | null,
  };

  if (userRole === 'OWNER') {
    const shop = await prisma.barbershop.findFirst({
      where: {
        ownerId: userId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, timezone: true },
    });

    if (shop) {
      base.barbershopId = shop.id;
      base.barbershopName = shop.name;
      base.barbershopTimezone = shop.timezone;
    }
    return base;
  }

  if (userRole === 'BARBER') {
    const employee = await prisma.employee.findFirst({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        barbershop: { select: { id: true, name: true, timezone: true } },
        user: { select: { name: true } },
      },
    });

    if (employee) {
      base.barbershopId = employee.barbershop.id;
      base.barbershopName = employee.barbershop.name;
      base.barbershopTimezone = employee.barbershop.timezone;
      base.employeeId = employee.id;
      base.employeeName = employee.user.name;
    }
    return base;
  }

  // CLIENT
  return base;
}
