import type { NodeEnv } from '../../config/runtime.js';

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
  nodeEnv: NodeEnv;
  encryptionKey: Buffer;
  publicWebBaseUrl?: string;
  webhookPublicUrl?: string;
  mercadoPago: MercadoPagoRuntimeConfig;
}

function readOptionalTrimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

  return parsed.toString().replace(/\/$/, '');
}

function normalizeWebhookUrl(raw: string, name: string): string {
  const normalized = normalizeBaseUrl(raw, name);
  const parsed = new URL(normalized);

  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not include credentials`);
  }

  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not include a query string or fragment`);
  }

  return normalized;
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
  const encryptionKeyRaw = readOptionalTrimmed(env, 'PAYMENT_CREDENTIAL_ENCRYPTION_KEY');

  if (!encryptionKeyRaw) {
    throw new Error('PAYMENT_CREDENTIAL_ENCRYPTION_KEY is required');
  }

  const encryptionKey = decodeEncryptionKey(encryptionKeyRaw);

  const mercadoPago: MercadoPagoRuntimeConfig = {
    apiBaseUrl: normalizeBaseUrl(
      readOptionalTrimmed(env, 'MERCADO_PAGO_API_BASE_URL') ?? 'https://api.mercadopago.com',
      'MERCADO_PAGO_API_BASE_URL'
    ),
    authorizationBaseUrl: normalizeBaseUrl(
      readOptionalTrimmed(env, 'MERCADO_PAGO_AUTHORIZATION_BASE_URL') ?? 'https://auth.mercadopago.com',
      'MERCADO_PAGO_AUTHORIZATION_BASE_URL'
    ),
    clientId: readOptionalTrimmed(env, 'MERCADO_PAGO_CLIENT_ID'),
    clientSecret: readOptionalTrimmed(env, 'MERCADO_PAGO_CLIENT_SECRET'),
    redirectUri: readOptionalTrimmed(env, 'MERCADO_PAGO_REDIRECT_URI'),
    webhookSecret: readOptionalTrimmed(env, 'MERCADO_PAGO_WEBHOOK_SECRET'),
    oauthScope:
      readOptionalTrimmed(env, 'MERCADO_PAGO_OAUTH_SCOPE') ?? 'offline_access read write',
  };

  if (nodeEnv === 'production') {
    if (!mercadoPago.clientId) {
      throw new Error('MERCADO_PAGO_CLIENT_ID is required in production');
    }

    if (!mercadoPago.clientSecret) {
      throw new Error('MERCADO_PAGO_CLIENT_SECRET is required in production');
    }

    if (!mercadoPago.redirectUri) {
      throw new Error('MERCADO_PAGO_REDIRECT_URI is required in production');
    }

    if (!mercadoPago.webhookSecret) {
      throw new Error('MERCADO_PAGO_WEBHOOK_SECRET is required in production');
    }
  }

  const publicWebBaseUrl = readOptionalTrimmed(env, 'PUBLIC_WEB_BASE_URL');
  const webhookPublicUrl =
    readOptionalTrimmed(env, 'PAYMENT_WEBHOOK_PUBLIC_URL')
    ?? (nodeEnv === 'production' ? undefined : 'http://localhost:3000/api/v1/webhooks/mercado-pago');

  return {
    nodeEnv,
    encryptionKey,
    publicWebBaseUrl: publicWebBaseUrl
      ? normalizeBaseUrl(publicWebBaseUrl, 'PUBLIC_WEB_BASE_URL')
      : undefined,
    webhookPublicUrl: webhookPublicUrl
      ? normalizeWebhookUrl(webhookPublicUrl, 'PAYMENT_WEBHOOK_PUBLIC_URL')
      : undefined,
    mercadoPago,
  };
}
