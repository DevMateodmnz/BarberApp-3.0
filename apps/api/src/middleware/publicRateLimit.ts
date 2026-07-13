import type { RateLimitConfig } from '../config/runtime.js';
import { createRateLimiter } from './rateLimit.js';

interface PublicCatalogReadRateLimitOverrides {
  max?: number;
  windowMs?: number;
}

interface PublicAvailabilityReadRateLimitOverrides {
  max?: number;
  windowMs?: number;
}

interface PublicBookingWriteRateLimitOverrides {
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

/**
 * Public availability reads are more computationally expensive than catalogue
 * reads and still use the in-memory store from createRateLimiter. Production
 * horizontal scaling will require a shared backing store.
 */
export function createPublicAvailabilityReadRateLimiter(
  config: RateLimitConfig,
  overrides: PublicAvailabilityReadRateLimitOverrides = {}
) {
  return createRateLimiter(config, {
    code: 'PUBLIC_AVAILABILITY_RATE_LIMITED',
    message: 'Too many public availability requests, please try again later',
    keyGenerator: (req) =>
      `${req.ip}:${req.params.slug ?? ''}:${req.params.barberId ?? ''}`,
    max: overrides.max ?? Math.min(config.max, 30),
    windowMs: overrides.windowMs ?? 60_000,
  });
}

/**
 * Public booking writes are the strictest anonymous path in the MVP. They
 * still use the in-memory limiter, so production horizontal scaling requires a
 * shared backing store.
 */
export function createPublicBookingWriteRateLimiter(
  config: RateLimitConfig,
  overrides: PublicBookingWriteRateLimitOverrides = {}
) {
  return createRateLimiter(config, {
    code: 'PUBLIC_BOOKING_WRITE_RATE_LIMITED',
    message: 'Too many public booking requests, please try again later',
    keyGenerator: (req) => `${req.ip}:${req.params.slug ?? ''}`,
    max: overrides.max ?? Math.min(config.max, 5),
    windowMs: overrides.windowMs ?? 15 * 60_000,
  });
}
