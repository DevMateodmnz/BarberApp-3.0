/**
 * Tenant isolation middleware
 *
 * Ensures the authenticated user has legitimate access to the requested barbershop.
 * - OWNER: must own the barbershop
 * - BARBER: must be an employee of the barbershop
 * - CLIENT: is allowed access to public barbershop data (appointments they own are filtered at query level)
 *
 * Must be used AFTER requireAuth middleware.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';

/**
 * Extracts barbershopId from request params or body.
 */
function getBarbershopId(req: Request): string | undefined {
  return req.params.barbershopId || req.body?.barbershopId || undefined;
}

/**
 * Middleware that verifies the user has access to the specified barbershop.
 */
export async function requireBarbershopAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const barbershopId = getBarbershopId(req);

    if (!barbershopId) {
      // No barbershop context needed (e.g., listing user's own barbershops)
      return next();
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
    });

    if (!barbershop) {
      throw new NotFoundError('Barbershop');
    }

    // OWNER: must own this barbershop
    if (req.userRole === 'OWNER') {
      if (barbershop.ownerId !== req.userId) {
        throw new ForbiddenError(
          'You do not own this barbershop'
        );
      }
      return next();
    }

    // BARBER: must be an employee of this barbershop
    if (req.userRole === 'BARBER') {
      const employee = await prisma.employee.findFirst({
        where: {
          userId: req.userId,
          barbershopId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!employee) {
        throw new ForbiddenError(
          'You are not an employee of this barbershop'
        );
      }

      // Attach employee ID for downstream use
      (req as Request & { employeeId: string }).employeeId = employee.id;
      return next();
    }

    // CLIENT: is allowed to access barbershop public data
    // Appointment-level filtering is handled at the query/service layer
    return next();
  } catch (error) {
    next(error);
  }
}

// Extend Request for employeeId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employeeId?: string;
    }
  }
}
