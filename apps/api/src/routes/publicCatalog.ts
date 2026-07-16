import { Router, Request, Response, NextFunction } from 'express';
import type { ApiRuntimeConfig } from '../config/runtime.js';
import { ValidationError } from '../lib/errors.js';
import {
  createPublicAvailabilityReadRateLimiter,
  createPublicBookingWriteRateLimiter,
  createPublicCatalogReadRateLimiter,
} from '../middleware/publicRateLimit.js';
import { validateBody } from '../middleware/validate.js';
import {
  PublicAvailabilityQuerySchema,
  PublicBarberQuerySchema,
} from '../schemas/publicCatalog.js';
import {
  PublicCancelBookingSchema,
  PublicCreateAppointmentSchema,
  PublicPromotionQuoteSchema,
} from '../schemas/publicBooking.js';
import {
  cancelPublicBookingByReference,
  createPublicBookingBySlug,
  getPublicBookingConfirmationByReference,
  quotePublicPromotionBySlug,
} from '../services/publicBookingService.js';
import { loadPublicBookingPaymentStateByReference } from '../services/payments/bookingPaymentService.js';
import {
  getPublicBarbershopBySlug,
  getPublicBookingConfigBySlug,
  listEligiblePublicBarbersBySlug,
  listPublicServicesBySlug,
} from '../services/publicCatalogService.js';
import { getPublicBarberAvailabilityBySlug } from '../services/publicAvailabilityService.js';

interface PublicCatalogRouterOptions {
  catalogReadRateLimit?: {
    max?: number;
    windowMs?: number;
  };
  availabilityReadRateLimit?: {
    max?: number;
    windowMs?: number;
  };
  bookingWriteRateLimit?: {
    max?: number;
    windowMs?: number;
  };
}

function paramSlug(req: Request): string {
  return req.params.slug ?? '';
}

function paramBarberId(req: Request): string {
  return req.params.barberId ?? '';
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

function parsePublicAvailabilityQuery(req: Request) {
  const parsed = PublicAvailabilityQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new ValidationError(
      'Invalid public availability query parameters',
      parsed.error.flatten()
    );
  }

  return parsed.data;
}

function requireIdempotencyKey(req: Request): string {
  const header = req.get('Idempotency-Key')?.trim();

  if (!header) {
    throw new ValidationError('Idempotency-Key header is required');
  }

  return header;
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
  const availabilityReadRateLimit = createPublicAvailabilityReadRateLimiter(
    config.rateLimit,
    options.availabilityReadRateLimit
  );
  const bookingWriteRateLimit = createPublicBookingWriteRateLimiter(
    config.rateLimit,
    options.bookingWriteRateLimit
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

  router.get(
    '/barbershops/:slug/booking-config',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const configDto = await getPublicBookingConfigBySlug(paramSlug(req));
        res.json({ success: true, data: configDto });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/barbershops/:slug/barbers/:barberId/availability',
    availabilityReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parsePublicAvailabilityQuery(req);
        const availability = await getPublicBarberAvailabilityBySlug({
          slug: paramSlug(req),
          barberId: paramBarberId(req),
          serviceId: query.serviceId,
          localDate: query.localDate,
        });
        res.json({ success: true, data: availability });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/barbershops/:slug/promotions/quote',
    bookingWriteRateLimit,
    validateBody(PublicPromotionQuoteSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const quote = await quotePublicPromotionBySlug({
          slug: paramSlug(req),
          serviceId: req.body.serviceId,
          code: req.body.code,
          clientPhone: req.body.clientPhone,
        });
        res.json({ success: true, data: quote });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/barbershops/:slug/appointments',
    bookingWriteRateLimit,
    validateBody(PublicCreateAppointmentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await createPublicBookingBySlug({
          slug: paramSlug(req),
          idempotencyKey: requireIdempotencyKey(req),
          body: req.body,
        });

        res
          .status(result.replayed ? 200 : 201)
          .json({ success: true, data: result.confirmation });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/barbershops/:slug/appointments/:reference',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const confirmation = await getPublicBookingConfirmationByReference({
          slug: paramSlug(req),
          publicReference: req.params.reference ?? '',
        });
        res.json({ success: true, data: confirmation });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/barbershops/:slug/appointments/:reference/cancel',
    bookingWriteRateLimit,
    validateBody(PublicCancelBookingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const reference = req.params.reference ?? '';
        const reason = (req.body as { reason?: string | null } | undefined)?.reason;
        const result = await cancelPublicBookingByReference({
          slug: paramSlug(req),
          publicReference: reference,
          reason,
        });
        res.json({ success: true, data: result.appointment });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/barbershops/:slug/bookings/:reference/payment',
    catalogReadRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payment = await loadPublicBookingPaymentStateByReference({
          slug: paramSlug(req),
          publicReference: req.params.reference ?? '',
        });
        res.json({
          success: true,
          data: {
            appointmentStatus: payment.appointmentStatus,
            paymentStatus: payment.paymentStatus,
            amount: payment.amountCents,
            currency: payment.currency,
            expiresAt: payment.expiresAt,
            canRetry: payment.canRetry,
            canCancel: payment.canCancel,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
