/**
 * Rate Limiting Middleware
 *
 * Applies in-memory rate limiting to appointment routes using express-rate-limit.
 * Runtime values are parsed centrally from environment configuration.
 *
 * MemoryStore is acceptable for single-instance MVP/development.
 * For production horizontal scaling, swap to a shared store (Redis, etc.).
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { RateLimitConfig } from '../config/runtime.js';

export function createRateLimiter(
  config: RateLimitConfig
): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (_req: Request): boolean => !config.enabled,
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
