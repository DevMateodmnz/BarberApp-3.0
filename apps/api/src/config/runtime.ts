import type { CorsOptions } from 'cors';
import {
  readPaymentRuntimeConfig,
  type PaymentRuntimeConfig,
} from '../lib/payments/runtime.js';

export type NodeEnv = 'development' | 'test' | 'production';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  max: number;
}

export interface CorsPolicy {
  mode: 'deny-browser-origins' | 'explicit-allowlist';
  allowedOrigins: string[];
}

export interface PhysicalQaRuntimeConfig {
  runtimeId: string;
  fingerprint: string;
  repositoryHead: string;
  apiStartedAt: string;
  mobileEventsPath: string;
}

export interface ApiRuntimeConfig {
  nodeEnv: NodeEnv;
  port: number;
  physicalQaRequestTracing: boolean;
  physicalQa?: PhysicalQaRuntimeConfig;
  databaseUrl?: string;
  clerkSecretKey?: string;
  clerkWebhookSecret?: string;
  payments: PaymentRuntimeConfig;
  corsPolicy: CorsPolicy;
  rateLimit: RateLimitConfig;
}

function readRaw(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return typeof value === 'string' ? value : undefined;
}

function readOptionalNonEmpty(
  env: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const raw = readRaw(env, name);
  if (raw === undefined) {
    return undefined;
  }

  const value = raw.trim();
  if (value === '') {
    throw new Error(`${name} cannot be empty`);
  }

  return value;
}

function readRequiredInProduction(
  env: NodeJS.ProcessEnv,
  nodeEnv: NodeEnv,
  name: string
): string | undefined {
  const value = readOptionalNonEmpty(env, name);

  if (nodeEnv === 'production' && !value) {
    throw new Error(`${name} is required in production`);
  }

  return value;
}

function readNodeEnv(env: NodeJS.ProcessEnv): NodeEnv {
  const raw = readRaw(env, 'NODE_ENV');
  if (raw === undefined) {
    return 'development';
  }

  const value = raw.trim();
  if (value === '') {
    throw new Error('NODE_ENV cannot be empty');
  }

  if (
    value === 'development' ||
    value === 'test' ||
    value === 'production'
  ) {
    return value;
  }

  throw new Error('NODE_ENV must be one of development, test, or production');
}

function readPort(env: NodeJS.ProcessEnv): number {
  const raw = readRaw(env, 'PORT');
  if (raw === undefined) {
    return 3000;
  }

  const value = raw.trim();
  if (value === '') {
    throw new Error('PORT cannot be empty');
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be a whole number');
  }

  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}

function readBoolean(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean
): boolean {
  const raw = readRaw(env, name);
  if (raw === undefined) {
    return defaultValue;
  }

  const value = raw.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be "true" or "false"`);
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number
): number {
  const raw = readRaw(env, name);
  if (raw === undefined) {
    return defaultValue;
  }

  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readPhysicalQaRuntimeConfig(
  env: NodeJS.ProcessEnv,
  nodeEnv: NodeEnv,
): PhysicalQaRuntimeConfig | undefined {
  const enabled =
    nodeEnv === 'development'
    && readBoolean(env, 'PHYSICAL_QA_MODE', false);

  if (!enabled) {
    return undefined;
  }

  const runtimeId = readOptionalNonEmpty(env, 'BARBERAPP_QA_RUNTIME_ID');
  const fingerprint = readOptionalNonEmpty(
    env,
    'BARBERAPP_QA_RUNTIME_FINGERPRINT',
  );
  const repositoryHead = readOptionalNonEmpty(
    env,
    'BARBERAPP_QA_RUNTIME_HEAD',
  );
  const apiStartedAt = readOptionalNonEmpty(
    env,
    'BARBERAPP_QA_RUNTIME_STARTED_AT',
  );
  const mobileEventsPath = readOptionalNonEmpty(
    env,
    'BARBERAPP_QA_MOBILE_EVENTS_PATH',
  );

  if (!runtimeId || !/^[a-f0-9]{32}$/u.test(runtimeId)) {
    throw new Error(
      'BARBERAPP_QA_RUNTIME_ID must be a 32-character lowercase hexadecimal value',
    );
  }
  if (!fingerprint || !/^[A-F0-9]{8}$/u.test(fingerprint)) {
    throw new Error(
      'BARBERAPP_QA_RUNTIME_FINGERPRINT must be 8 uppercase hexadecimal characters',
    );
  }
  if (fingerprint !== runtimeId.slice(0, 8).toUpperCase()) {
    throw new Error(
      'BARBERAPP_QA_RUNTIME_FINGERPRINT must match the runtime ID prefix',
    );
  }
  if (!repositoryHead || !/^[a-f0-9]{40}$/u.test(repositoryHead)) {
    throw new Error(
      'BARBERAPP_QA_RUNTIME_HEAD must be a full 40-character Git commit hash',
    );
  }
  if (
    !apiStartedAt
    || !Number.isFinite(Date.parse(apiStartedAt))
    || new Date(apiStartedAt).toISOString() !== apiStartedAt
  ) {
    throw new Error(
      'BARBERAPP_QA_RUNTIME_STARTED_AT must be an ISO-8601 timestamp',
    );
  }
  if (!mobileEventsPath || !mobileEventsPath.startsWith('/')) {
    throw new Error(
      'BARBERAPP_QA_MOBILE_EVENTS_PATH must be an absolute local path',
    );
  }

  return {
    runtimeId,
    fingerprint,
    repositoryHead,
    apiStartedAt,
    mobileEventsPath,
  };
}

function parseConfiguredOrigin(value: string, source: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${source} contains an invalid origin: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${source} only supports http:// or https:// origins`);
  }

  if (url.username || url.password) {
    throw new Error(`${source} origins must not include credentials`);
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`${source} origins must not include a path`);
  }

  if (url.search) {
    throw new Error(`${source} origins must not include a query string`);
  }

  if (url.hash) {
    throw new Error(`${source} origins must not include a fragment`);
  }

  if (url.origin === 'null') {
    throw new Error(`${source} must be a valid HTTP(S) origin`);
  }

  return url.origin;
}

export function parseAllowedOrigins(
  raw: string,
  source = 'CORS_ALLOWED_ORIGINS'
): string[] {
  const parts = raw.split(',').map((part) => part.trim());

  if (parts.length === 0 || parts.every((part) => part === '')) {
    throw new Error(`${source} cannot be empty`);
  }

  if (parts.some((part) => part === '')) {
    throw new Error(`${source} contains an empty origin entry`);
  }

  const origins: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (part === '*') {
      throw new Error(`${source} must not contain "*" when credentials are enabled`);
    }

    const origin = parseConfiguredOrigin(part, source);
    if (!seen.has(origin)) {
      origins.push(origin);
      seen.add(origin);
    }
  }

  return origins;
}

function parseRequestOrigin(origin: string): string | false {
  const value = origin.trim();
  if (value === '') {
    return false;
  }

  try {
    const parsed = parseConfiguredOrigin(value, 'Origin');
    return parsed === value ? parsed : false;
  } catch {
    return false;
  }
}

function createCorsPolicy(allowedOriginValue?: string): CorsPolicy {
  if (allowedOriginValue) {
    return {
      mode: 'explicit-allowlist',
      allowedOrigins: parseAllowedOrigins(allowedOriginValue),
    };
  }

  return {
    mode: 'deny-browser-origins',
    allowedOrigins: [],
  };
}

export function resolveCorsOrigin(
  policy: CorsPolicy,
  requestOrigin?: string
): string | false {
  if (!requestOrigin) {
    return false;
  }

  const parsedOrigin = parseRequestOrigin(requestOrigin);
  if (!parsedOrigin) {
    return false;
  }

  if (policy.mode === 'deny-browser-origins') {
    return false;
  }

  return policy.allowedOrigins.includes(parsedOrigin) ? parsedOrigin : false;
}

export function createCorsOptions(policy: CorsPolicy): CorsOptions {
  return {
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-BarberApp-QA-Client',
      'X-BarberApp-QA-Head',
      'X-BarberApp-QA-Runtime',
      'X-BarberApp-QA-Session',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
    origin(requestOrigin, callback) {
      callback(null, resolveCorsOrigin(policy, requestOrigin ?? undefined));
    },
  };
}

export function readApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ApiRuntimeConfig {
  const nodeEnv = readNodeEnv(env);

  return {
    nodeEnv,
    port: readPort(env),
    physicalQaRequestTracing:
      nodeEnv === 'development'
      && readBoolean(env, 'PHYSICAL_QA_REQUEST_TRACE', false),
    physicalQa: readPhysicalQaRuntimeConfig(env, nodeEnv),
    databaseUrl: readRequiredInProduction(env, nodeEnv, 'DATABASE_URL'),
    clerkSecretKey: readRequiredInProduction(
      env,
      nodeEnv,
      'CLERK_SECRET_KEY'
    ),
    clerkWebhookSecret: readRequiredInProduction(
      env,
      nodeEnv,
      'CLERK_WEBHOOK_SECRET'
    ),
    payments: readPaymentRuntimeConfig(env),
    corsPolicy: createCorsPolicy(
      readOptionalNonEmpty(env, 'CORS_ALLOWED_ORIGINS')
    ),
    rateLimit: {
      enabled: readBoolean(
        env,
        'RATE_LIMIT_ENABLED',
        nodeEnv !== 'test'
      ),
      windowMs: readPositiveInteger(
        env,
        'RATE_LIMIT_WINDOW_MS',
        15 * 60 * 1000
      ),
      max: readPositiveInteger(env, 'RATE_LIMIT_MAX', 100),
    },
  };
}
