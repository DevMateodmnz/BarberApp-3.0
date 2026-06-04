/**
 * Rate Limiting Middleware
 *
 * Applies in-memory rate limiting to appointment routes using express-rate-limit.
 * Configurable via env vars:
 *   RATE_LIMIT_ENABLED   — "true" (default in non-test) or "false" (default in test)
 *   RATE_LIMIT_WINDOW_MS — window duration in ms (default: 15 minutes)
 *   RATE_LIMIT_MAX       — max requests per window (default: 100)
 *
 * MemoryStore is acceptable for single-instance MVP/development.
 * For production horizontal scaling, swap to a shared store (Redis, etc.).
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

function isEnabled(): boolean {
  const env = process.env.RATE_LIMIT_ENABLED;
  if (env !== undefined) return env === 'true';
  // Default: enabled unless in test environment
  return process.env.NODE_ENV !== 'test';
}

function readWindowMs(): number {
  const env = process.env.RATE_LIMIT_WINDOW_MS;
  return env ? parseInt(env, 10) : 15 * 60 * 1000; // 15 minutes
}

function readMax(): number {
  const env = process.env.RATE_LIMIT_MAX;
  return env ? parseInt(env, 10) : 100;
}

export function createRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: readWindowMs(),
    max: readMax(),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (_req: Request): boolean => !isEnabled(),
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
}

// Singleton limiter for the main app
const limiter = createRateLimiter();

/**
 * Rate limiting middleware for appointment routes.
 * When RATE_LIMIT_ENABLED=false, passes through without limiting.
 */
export function appointmentRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  limiter(req, res, next);
}
