import { randomOpaqueToken } from './crypto.js';

export function generatePaymentExternalReference(): string {
  return `pay_${randomOpaqueToken(24)}`;
}

export function isPaymentExternalReference(value: string): boolean {
  return /^pay_[A-Za-z0-9_-]{16,128}$/u.test(value.trim());
}
