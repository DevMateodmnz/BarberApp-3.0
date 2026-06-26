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

interface RateLimiterOverrides {
  code?: string;
  message?: string;
  keyGenerator?: (req: Request, res: Response) => string;
  max?: number;
  windowMs?: number;
}

export function createRateLimiter(
  config: RateLimitConfig,
  overrides: RateLimiterOverrides = {}
): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: overrides.windowMs ?? config.windowMs,
    max: overrides.max ?? config.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (_req: Request): boolean => !config.enabled,
    ...(overrides.keyGenerator
      ? { keyGenerator: overrides.keyGenerator }
      : {}),
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        success: false,
        error: {
          code: overrides.code ?? 'RATE_LIMITED',
          message:
            overrides.message ?? 'Too many requests, please try again later',
        },
      });
    },
  });
}
