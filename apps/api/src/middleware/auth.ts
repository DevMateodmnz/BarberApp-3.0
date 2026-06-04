/**
 * Authentication middleware
 *
 * Test mode (NODE_ENV=test): reads x-test-user-id header to simulate Clerk auth.
 * Production mode: uses @clerk/express requireAuth().
 *
 * In both modes, the middleware resolves the user from the DATABASE (real Prisma)
 * and attaches it to req.user. This ensures business logic and tenant checks
 * always work against real database records.
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { User, UserRole } from '@prisma/client';

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      userId: string;
      user: User;
      userRole: UserRole;
    }
  }
}

/**
 * Authentication middleware.
 * In test mode, reads x-test-user-id header.
 * In production, validates Clerk token.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let clerkUserId: string | undefined;

    if (process.env.NODE_ENV === 'test') {
      // Test mode: use header-based auth
      clerkUserId = req.headers['x-test-user-id'] as string | undefined;
      if (!clerkUserId) {
        throw new UnauthorizedError('Missing x-test-user-id header in test mode');
      }
    } else {
      // Production: validate via Clerk
      // Dynamic import to avoid loading Clerk SDK in tests
      const { requireAuth: clerkRequireAuth } = await import('@clerk/express');
      // Wrap Clerk middleware in a promise
      await new Promise<void>((resolve, reject) => {
        const clerkMw = clerkRequireAuth();
        clerkMw(req, _res, (err?: unknown) => {
          if (err) return reject(err);
          // Clerk sets auth on request - extract userId
          const auth = (req as unknown as Record<string, unknown>).auth as
            | { userId?: string }
            | undefined;
          clerkUserId = auth?.userId;
          if (!clerkUserId) {
            return reject(new UnauthorizedError('Invalid or missing Clerk token'));
          }
          resolve();
        });
      });
    }

    // Resolve user from DATABASE (always real, never mocked)
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found in database');
    }

    if (user.deletedAt) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    // Attach to request for downstream middleware/routes
    req.userId = user.id;
    req.user = user;
    req.userRole = user.role;

    next();
  } catch (error) {
    next(error);
  }
}
