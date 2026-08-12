import express, { type RequestHandler, type Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { PhysicalQaRuntimeConfig } from '../config/runtime.js';
import {
  BoundedPhysicalQaEventStore,
  PHYSICAL_QA_EVENT_TRACE_PREFIX,
  physicalQaMobileEventSchema,
  type PersistedPhysicalQaMobileEvent,
} from '../lib/physicalQaMobileEvents.js';
import { createPhysicalQaRuntimeGuard } from '../middleware/physicalQaRuntime.js';

interface PhysicalQaRouterOptions {
  logger?: (line: string) => void;
  now?: () => Date;
  eventStore?: Pick<BoundedPhysicalQaEventStore, 'append'>;
  rateLimiter?: RequestHandler;
}

export function createPhysicalQaRouter(
  config: PhysicalQaRuntimeConfig,
  options: PhysicalQaRouterOptions = {},
): Router {
  const router = express.Router();
  const guard = createPhysicalQaRuntimeGuard(config);
  const logger = options.logger ?? ((line: string) => {
    // eslint-disable-next-line no-console
    console.info(line);
  });
  const now = options.now ?? (() => new Date());
  const eventStore =
    options.eventStore
    ?? new BoundedPhysicalQaEventStore(config.mobileEventsPath);
  const eventRateLimiter =
    options.rateLimiter
    ?? rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: false,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'QA_EVENT_RATE_LIMITED',
          message: 'Physical-QA mobile event rate limit exceeded.',
        },
      },
    });

  router.get('/runtime', guard, (_req, res) => {
    res.json({
      success: true,
      data: {
        runtimeId: config.runtimeId,
        runtimeFingerprint: config.fingerprint,
        repositoryHead: config.repositoryHead,
        apiStartedAt: config.apiStartedAt,
        physicalQaMode: true,
        traceVersion: 1,
      },
    });
  });

  router.post('/mobile-events', guard, eventRateLimiter, (req, res) => {
    const parsed = physicalQaMobileEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'QA_EVENT_INVALID',
          message: 'Physical-QA mobile event is invalid.',
        },
      });
      return;
    }

    if (
      parsed.data.runtimeId !== config.runtimeId
      || parsed.data.runtimeFingerprint !== config.fingerprint
    ) {
      res.status(409).json({
        success: false,
        error: {
          code: 'QA_RUNTIME_MISMATCH',
          message:
            'This event belongs to a different local QA runtime.',
        },
      });
      return;
    }

    const persisted: PersistedPhysicalQaMobileEvent = {
      ...parsed.data,
      receivedAt: now().toISOString(),
    };
    eventStore.append(persisted);
    logger(`${PHYSICAL_QA_EVENT_TRACE_PREFIX} ${JSON.stringify(persisted)}`);
    res.status(202).json({
      success: true,
      data: { accepted: true },
    });
  });

  return router;
}
