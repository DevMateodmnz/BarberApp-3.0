import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const TRACE_PREFIX = 'qa.api.request';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,80}$/u;
const SAFE_ROUTE_SEGMENTS = new Set([
  'activate',
  'api',
  'appointments',
  'availability',
  'barbershops',
  'cancel',
  'complete',
  'customers',
  'deactivate',
  'employees',
  'health',
  'ledger',
  'loyalty',
  'loyalty-ledger',
  'loyalty-program',
  'me',
  'onboarding',
  'payments',
  'ping',
  'promotions',
  'public',
  'quote',
  'records',
  'redemptions',
  'reschedule',
  'services',
  'summary',
  'v1',
  'webhooks',
  'working-hours',
]);

interface PhysicalQaRequestTraceOptions {
  enabled: boolean;
  logger?: (line: string) => void;
  now?: () => number;
  randomId?: () => string;
}

export function createPhysicalQaRequestTrace(
  options: PhysicalQaRequestTraceOptions,
): RequestHandler {
  if (!options.enabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const logger = options.logger ?? ((line: string) => {
    // eslint-disable-next-line no-console
    console.info(line);
  });
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomUUID;

  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = now();
    const requestedId = req.get('x-request-id');
    const correlationId = requestedId && SAFE_CORRELATION_ID.test(requestedId)
      ? requestedId
      : `api-${randomId()}`;

    res.setHeader('X-Request-Id', correlationId);
    res.once('finish', () => {
      const event = {
        timestamp: new Date().toISOString(),
        method: req.method.toUpperCase().slice(0, 12),
        route: normalizePhysicalQaRoute(req.originalUrl),
        status: res.statusCode,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        correlationId,
      };
      logger(`${TRACE_PREFIX} ${JSON.stringify(event)}`);
    });
    next();
  };
}

export function normalizePhysicalQaRoute(originalUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(originalUrl, 'http://physical-qa.local').pathname;
  } catch {
    return '/:invalid';
  }

  const normalized = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const decoded = safeDecode(segment);
      return SAFE_ROUTE_SEGMENTS.has(decoded) ? decoded : ':value';
    });

  return `/${normalized.join('/')}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return ':invalid';
  }
}
