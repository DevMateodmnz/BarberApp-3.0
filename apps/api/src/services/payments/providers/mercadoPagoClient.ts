import { AppError } from '../../../lib/errors.js';
import type { PaymentRuntimeConfig } from '../../../lib/payments/runtime.js';

export interface MercadoPagoOAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  publicKey: string | null;
  sellerId: string | null;
  scope: string | null;
  expiresInSeconds: number | null;
}

export interface MercadoPagoPreferenceResult {
  id: string;
  initPoint: string | null;
  sandboxInitPoint: string | null;
  expires: boolean | null;
  expirationDateFrom: string | null;
  expirationDateTo: string | null;
}

export interface MercadoPagoPaymentDetails {
  id: string;
  status: string | null;
  statusDetail: string | null;
  currencyId: string | null;
  transactionAmount: number | null;
  externalReference: string | null;
  collectorId: string | null;
  dateApproved: string | null;
}

export interface MercadoPagoTransport {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
}

const defaultTransport: MercadoPagoTransport = {
  fetch: (input, init) => fetch(input, init),
};

let transport: MercadoPagoTransport = defaultTransport;

export function setMercadoPagoTransportForTests(next: MercadoPagoTransport | null) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test Mercado Pago transport cannot be configured in production');
  }

  transport = next ?? defaultTransport;
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_INVALID_RESPONSE',
      'Mercado Pago returned an invalid JSON response'
    );
  }
}

async function requestMercadoPago(
  runtime: PaymentRuntimeConfig,
  path: string,
  init: RequestInit,
  options: { tolerateStatuses?: number[] } = {}
): Promise<Record<string, unknown>> {
  const response = await transport.fetch(`${runtime.mercadoPago.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = await parseJson(response);

  if (!response.ok && !(options.tolerateStatuses ?? []).includes(response.status)) {
    const message = typeof payload.message === 'string'
      ? payload.message
      : 'Mercado Pago request failed';
    throw new AppError(502, 'PAYMENT_PROVIDER_REQUEST_FAILED', message);
  }

  return payload;
}

export function buildMercadoPagoAuthorizationUrl(input: {
  runtime: PaymentRuntimeConfig;
  state: string;
  codeChallenge: string;
}): string {
  const clientId = input.runtime.mercadoPago.clientId;
  const redirectUri = input.runtime.mercadoPago.redirectUri;

  if (!clientId || !redirectUri) {
    throw new AppError(
      500,
      'PAYMENT_PROVIDER_CONFIGURATION_ERROR',
      'Mercado Pago OAuth is not configured'
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: input.state,
    redirect_uri: redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    scope: input.runtime.mercadoPago.oauthScope,
  });

  return `${input.runtime.mercadoPago.authorizationBaseUrl}/authorization?${params.toString()}`;
}

export async function exchangeMercadoPagoAuthorizationCode(input: {
  runtime: PaymentRuntimeConfig;
  code: string;
  codeVerifier: string;
}): Promise<MercadoPagoOAuthTokenResult> {
  const { clientId, clientSecret, redirectUri } = input.runtime.mercadoPago;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(500, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'Mercado Pago OAuth is not configured');
  }

  const payload = await requestMercadoPago(
    input.runtime,
    '/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: redirectUri,
        code_verifier: input.codeVerifier,
      }),
    }
  );

  return {
    accessToken: String(payload.access_token ?? ''),
    refreshToken: String(payload.refresh_token ?? ''),
    publicKey: typeof payload.public_key === 'string' ? payload.public_key : null,
    sellerId: payload.user_id !== undefined && payload.user_id !== null ? String(payload.user_id) : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
    expiresInSeconds: typeof payload.expires_in === 'number' ? payload.expires_in : null,
  };
}

export async function refreshMercadoPagoAuthorization(input: {
  runtime: PaymentRuntimeConfig;
  refreshToken: string;
}): Promise<MercadoPagoOAuthTokenResult> {
  const { clientId, clientSecret } = input.runtime.mercadoPago;

  if (!clientId || !clientSecret) {
    throw new AppError(500, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'Mercado Pago OAuth is not configured');
  }

  const payload = await requestMercadoPago(
    input.runtime,
    '/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
      }),
    }
  );

  return {
    accessToken: String(payload.access_token ?? ''),
    refreshToken: String(payload.refresh_token ?? ''),
    publicKey: typeof payload.public_key === 'string' ? payload.public_key : null,
    sellerId: payload.user_id !== undefined && payload.user_id !== null ? String(payload.user_id) : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
    expiresInSeconds: typeof payload.expires_in === 'number' ? payload.expires_in : null,
  };
}

export async function createMercadoPagoCheckoutPreference(input: {
  runtime: PaymentRuntimeConfig;
  accessToken: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}): Promise<MercadoPagoPreferenceResult> {
  const payload = await requestMercadoPago(
    input.runtime,
    '/checkout/preferences',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(input.body),
    }
  );

  return {
    id: String(payload.id ?? ''),
    initPoint: typeof payload.init_point === 'string' ? payload.init_point : null,
    sandboxInitPoint:
      typeof payload.sandbox_init_point === 'string' ? payload.sandbox_init_point : null,
    expires: typeof payload.expires === 'boolean' ? payload.expires : null,
    expirationDateFrom:
      typeof payload.expiration_date_from === 'string' ? payload.expiration_date_from : null,
    expirationDateTo:
      typeof payload.expiration_date_to === 'string' ? payload.expiration_date_to : null,
  };
}

export async function getMercadoPagoPaymentById(input: {
  runtime: PaymentRuntimeConfig;
  accessToken: string;
  paymentId: string;
}): Promise<MercadoPagoPaymentDetails> {
  const payload = await requestMercadoPago(
    input.runtime,
    `/v1/payments/${encodeURIComponent(input.paymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    }
  );

  return {
    id: String(payload.id ?? input.paymentId),
    status: typeof payload.status === 'string' ? payload.status : null,
    statusDetail: typeof payload.status_detail === 'string' ? payload.status_detail : null,
    currencyId: typeof payload.currency_id === 'string' ? payload.currency_id : null,
    transactionAmount:
      typeof payload.transaction_amount === 'number' ? payload.transaction_amount : null,
    externalReference:
      typeof payload.external_reference === 'string' ? payload.external_reference : null,
    collectorId:
      payload.collector_id !== undefined && payload.collector_id !== null
        ? String(payload.collector_id)
        : null,
    dateApproved:
      typeof payload.date_approved === 'string' ? payload.date_approved : null,
  };
}
