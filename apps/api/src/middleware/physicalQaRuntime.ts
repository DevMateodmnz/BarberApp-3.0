import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import type { PhysicalQaRuntimeConfig } from '../config/runtime.js';
import {
  PHYSICAL_QA_CLIENT_HEADER,
  PHYSICAL_QA_HEAD_HEADER,
  PHYSICAL_QA_RUNTIME_HEADER,
  PHYSICAL_QA_SESSION_HEADER,
} from '../lib/physicalQaMobileEvents.js';

export const QA_RUNTIME_MISMATCH_CODE = 'QA_RUNTIME_MISMATCH';
export const QA_HEAD_MISMATCH_CODE = 'QA_HEAD_MISMATCH';
const SAFE_RUNTIME_ID = /^[a-f0-9]{32}$/u;
const SAFE_HEAD = /^[a-f0-9]{40}$/u;
const SAFE_SESSION = /^[A-Za-z0-9._-]{8,80}$/u;

interface PhysicalQaRuntimeGuardOptions {
  logger?: (line: string) => void;
}

export function createPhysicalQaRuntimeGuard(
  config?: PhysicalQaRuntimeConfig,
  options: PhysicalQaRuntimeGuardOptions = {},
): RequestHandler {
  if (!config) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const receivedRuntime = req.get(PHYSICAL_QA_RUNTIME_HEADER);
    const receivedHead = req.get(PHYSICAL_QA_HEAD_HEADER);
    const runtimeMatches = receivedRuntime === config.runtimeId;
    const headMatches = receivedHead === config.repositoryHead;
    if (runtimeMatches && headMatches) {
      next();
      return;
    }

    const logger = options.logger ?? ((line: string) => {
      // eslint-disable-next-line no-console
      console.info(line);
    });
    const session = req.get(PHYSICAL_QA_SESSION_HEADER);
    const reason = runtimeMatches ? 'head' : 'runtime';
    logger(`qa.runtime.mismatch ${JSON.stringify({
      timestamp: new Date().toISOString(),
      reason,
      expectedFingerprint: config.fingerprint,
      expectedHead: config.repositoryHead.slice(0, 7),
      receivedFingerprint:
        receivedRuntime && SAFE_RUNTIME_ID.test(receivedRuntime)
          ? receivedRuntime.slice(0, 8).toUpperCase()
          : null,
      receivedHead:
        receivedHead && SAFE_HEAD.test(receivedHead)
          ? receivedHead.slice(0, 7)
          : null,
      appSession:
        session && SAFE_SESSION.test(session)
          ? maskSession(session)
          : null,
      client:
        req.get(PHYSICAL_QA_CLIENT_HEADER)?.slice(0, 24)
        ?? 'unidentified',
    })}`);

    res.status(409).json({
      success: false,
      error: {
        code:
          reason === 'head'
            ? QA_HEAD_MISMATCH_CODE
            : QA_RUNTIME_MISMATCH_CODE,
        message:
          'This app is not connected to the active local QA runtime. Reopen the current Expo project before testing.',
        details: {
          runtimeFingerprint: config.fingerprint,
          repositoryHead: config.repositoryHead.slice(0, 7),
          client:
            req.get(PHYSICAL_QA_CLIENT_HEADER)?.slice(0, 24)
            ?? 'unidentified',
        },
      },
    });
  };
}

function maskSession(value: string): string {
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}
