import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENVELOPE_VERSION = 'v1';

export function encryptPaymentSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptPaymentSecret(ciphertext: string, key: Buffer): string {
  const [version, ivEncoded, tagEncoded, bodyEncoded] = ciphertext.split('.');
  if (
    version !== ENVELOPE_VERSION
    || !ivEncoded
    || !tagEncoded
    || !bodyEncoded
    || ciphertext.split('.').length !== 4
  ) {
    throw new Error('Unsupported encrypted payment secret format');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');
  const body = Buffer.from(bodyEncoded, 'base64url');
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH || body.length === 0) {
    throw new Error('Unsupported encrypted payment secret format');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  return decrypted.toString('utf8');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function timingSafeEqualHex(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}
