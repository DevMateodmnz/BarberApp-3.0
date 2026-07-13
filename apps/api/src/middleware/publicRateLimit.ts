import type { RateLimitConfig } from '../config/runtime.js';
import { createRateLimiter } from './rateLimit.js';

interface PublicCatalogReadRateLimitOverrides {
  max?: number;
  windowMs?: number;
}

/**
 * Public catalogue reads are allowed anonymously during the single-instance pilot.
 * This still uses the in-memory store from createRateLimiter, so production
 * horizontal scaling will require a shared backing store.
 */
export function createPublicCatalogReadRateLimiter(
  config: RateLimitConfig,
  overrides: PublicCatalogReadRateLimitOverrides = {}
) {
  return createRateLimiter(config, {
    code: 'PUBLIC_CATALOG_RATE_LIMITED',
    message: 'Too many public catalog requests, please try again later',
    keyGenerator: (req) => `${req.ip}:${req.params.slug ?? ''}`,
    max: overrides.max ?? Math.min(config.max, 60),
    windowMs: overrides.windowMs ?? 60_000,
  });
}
