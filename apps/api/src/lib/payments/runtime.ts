import type { NodeEnv } from '../../config/runtime.js';
import { AppError } from '../errors.js';

export interface MercadoPagoRuntimeConfig {
  apiBaseUrl: string;
  authorizationBaseUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  webhookSecret?: string;
  oauthScope: string;
}

export interface PaymentRuntimeConfig {
  enabled: boolean;
  nodeEnv: NodeEnv;
  encryptionKey?: Buffer;
  publicWebBaseUrl?: string;
  webhookPublicUrl?: string;
  mercadoPago: MercadoPagoRuntimeConfig;
}

export interface EnabledPaymentRuntimeConfig extends PaymentRuntimeConfig {
  enabled: true;
  encryptionKey: Buffer;
  publicWebBaseUrl: string;
  webhookPublicUrl: string;
  mercadoPago: MercadoPagoRuntimeConfig & {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    webhookSecret: string;
  };
}

function readOptionalTrimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPaymentsEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.PAYMENTS_ENABLED;
  if (raw === undefined) {
    return false;
  }

  const value = raw.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error('PAYMENTS_ENABLED must be "true" or "false"');
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptionalTrimmed(env, name);
  if (!value) {
    throw new Error(`${name} is required when PAYMENTS_ENABLED=true`);
  }
  return value;
}

function normalizeBaseUrl(raw: string, name: string): string {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http:// or https://`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not include credentials`);
  }

  return parsed.toString().replace(/\/$/, '');
}

function normalizeWebhookUrl(raw: string, name: string): string {
  const normalized = normalizeBaseUrl(raw, name);
  const parsed = new URL(normalized);

  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not include a query string or fragment`);
  }

  return normalized;
}

function assertUrlPath(raw: string, name: string, expectedPath: string): void {
  if (new URL(raw).pathname !== expectedPath) {
    throw new Error(`${name} must use the ${expectedPath} path`);
  }
}

function assertPublicWebOrigin(raw: string): void {
  const parsed = new URL(raw);
  if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_WEB_BASE_URL must be an origin without a path, query string, or fragment');
  }
}

function assertProductionHttps(nodeEnv: NodeEnv, values: Array<[string, string]>): void {
  if (nodeEnv !== 'production') {
    return;
  }

  for (const [name, value] of values) {
    if (new URL(value).protocol !== 'https:') {
      throw new Error(`${name} must use https:// in production`);
    }
  }
}

function decodeEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();

  const candidates = [
    () => Buffer.from(trimmed, 'base64url'),
    () => Buffer.from(trimmed, 'base64'),
    () => Buffer.from(trimmed, 'hex'),
    () => Buffer.from(trimmed, 'utf8'),
  ];

  for (const candidate of candidates) {
    const decoded = candidate();
    if (decoded.length === 32) {
      return decoded;
    }
  }

  throw new Error(
    'PAYMENT_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256-GCM key)'
  );
}

export function readPaymentRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): PaymentRuntimeConfig {
  const nodeEnv = (env.NODE_ENV?.trim() || 'development') as NodeEnv;
  const enabled = readPaymentsEnabled(env);
  const apiBaseUrl = normalizeBaseUrl(
    readOptionalTrimmed(env, 'MERCADO_PAGO_API_BASE_URL') ?? 'https://api.mercadopago.com',
    'MERCADO_PAGO_API_BASE_URL'
  );
  const authorizationBaseUrl = normalizeBaseUrl(
    readOptionalTrimmed(env, 'MERCADO_PAGO_AUTHORIZATION_BASE_URL') ?? 'https://auth.mercadopago.com',
    'MERCADO_PAGO_AUTHORIZATION_BASE_URL'
  );
  const oauthScope =
    readOptionalTrimmed(env, 'MERCADO_PAGO_OAUTH_SCOPE') ?? 'offline_access read write';

  if (!enabled) {
    return {
      enabled: false,
      nodeEnv,
      mercadoPago: {
        apiBaseUrl,
        authorizationBaseUrl,
        oauthScope,
      },
    };
  }

  const config: EnabledPaymentRuntimeConfig = {
    enabled: true,
    nodeEnv,
    encryptionKey: decodeEncryptionKey(
      readRequired(env, 'PAYMENT_CREDENTIAL_ENCRYPTION_KEY')
    ),
    publicWebBaseUrl: normalizeBaseUrl(
      readRequired(env, 'PUBLIC_WEB_BASE_URL'),
      'PUBLIC_WEB_BASE_URL'
    ),
    webhookPublicUrl: normalizeWebhookUrl(
      readRequired(env, 'PAYMENT_WEBHOOK_PUBLIC_URL'),
      'PAYMENT_WEBHOOK_PUBLIC_URL'
    ),
    mercadoPago: {
      apiBaseUrl,
      authorizationBaseUrl,
      clientId: readRequired(env, 'MERCADO_PAGO_CLIENT_ID'),
      clientSecret: readRequired(env, 'MERCADO_PAGO_CLIENT_SECRET'),
      redirectUri: normalizeWebhookUrl(
        readRequired(env, 'MERCADO_PAGO_REDIRECT_URI'),
        'MERCADO_PAGO_REDIRECT_URI'
      ),
      webhookSecret: readRequired(env, 'MERCADO_PAGO_WEBHOOK_SECRET'),
      oauthScope,
    },
  };

  assertPublicWebOrigin(config.publicWebBaseUrl);
  assertUrlPath(
    config.webhookPublicUrl,
    'PAYMENT_WEBHOOK_PUBLIC_URL',
    '/api/v1/webhooks/mercado-pago'
  );
  assertUrlPath(
    config.mercadoPago.redirectUri,
    'MERCADO_PAGO_REDIRECT_URI',
    '/api/v1/payments/mercado-pago/oauth/callback'
  );
  assertProductionHttps(nodeEnv, [
    ['PUBLIC_WEB_BASE_URL', config.publicWebBaseUrl],
    ['PAYMENT_WEBHOOK_PUBLIC_URL', config.webhookPublicUrl],
    ['MERCADO_PAGO_REDIRECT_URI', config.mercadoPago.redirectUri],
    ['MERCADO_PAGO_API_BASE_URL', config.mercadoPago.apiBaseUrl],
    ['MERCADO_PAGO_AUTHORIZATION_BASE_URL', config.mercadoPago.authorizationBaseUrl],
  ]);

  return config;
}

export function requirePaymentsEnabled(
  runtime: PaymentRuntimeConfig = readPaymentRuntimeConfig(process.env)
): EnabledPaymentRuntimeConfig {
  if (!runtime.enabled) {
    throw new AppError(
      503,
      'PAYMENTS_DISABLED',
      'Payment processing is not enabled for this deployment'
    );
  }

  return runtime as EnabledPaymentRuntimeConfig;
}
