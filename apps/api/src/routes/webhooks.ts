/**
 * Webhook routes
 *
 * POST /api/v1/webhooks/clerk — Clerk webhook receiver.
 * Uses raw body (express.raw) for Svix signature verification.
 * No auth middleware — webhooks are authenticated via Svix signature.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { Webhook } from 'standardwebhooks';
import { BadRequestError } from '../lib/errors.js';
import {
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
} from '../services/userSyncService.js';

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
      } else if (eventType === 'user.updated') {
        await handleUserUpdated(payload as never);
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

export default router;
