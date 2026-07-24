import { ApiError } from './api.js';

const TRACE_PREFIX = 'qa.mobile.event';
const MAX_SAFE_TEXT_LENGTH = 80;
let attemptSequence = 0;

export type MobileQaAction = 'loyalty-program-save';

export type MobileQaStage =
  | 'press_received'
  | 'validation_started'
  | 'validation_failed'
  | 'mutation_started'
  | 'token_started'
  | 'request_started'
  | 'response_received'
  | 'mutation_succeeded'
  | 'mutation_failed'
  | 'authoritative_state_applied';

export type MobileQaSafeErrorCode =
  | 'ABORTED'
  | 'API_400'
  | 'API_401'
  | 'API_403'
  | 'API_500'
  | 'API_ERROR'
  | 'AUTH_TOKEN_ERROR'
  | 'AUTH_TOKEN_UNAVAILABLE'
  | 'CONFIG_ERROR'
  | 'DUPLICATE_BLOCKED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'VALIDATION';

export interface MobileQaTraceContext {
  action: MobileQaAction;
  attemptId: string;
  screen: 'promotions-loyalty';
}

interface MobileQaEvent extends MobileQaTraceContext {
  stage: MobileQaStage;
  status?: number;
  safeErrorCode?: MobileQaSafeErrorCode;
  visitsRequired?: number;
  templateSelected?: boolean;
}

export class MobileMutationError extends Error {
  constructor(
    message: string,
    public readonly safeCode: MobileQaSafeErrorCode,
  ) {
    super(message);
    this.name = 'MobileMutationError';
  }
}

export function isMobilePhysicalQaTraceEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_PHYSICAL_QA_TRACE === 'true';
}

export function createMobileQaTraceContext(
  action: MobileQaAction,
  screen: MobileQaTraceContext['screen'],
): MobileQaTraceContext {
  attemptSequence = (attemptSequence + 1) % 1_000_000;
  return {
    action,
    attemptId: `qa-${Date.now().toString(36)}-${attemptSequence.toString(36)}`,
    screen,
  };
}

export function traceMobileQaEvent(event: MobileQaEvent): void {
  if (!isMobilePhysicalQaTraceEnabled()) return;

  const safeEvent = {
    timestamp: new Date().toISOString(),
    action: boundSafeText(event.action),
    stage: event.stage,
    attemptId: boundSafeText(event.attemptId),
    screen: event.screen,
    ...(event.status !== undefined ? { status: event.status } : {}),
    ...(event.safeErrorCode ? { safeErrorCode: event.safeErrorCode } : {}),
    ...(event.visitsRequired !== undefined
      ? { visitsRequired: event.visitsRequired }
      : {}),
    ...(event.templateSelected !== undefined
      ? { templateSelected: event.templateSelected }
      : {}),
  };

  // Expo forwards development console output to the harness-managed Metro log.
  // eslint-disable-next-line no-console
  console.info(`${TRACE_PREFIX} ${JSON.stringify(safeEvent)}`);
}

export function classifyMobileMutationError(
  error: unknown,
): MobileQaSafeErrorCode {
  if (error instanceof MobileMutationError) {
    return error.safeCode;
  }

  if (error instanceof ApiError) {
    if (error.status === 400) return 'API_400';
    if (error.status === 401) return 'API_401';
    if (error.status === 403) return 'API_403';
    if (error.status !== undefined && error.status >= 500) return 'API_500';
    return 'API_ERROR';
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: unknown;
      isAxiosError?: unknown;
      name?: unknown;
      response?: unknown;
    };
    if (candidate.code === 'ECONNABORTED') return 'TIMEOUT';
    if (
      candidate.code === 'ERR_CANCELED'
      || candidate.name === 'AbortError'
      || candidate.name === 'CanceledError'
    ) {
      return 'ABORTED';
    }
    if (candidate.name === 'PublicRuntimeConfigError') return 'CONFIG_ERROR';
    if (candidate.isAxiosError === true && candidate.response === undefined) {
      return 'NETWORK_ERROR';
    }
  }

  return 'UNKNOWN';
}

function boundSafeText(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]/gu, '_')
    .slice(0, MAX_SAFE_TEXT_LENGTH);
}
