import { Router, Request, Response, NextFunction } from 'express';
import type { ApiRuntimeConfig } from '../config/runtime.js';
import { ValidationError } from '../lib/errors.js';
import { createPublicCatalogReadRateLimiter } from '../middleware/publicRateLimit.js';
import { PublicBarberQuerySchema } from '../schemas/publicCatalog.js';
import {
  getPublicBarbershopBySlug,
  listEligiblePublicBarbersBySlug,
  listPublicServicesBySlug,
} from '../services/publicCatalogService.js';

interface PublicCatalogRouterOptions {
  catalogReadRateLimit?: {
    max?: number;
    windowMs?: number;
  };
}

function paramSlug(req: Request): string {
  return req.params.slug ?? '';
}

function parsePublicBarberQuery(req: Request) {
  const parsed = PublicBarberQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid public barber query parameters',
      parsed.error.flatten()
    );
  }

  return parsed.data;
}

export function createPublicCatalogRouter(
  config: ApiRuntimeConfig,
  options: PublicCatalogRouterOptions = {}
) {
  const router = Router();
  const catalogReadRateLimit = createPublicCatalogReadRateLimiter(
    config.rateLimit,
    options.catalogReadRateLimit
  );

  router.get(
    '/barbershops/:slug',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const shop = await getPublicBarbershopBySlug(paramSlug(req));
        res.json({ success: true, data: shop });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/barbershops/:slug/services',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const services = await listPublicServicesBySlug(paramSlug(req));
        res.json({ success: true, data: services });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/barbershops/:slug/barbers',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parsePublicBarberQuery(req);
        const barbers = await listEligiblePublicBarbersBySlug(
          paramSlug(req),
          query.serviceId
        );
        res.json({ success: true, data: barbers });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
