import { afterEach, describe, expect, it } from 'vitest';
import { readPaymentRuntimeConfig } from '../../src/lib/payments/runtime.js';
import {
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoCheckoutPreference,
  setMercadoPagoTransportForTests,
} from '../../src/services/payments/providers/mercadoPagoClient.js';

const runtime = readPaymentRuntimeConfig(process.env);

describe('mercadoPagoClient', () => {
  afterEach(() => {
    setMercadoPagoTransportForTests(null);
  });

  it('builds an OAuth authorization URL with PKCE and state', () => {
    const url = new URL(
      buildMercadoPagoAuthorizationUrl({
        runtime,
        state: 'state-123',
        codeChallenge: 'challenge-456',
      })
    );

    expect(url.origin).toBe('https://auth.mercadopago.com');
    expect(url.pathname).toBe('/authorization');
    expect(url.searchParams.get('client_id')).toBe(process.env.MERCADO_PAGO_CLIENT_ID);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-456');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('sends Checkout Pro preferences with seller auth and idempotency headers', async () => {
    let capturedRequest: RequestInit | undefined;

    setMercadoPagoTransportForTests({
      async fetch(_input, init) {
        capturedRequest = init;
        return new Response(
          JSON.stringify({
            id: 'pref_123',
            init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref_123',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    const result = await createMercadoPagoCheckoutPreference({
      runtime,
      accessToken: 'seller-token',
      idempotencyKey: 'payment-ext-ref',
      body: {
        external_reference: 'payment-ext-ref',
        items: [{ title: 'Seña', quantity: 1, currency_id: 'ARS', unit_price: 25 }],
      },
    });

    expect(result.id).toBe('pref_123');
    expect(result.initPoint).toContain('pref_123');
    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.headers).toMatchObject({
      Authorization: 'Bearer seller-token',
      'Content-Type': 'application/json',
      'X-Idempotency-Key': 'payment-ext-ref',
    });
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      external_reference: 'payment-ext-ref',
    });
  });
});
