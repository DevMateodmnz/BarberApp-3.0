import type { CorsOptions } from 'cors';

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

export interface ApiRuntimeConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl?: string;
  clerkSecretKey?: string;
  clerkWebhookSecret?: string;
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
    ],
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
