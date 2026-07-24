import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const PHYSICAL_QA_EVENT_TRACE_PREFIX = 'qa.mobile.event';
export const PHYSICAL_QA_RUNTIME_HEADER = 'x-barberapp-qa-runtime';
export const PHYSICAL_QA_CLIENT_HEADER = 'x-barberapp-qa-client';
export const PHYSICAL_QA_HEAD_HEADER = 'x-barberapp-qa-head';
export const PHYSICAL_QA_SESSION_HEADER = 'x-barberapp-qa-session';
export const PHYSICAL_QA_TRACE_VERSION = 1;

const safeIdentifier = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._/-]+$/u);

export const physicalQaMobileEventSchema = z
  .object({
    runtimeId: z.string().regex(/^[a-f0-9]{32}$/u),
    runtimeFingerprint: z.string().regex(/^[A-F0-9]{8}$/u),
    appSessionId: z
      .string()
      .min(8)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/u),
    eventType: z.enum([
      'app_started',
      'runtime_handshake_started',
      'runtime_handshake_succeeded',
      'runtime_handshake_failed',
      'screen_focused',
      'heartbeat',
      'mutation_stage',
    ]),
    screen: safeIdentifier.optional(),
    action: z.enum(['loyalty-program-save']).optional(),
    attemptId: safeIdentifier.optional(),
    stage: z
      .enum([
        'press_received',
        'validation_started',
        'validation_failed',
        'mutation_started',
        'token_started',
        'request_started',
        'response_received',
        'mutation_succeeded',
        'mutation_failed',
        'authoritative_state_applied',
      ])
      .optional(),
    appHead: z.string().regex(/^[a-f0-9]{40}$/u),
    timestamp: z.string().datetime({ offset: true }),
    safeErrorCategory: z
      .enum([
        'ABORTED',
        'API_400',
        'API_401',
        'API_403',
        'API_409',
        'API_500',
        'API_ERROR',
        'AUTH_TOKEN_ERROR',
        'AUTH_TOKEN_UNAVAILABLE',
        'CONFIG_ERROR',
        'DUPLICATE_BLOCKED',
        'HEAD_MISMATCH',
        'NETWORK_ERROR',
        'RUNTIME_MISMATCH',
        'TIMEOUT',
        'TRACE_TRANSPORT',
        'UNKNOWN',
        'VALIDATION',
      ])
      .optional(),
    status: z.number().int().min(100).max(599).optional(),
    visitsRequired: z.number().int().min(1).max(100).optional(),
    templateSelected: z.boolean().optional(),
    traceVersion: z.literal(PHYSICAL_QA_TRACE_VERSION),
    apiTarget: z
      .string()
      .url()
      .max(240)
      .refine((value) => new URL(value).pathname === '/api/v1'),
    appState: z.enum(['active', 'background', 'inactive']).optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.eventType === 'mutation_stage'
      && (!event.action || !event.attemptId || !event.stage)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'mutation_stage requires action, attemptId, and stage',
      });
    }
  });

export type PhysicalQaMobileEventInput = z.infer<
  typeof physicalQaMobileEventSchema
>;

export interface PersistedPhysicalQaMobileEvent
  extends PhysicalQaMobileEventInput {
  receivedAt: string;
}

export class BoundedPhysicalQaEventStore {
  constructor(
    private readonly filePath: string,
    private readonly maxBytes = 512 * 1024,
  ) {}

  append(event: PersistedPhysicalQaMobileEvent): void {
    const line = `${JSON.stringify(event)}\n`;
    if (Buffer.byteLength(line) > this.maxBytes) {
      throw new Error('Physical-QA event exceeds the bounded store size');
    }

    mkdirSync(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });

    if (
      existsSync(this.filePath)
      && statSync(this.filePath).size + Buffer.byteLength(line) > this.maxBytes
    ) {
      this.trimFor(line);
    }

    appendFileSync(this.filePath, line, {
      encoding: 'utf8',
      mode: 0o600,
    });
    chmodSync(this.filePath, 0o600);
  }

  private trimFor(nextLine: string): void {
    const source = readFileSync(this.filePath, 'utf8');
    const lines = source.split(/\r?\n/u).filter(Boolean);
    const targetBytes = Math.max(
      0,
      Math.floor(this.maxBytes * 0.75) - Buffer.byteLength(nextLine),
    );
    const retained: string[] = [];
    let retainedBytes = 0;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = `${lines[index]}\n`;
      const candidateBytes = Buffer.byteLength(candidate);
      if (retainedBytes + candidateBytes > targetBytes) {
        break;
      }
      retained.unshift(candidate);
      retainedBytes += candidateBytes;
    }

    writeFileSync(this.filePath, retained.join(''), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
