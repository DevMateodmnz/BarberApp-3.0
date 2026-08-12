import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateMercadoPagoWebhookSignature } from '../../src/services/payments/bookingPaymentService.js';

function buildSignature(input: {
  dataId: string;
  requestId: string;
  ts: string;
}) {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
  const v1 = crypto
    .createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET!)
    .update(manifest)
    .digest('hex');

  return `ts=${input.ts},v1=${v1}`;
}

describe('validateMercadoPagoWebhookSignature', () => {
  it('accepts the official Mercado Pago manifest signature', () => {
    expect(
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from(JSON.stringify({ data: { id: '123' } })),
        xSignature: buildSignature({
          dataId: '123',
          requestId: 'req-123',
          ts: '1721170000',
        }),
        xRequestId: 'req-123',
        dataId: '123',
      })
    ).toEqual({ timestamp: '1721170000' });
  });

  it('rejects mismatched signatures', () => {
    expect(() =>
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from('{}'),
        xSignature: 'ts=1721170000,v1=deadbeef',
        xRequestId: 'req-123',
        dataId: '123',
      })
    ).toThrow(/invalid mercado pago webhook signature/i);
  });

  it('rejects missing signature headers', () => {
    expect(() =>
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from('{}'),
        xSignature: undefined,
        xRequestId: undefined,
        dataId: undefined,
      })
    ).toThrow(/missing mercado pago webhook signature data/i);
  });

  it('rejects duplicate signature keys', () => {
    expect(() =>
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from('{}'),
        xSignature: `ts=1721170000,ts=1721170001,v1=${'a'.repeat(64)}`,
        xRequestId: 'req-123',
        dataId: '123',
      })
    ).toThrow(/invalid mercado pago webhook signature/i);
  });

  it('rejects encoded data ids', () => {
    expect(() =>
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from('{}'),
        xSignature: buildSignature({
          dataId: '123',
          requestId: 'req-123',
          ts: '1721170000',
        }),
        xRequestId: 'req-123',
        dataId: '123',
        rawDataId: '12%33',
      })
    ).toThrow(/invalid mercado pago webhook signature/i);
  });

  it('rejects oversized signature headers', () => {
    expect(() =>
      validateMercadoPagoWebhookSignature({
        rawBody: Buffer.from('{}'),
        xSignature: `ts=1721170000,v1=${'a'.repeat(600)}`,
        xRequestId: 'req-123',
        dataId: '123',
      })
    ).toThrow(/invalid mercado pago webhook signature/i);
  });
});
