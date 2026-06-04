/**
 * Role-based access control middleware
 *
 * Verifies the authenticated user has one of the allowed roles.
 * Must be used AFTER requireAuth middleware.
 */
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors.js';
import type { UserRole } from '@prisma/client';

/**
 * Creates middleware that restricts access to specified roles.
 * Usage: requireRole('OWNER', 'BARBER')
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.userRole) {
      return next(new ForbiddenError('User context not available'));
    }

    if (!roles.includes(req.userRole)) {
      return next(
        new ForbiddenError(
          `Role ${req.userRole} is not allowed. Required: ${roles.join(' or ')}`
        )
      );
    }

    next();
  };
}
