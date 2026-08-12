import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validateBody } from '../middleware/validate.js';
import { ValidationError, BadRequestError, AppError } from '../lib/errors.js';
import {
  PaymentConnectSchema,
  PaymentListQuerySchema,
  PaymentReviewListQuerySchema,
  PaymentReviewNoteSchema,
  PaymentReviewReopenSchema,
  PaymentReviewResolveSchema,
  UpdateDepositPolicySchema,
} from '../schemas/payment.js';
import { prisma } from '../lib/prisma.js';
import {
  disconnectPaymentConnection,
  getPaymentConnection,
  handleMercadoPagoOAuthCallback,
  renderPaymentOAuthCompletionPage,
  startMercadoPagoConnect,
} from '../services/payments/paymentConnectionService.js';
import {
  getBarbershopPaymentDetail,
  getBarbershopPaymentSummary,
  listBarbershopPayments,
} from '../services/payments/bookingPaymentService.js';
import { getDepositPolicy, updateDepositPolicy } from '../services/payments/depositPolicyService.js';
import {
  addPaymentReviewNote,
  getBarbershopPaymentReviewDetail,
  getBarbershopPaymentReviewSummary,
  listBarbershopPaymentReviews,
  reopenPaymentReview,
  resolvePaymentReview,
  startPaymentReview,
} from '../services/payments/paymentReviewService.js';

const router = Router();

function paramBarbershopId(req: Request): string {
  const id = req.params.barbershopId;
  if (!id) {
    throw new BadRequestError('Barbershop ID is required');
  }
  return id;
}

function paramReviewId(req: Request): string {
  const reviewId = req.params.reviewId;
  if (!reviewId) {
    throw new BadRequestError('Review ID is required');
  }
  return reviewId;
}

function parsePaymentReviewQuery(req: Request) {
  const parsed = PaymentReviewListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid payment review query parameters', parsed.error.flatten());
  }
  return parsed.data;
}

async function requireOwnedBarbershopOr404(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const barbershopId = paramBarbershopId(req);
    const barbershop = await prisma.barbershop.findFirst({
      where: {
        id: barbershopId,
        ownerId: req.userId,
      },
      select: { id: true },
    });

    if (!barbershop) {
      throw new AppError(404, 'NOT_FOUND', 'Barbershop not found');
    }

    next();
  } catch (error) {
    next(error);
  }
}

router.get('/payments/mercado-pago/oauth/callback', async (req, res, next) => {
  try {
    const result = await handleMercadoPagoOAuthCallback({
      code: typeof req.query.code === 'string' ? req.query.code : null,
      state: typeof req.query.state === 'string' ? req.query.state : null,
      error: typeof req.query.error === 'string' ? req.query.error : null,
    });

    res
      .status(result.ok ? 200 : 400)
      .type('html')
      .send(
        renderPaymentOAuthCompletionPage({
          title: result.title,
          message: result.message,
          success: result.ok,
          redirectTarget: result.redirectTarget,
        })
      );
  } catch (error) {
    next(error);
  }
});

router.get(
  '/barbershops/:barbershopId/payments/connection',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await getPaymentConnection(paramBarbershopId(req)) });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/barbershops/:barbershopId/payments/mercado-pago/connect',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  validateBody(PaymentConnectSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({
        success: true,
        data: await startMercadoPagoConnect({
          barbershopId: paramBarbershopId(req),
          userId: req.userId,
          redirectTarget: typeof req.body.redirectTarget === 'string' ? req.body.redirectTarget : null,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/barbershops/:barbershopId/payments/connection',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      await disconnectPaymentConnection(paramBarbershopId(req));
      res.json({ success: true, data: { disconnected: true } });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/deposit-policy',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await getDepositPolicy(paramBarbershopId(req)) });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/barbershops/:barbershopId/deposit-policy',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  validateBody(UpdateDepositPolicySchema),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await updateDepositPolicy(paramBarbershopId(req), req.body),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments/summary',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({ success: true, data: await getBarbershopPaymentSummary(paramBarbershopId(req)) });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      const parsed = PaymentListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid payment query parameters', parsed.error.flatten());
      }
      res.json({
        success: true,
        data: await listBarbershopPayments({
          barbershopId: paramBarbershopId(req),
          status: parsed.data.status ? { equals: parsed.data.status } : undefined,
          page: parsed.data.page,
          limit: parsed.data.limit,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments/:paymentId',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      const paymentId = req.params.paymentId;
      if (!paymentId) {
        throw new BadRequestError('Payment ID is required');
      }
      res.json({
        success: true,
        data: await getBarbershopPaymentDetail({
          barbershopId: paramBarbershopId(req),
          paymentId,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments/reviews/summary',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await getBarbershopPaymentReviewSummary({
          barbershopId: paramBarbershopId(req),
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments/reviews',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      const query = parsePaymentReviewQuery(req);
      res.json({
        success: true,
        data: await listBarbershopPaymentReviews({
          barbershopId: paramBarbershopId(req),
          status: query.status,
          reason: query.reason,
          dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
          dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
          page: query.page,
          limit: query.limit,
          sort: query.sort,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/barbershops/:barbershopId/payments/reviews/:reviewId',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await getBarbershopPaymentReviewDetail({
          barbershopId: paramBarbershopId(req),
          reviewId: paramReviewId(req),
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/barbershops/:barbershopId/payments/reviews/:reviewId/start',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await startPaymentReview({
          barbershopId: paramBarbershopId(req),
          reviewId: paramReviewId(req),
          actorUserId: req.userId,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/barbershops/:barbershopId/payments/reviews/:reviewId/notes',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  validateBody(PaymentReviewNoteSchema),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await addPaymentReviewNote({
          barbershopId: paramBarbershopId(req),
          reviewId: paramReviewId(req),
          actorUserId: req.userId,
          note: req.body.note,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/barbershops/:barbershopId/payments/reviews/:reviewId/resolve',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  validateBody(PaymentReviewResolveSchema),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await resolvePaymentReview({
          barbershopId: paramBarbershopId(req),
          reviewId: paramReviewId(req),
          actorUserId: req.userId,
          resolution: req.body.resolution,
          note: req.body.note ?? null,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/barbershops/:barbershopId/payments/reviews/:reviewId/reopen',
  requireAuth,
  requireRole('OWNER'),
  requireOwnedBarbershopOr404,
  validateBody(PaymentReviewReopenSchema),
  async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await reopenPaymentReview({
          barbershopId: paramBarbershopId(req),
          reviewId: paramReviewId(req),
          actorUserId: req.userId,
          note: req.body.note ?? null,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
