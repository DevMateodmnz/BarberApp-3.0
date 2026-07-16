/**
 * Webhook routes
 *
 * POST /api/v1/webhooks/clerk — Clerk webhook receiver.
 * Uses raw body (express.raw) for Svix signature verification.
 * No auth middleware — webhooks are authenticated via Svix signature.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { Webhook } from 'standardwebhooks';
import { AppError, BadRequestError } from '../lib/errors.js';
import { parseTrustedEmployeeInvitationMetadata } from '../lib/employeeInvitationMetadata.js';
import {
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
} from '../services/userSyncService.js';
import { reconcileEmployeeInvitation } from '../services/employeeInvitationService.js';
import {
  persistMercadoPagoWebhook,
  processPendingPaymentWebhookEvents,
  validateMercadoPagoWebhookSignature,
} from '../services/payments/bookingPaymentService.js';

const router = Router();

// Raw body parser for this router only
router.use((req: Request, _res: Response, next: NextFunction) => {
  // express.raw() is applied at the app level for this mount point.
  // If body is already a Buffer, proceed. Otherwise parse inline.
  if (Buffer.isBuffer(req.body)) {
    return next();
  }
  // Fallback: body was already parsed by express.json() — reject
  return next(
    new BadRequestError('Webhook body must be received as raw buffer')
  );
});

async function maybeRunInvitationReconciliation(
  payload: Record<string, unknown>
): Promise<void> {
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : null;

  if (!data || typeof data.id !== 'string') {
    return;
  }

  if (!parseTrustedEmployeeInvitationMetadata(data.public_metadata)) {
    return;
  }

  try {
    await reconcileEmployeeInvitation({ clerkUserId: data.id });
  } catch (error) {
    if (
      error instanceof AppError &&
      [
        'ONBOARDING_INVITATION_REQUIRED',
        'AMBIGUOUS_EMPLOYEE_INVITATION',
        'USER_ROLE_NOT_ELIGIBLE',
        'EMPLOYEE_INVITATION_REVOKED',
        'EMPLOYEE_INVITATION_EXPIRED',
        'EMPLOYEE_INVITATION_DELIVERY_FAILED',
      ].includes(error.code)
    ) {
      console.warn('Skipping webhook invitation reconciliation', {
        clerkUserId: data.id,
        code: error.code,
      });
      return;
    }

    throw error;
  }
}

router.post(
  '/clerk',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = process.env.CLERK_WEBHOOK_SECRET;
      if (!secret) {
        throw new BadRequestError('Webhook secret is not configured');
      }

      // Extract and map headers: Clerk uses svix-*, standardwebhooks expects webhook-*
      const svixId = req.headers['svix-id'] as string | undefined;
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
      const svixSignature = req.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        throw new BadRequestError(
          'Missing required webhook signature headers'
        );
      }

      const headers = {
        'webhook-id': svixId,
        'webhook-timestamp': svixTimestamp,
        'webhook-signature': svixSignature,
      };

      // Verify signature
      const rawBody = req.body as Buffer;
      let payload: Record<string, unknown>;
      try {
        const wh = new Webhook(secret);
        const verified = wh.verify(rawBody.toString(), headers);
        payload =
          typeof verified === 'string' ? JSON.parse(verified) : verified;
      } catch {
        throw new BadRequestError('Invalid webhook signature');
      }

      const eventType = payload.type as string | undefined;

      // Dispatch
      if (eventType === 'user.created') {
        await handleUserCreated(payload as never);
        await maybeRunInvitationReconciliation(payload);
      } else if (eventType === 'user.updated') {
        await handleUserUpdated(payload as never);
        await maybeRunInvitationReconciliation(payload);
      } else if (eventType === 'user.deleted') {
        await handleUserDeleted(payload as never);
      }
      // Unknown event types → 200 OK (acknowledge, prevent Clerk retries)

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/mercado-pago',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = req.body as Buffer;
      const dataId =
        typeof req.query['data.id'] === 'string' ? req.query['data.id'] : undefined;

      validateMercadoPagoWebhookSignature({
        rawBody,
        xSignature: req.header('x-signature') ?? undefined,
        xRequestId: req.header('x-request-id') ?? undefined,
        dataId,
      });

      await persistMercadoPagoWebhook({
        rawBody,
        requestId: req.header('x-request-id') ?? undefined,
        xSignature: req.header('x-signature') ?? undefined,
        dataId: dataId ?? '',
        externalReference:
          typeof req.query.external_reference === 'string'
            ? req.query.external_reference
            : null,
        topic: typeof req.query.type === 'string' ? req.query.type : null,
        action: typeof req.query.action === 'string' ? req.query.action : null,
      });

      void processPendingPaymentWebhookEvents().catch(() => {
        // Best-effort async reconciliation after a successful ack.
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
