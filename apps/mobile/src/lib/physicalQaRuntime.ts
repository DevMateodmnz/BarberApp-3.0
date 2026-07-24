import type {
  MobilePhysicalQaRuntime,
  MobilePublicRuntime,
} from '@/config/publicRuntime.js';
import { getMobilePublicRuntimeResult } from '@/config/publicRuntime.js';

export const PHYSICAL_QA_TRACE_VERSION = 1;
export const PHYSICAL_QA_HEARTBEAT_INTERVAL_MS = 20_000;

export type PhysicalQaRuntimeStatus =
  | 'disabled'
  | 'checking'
  | 'ready'
  | 'mismatch'
  | 'failed';

export type PhysicalQaAppState = 'active' | 'background' | 'inactive';

export interface PhysicalQaRuntimeSnapshot {
  enabled: boolean;
  status: PhysicalQaRuntimeStatus;
  fingerprint?: string;
  appHead?: string;
  apiHead?: string;
  apiTarget?: string;
  appSessionId?: string;
  lastHeartbeatAt?: string;
  lastFocusedScreen?: string;
  traceEnabled: boolean;
  safeErrorCategory?: PhysicalQaSafeErrorCategory;
}

export type PhysicalQaSafeErrorCategory =
  | 'ABORTED'
  | 'API_400'
  | 'API_401'
  | 'API_403'
  | 'API_409'
  | 'API_500'
  | 'API_ERROR'
  | 'AUTH_TOKEN_ERROR'
  | 'AUTH_TOKEN_UNAVAILABLE'
  | 'CONFIG_ERROR'
  | 'DUPLICATE_BLOCKED'
  | 'HEAD_MISMATCH'
  | 'NETWORK_ERROR'
  | 'RUNTIME_MISMATCH'
  | 'TIMEOUT'
  | 'TRACE_TRANSPORT'
  | 'UNKNOWN'
  | 'VALIDATION';

export type PhysicalQaMobileEventType =
  | 'app_started'
  | 'runtime_handshake_started'
  | 'runtime_handshake_succeeded'
  | 'runtime_handshake_failed'
  | 'screen_focused'
  | 'heartbeat'
  | 'mutation_stage';

export interface PhysicalQaMutationStageInput {
  action: 'loyalty-program-save';
  attemptId: string;
  screen: string;
  stage:
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
  status?: number;
  safeErrorCategory?: PhysicalQaSafeErrorCategory;
  visitsRequired?: number;
  templateSelected?: boolean;
}

interface PhysicalQaMobileEvent {
  runtimeId: string;
  runtimeFingerprint: string;
  appSessionId: string;
  eventType: PhysicalQaMobileEventType;
  screen?: string;
  action?: 'loyalty-program-save';
  attemptId?: string;
  stage?: PhysicalQaMutationStageInput['stage'];
  appHead: string;
  timestamp: string;
  safeErrorCategory?: PhysicalQaSafeErrorCategory;
  status?: number;
  visitsRequired?: number;
  templateSelected?: boolean;
  traceVersion: 1;
  apiTarget: string;
  appState?: PhysicalQaAppState;
}

interface PhysicalQaRuntimeResponse {
  success: true;
  data: {
    runtimeId: string;
    runtimeFingerprint: string;
    repositoryHead: string;
    apiStartedAt: string;
    physicalQaMode: true;
    traceVersion: 1;
  };
}

export interface PhysicalQaRuntimeTransport {
  readRuntime: (
    apiBaseUrl: string,
    runtimeId: string,
    identity: { appHead: string; appSessionId: string },
  ) => Promise<PhysicalQaRuntimeResponse>;
  sendEvent: (
    apiBaseUrl: string,
    runtimeId: string,
    event: PhysicalQaMobileEvent,
  ) => Promise<void>;
}

interface PhysicalQaRuntimeControllerOptions {
  runtime: MobilePublicRuntime;
  transport?: PhysicalQaRuntimeTransport;
  now?: () => Date;
  createSessionId?: () => string;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

type Listener = () => void;

export class PhysicalQaRuntimeController {
  private readonly qa: MobilePhysicalQaRuntime | undefined;
  private readonly transport: PhysicalQaRuntimeTransport;
  private readonly now: () => Date;
  private readonly appSessionId: string;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly listeners = new Set<Listener>();
  private appState: PhysicalQaAppState = 'active';
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private handshakePromise: Promise<void> | null = null;
  private snapshot: PhysicalQaRuntimeSnapshot;

  constructor(private readonly options: PhysicalQaRuntimeControllerOptions) {
    this.qa = options.runtime.physicalQa;
    this.transport = options.transport ?? createFetchPhysicalQaTransport();
    this.now = options.now ?? (() => new Date());
    this.appSessionId =
      options.createSessionId?.() ?? createEphemeralAppSessionId();
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.snapshot = this.qa
      ? {
          enabled: true,
          status: 'checking',
          fingerprint: this.qa.fingerprint,
          appHead: this.qa.repositoryHead,
          apiTarget: options.runtime.apiBaseUrl,
          appSessionId: this.appSessionId,
          traceEnabled: this.qa.traceEnabled,
        }
      : {
          enabled: false,
          status: 'disabled',
          traceEnabled: false,
        };
  }

  getSnapshot = (): PhysicalQaRuntimeSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): Promise<void> {
    if (!this.qa || this.handshakePromise) {
      return this.handshakePromise ?? Promise.resolve();
    }

    this.handshakePromise = this.performHandshake().finally(() => {
      this.handshakePromise = null;
    });
    return this.handshakePromise;
  }

  stop(): void {
    this.stopHeartbeat();
  }

  setAppState(state: PhysicalQaAppState): void {
    this.appState = state;
    if (!this.qa) return;

    if (state === 'active') {
      if (this.snapshot.status === 'ready') {
        void this.emitHeartbeat();
        this.startHeartbeat();
      } else {
        void this.start();
      }
      return;
    }

    this.stopHeartbeat();
  }

  focusScreen(screen: string): void {
    if (!this.qa || this.snapshot.status !== 'ready') return;
    const safeScreen = boundIdentifier(screen);
    this.update({ lastFocusedScreen: safeScreen });
    void this.sendEvent({
      eventType: 'screen_focused',
      screen: safeScreen,
    }).catch(() => this.markTransportFailure());
  }

  emitMutationStage(input: PhysicalQaMutationStageInput): void {
    if (!this.qa || this.snapshot.status !== 'ready') return;
    void this.sendEvent({
      eventType: 'mutation_stage',
      ...input,
      screen: boundIdentifier(input.screen),
      attemptId: boundIdentifier(input.attemptId),
    }).catch(() => this.markTransportFailure());
  }

  private async performHandshake(): Promise<void> {
    if (!this.qa) return;
    this.update({
      status: 'checking',
      safeErrorCategory: undefined,
    });

    try {
      await this.sendEvent({ eventType: 'app_started' });
      await this.sendEvent({ eventType: 'runtime_handshake_started' });
      const response = await this.transport.readRuntime(
        this.options.runtime.apiBaseUrl,
        this.qa.runtimeId,
        {
          appHead: this.qa.repositoryHead,
          appSessionId: this.appSessionId,
        },
      );

      if (
        response.data.runtimeId !== this.qa.runtimeId
        || response.data.runtimeFingerprint !== this.qa.fingerprint
      ) {
        await this.failHandshake('RUNTIME_MISMATCH', 'mismatch');
        return;
      }
      if (response.data.repositoryHead !== this.qa.repositoryHead) {
        await this.failHandshake('HEAD_MISMATCH', 'mismatch');
        return;
      }
      if (
        response.data.physicalQaMode !== true
        || response.data.traceVersion !== PHYSICAL_QA_TRACE_VERSION
      ) {
        await this.failHandshake('CONFIG_ERROR', 'failed');
        return;
      }

      await this.sendEvent({
        eventType: 'runtime_handshake_succeeded',
      });
      this.update({
        status: 'ready',
        apiHead: response.data.repositoryHead,
        safeErrorCategory: undefined,
      });
      await this.emitHeartbeat();
      this.startHeartbeat();
    } catch (error) {
      const category = classifyHandshakeFailure(error);
      this.update({
        status:
          category === 'RUNTIME_MISMATCH' || category === 'HEAD_MISMATCH'
            ? 'mismatch'
            : 'failed',
        safeErrorCategory: category,
      });
      this.stopHeartbeat();
    }
  }

  private async failHandshake(
    category: PhysicalQaSafeErrorCategory,
    status: Extract<PhysicalQaRuntimeStatus, 'mismatch' | 'failed'>,
  ): Promise<void> {
    try {
      await this.sendEvent({
        eventType: 'runtime_handshake_failed',
        safeErrorCategory: category,
      });
    } finally {
      this.update({ status, safeErrorCategory: category });
      this.stopHeartbeat();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.appState !== 'active' || this.snapshot.status !== 'ready') {
      return;
    }
    this.heartbeatTimer = this.setIntervalFn(() => {
      void this.emitHeartbeat();
    }, PHYSICAL_QA_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async emitHeartbeat(): Promise<void> {
    if (
      !this.qa
      || this.appState !== 'active'
      || this.snapshot.status !== 'ready'
    ) {
      return;
    }
    try {
      const timestamp = this.now().toISOString();
      await this.sendEvent({
        eventType: 'heartbeat',
        appState: this.appState,
      });
      this.update({ lastHeartbeatAt: timestamp });
    } catch {
      this.markTransportFailure();
    }
  }

  private async sendEvent(
    input: Omit<
      PhysicalQaMobileEvent,
      | 'runtimeId'
      | 'runtimeFingerprint'
      | 'appSessionId'
      | 'appHead'
      | 'timestamp'
      | 'traceVersion'
      | 'apiTarget'
    >,
  ): Promise<void> {
    if (!this.qa) return;
    await this.transport.sendEvent(
      this.options.runtime.apiBaseUrl,
      this.qa.runtimeId,
      {
        runtimeId: this.qa.runtimeId,
        runtimeFingerprint: this.qa.fingerprint,
        appSessionId: this.appSessionId,
        appHead: this.qa.repositoryHead,
        timestamp: this.now().toISOString(),
        traceVersion: PHYSICAL_QA_TRACE_VERSION,
        apiTarget: this.options.runtime.apiBaseUrl,
        ...input,
      },
    );
  }

  private markTransportFailure(): void {
    this.stopHeartbeat();
    this.update({
      status: 'failed',
      safeErrorCategory: 'TRACE_TRANSPORT',
    });
  }

  private update(
    partial: Partial<PhysicalQaRuntimeSnapshot>,
  ): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.listeners.forEach((listener) => listener());
  }
}

export function createEphemeralAppSessionId(
  now = Date.now(),
  random = Math.random(),
): string {
  const entropy = Math.floor(random * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .padStart(10, '0')
    .slice(0, 10);
  return `app-${now.toString(36)}-${entropy}`;
}

export function createFetchPhysicalQaTransport(
  fetchFn: typeof fetch = fetch,
): PhysicalQaRuntimeTransport {
  return {
    async readRuntime(apiBaseUrl, runtimeId, identity) {
      const response = await fetchFn(`${apiBaseUrl}/qa/runtime`, {
        method: 'GET',
        headers: createQaHeaders(runtimeId, identity),
      });
      const body = await response.json() as
        | PhysicalQaRuntimeResponse
        | { error?: { code?: string } };
      if (!response.ok) {
        throw createTransportError(
          response.status,
          body as { error?: { code?: string } },
        );
      }
      return body as PhysicalQaRuntimeResponse;
    },
    async sendEvent(apiBaseUrl, runtimeId, event) {
      const response = await fetchFn(`${apiBaseUrl}/qa/mobile-events`, {
        method: 'POST',
        headers: createQaHeaders(runtimeId, event),
        body: JSON.stringify(event),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as {
          error?: { code?: string };
        };
        throw createTransportError(response.status, body);
      }
    },
  };
}

function createQaHeaders(
  runtimeId: string,
  identity: { appHead: string; appSessionId: string },
): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-BarberApp-QA-Client': 'mobile',
    'X-BarberApp-QA-Head': identity.appHead,
    'X-BarberApp-QA-Runtime': runtimeId,
    'X-BarberApp-QA-Session': identity.appSessionId,
  };
}

function createTransportError(
  status: number,
  body: { error?: { code?: string } },
): Error & { status: number; code?: string } {
  const error = new Error('Physical-QA transport request failed') as Error & {
    status: number;
    code?: string;
  };
  error.status = status;
  error.code = body.error?.code;
  return error;
}

function classifyHandshakeFailure(
  error: unknown,
): PhysicalQaSafeErrorCategory {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; status?: unknown };
    if (candidate.code === 'QA_RUNTIME_MISMATCH') return 'RUNTIME_MISMATCH';
    if (candidate.code === 'QA_HEAD_MISMATCH') return 'HEAD_MISMATCH';
    if (candidate.status === 409) return 'RUNTIME_MISMATCH';
    if (candidate.status === 400) return 'API_400';
    if (candidate.status === 401) return 'API_401';
    if (candidate.status === 403) return 'API_403';
    if (typeof candidate.status === 'number' && candidate.status >= 500) {
      return 'API_500';
    }
  }
  return 'TRACE_TRANSPORT';
}

function boundIdentifier(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._/-]/gu, '_')
    .slice(0, 80);
}

const runtimeResult = getMobilePublicRuntimeResult();
export const physicalQaRuntimeController =
  runtimeResult.ok
    ? new PhysicalQaRuntimeController({ runtime: runtimeResult.value })
    : null;

export function emitPhysicalQaMutationStage(
  input: PhysicalQaMutationStageInput,
): void {
  physicalQaRuntimeController?.emitMutationStage(input);
}
