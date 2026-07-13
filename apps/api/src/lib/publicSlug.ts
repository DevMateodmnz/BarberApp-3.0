import { ValidationError } from './errors.js';

export const PUBLIC_SLUG_MIN_LENGTH = 3;
export const PUBLIC_SLUG_MAX_LENGTH = 50;
export const PUBLIC_BOOKING_ROOT_SEGMENT = 'barberias';

export const RESERVED_PUBLIC_SLUGS = new Set([
  'api',
  'admin',
  'app',
  'assets',
  'auth',
  'health',
  'login',
  'signup',
  'static',
  'www',
  PUBLIC_BOOKING_ROOT_SEGMENT,
]);

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicSlugValidationFailureReason =
  | 'length'
  | 'format'
  | 'reserved';

export type PublicSlugValidationResult =
  | { success: true }
  | { success: false; reason: PublicSlugValidationFailureReason };

export function isReservedPublicSlug(slug: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(slug);
}

export function validatePublicSlug(slug: string): PublicSlugValidationResult {
  if (
    slug.length < PUBLIC_SLUG_MIN_LENGTH ||
    slug.length > PUBLIC_SLUG_MAX_LENGTH
  ) {
    return {
      success: false,
      reason: 'length',
    };
  }

  if (!PUBLIC_SLUG_PATTERN.test(slug)) {
    return {
      success: false,
      reason: 'format',
    };
  }

  if (isReservedPublicSlug(slug)) {
    return {
      success: false,
      reason: 'reserved',
    };
  }

  return { success: true };
}

export function assertValidPublicSlug(slug: string): string {
  const validation = validatePublicSlug(slug);

  if (validation.success) {
    return slug;
  }

  switch (validation.reason) {
    case 'length':
      throw new ValidationError(
        `Public slug must be between ${PUBLIC_SLUG_MIN_LENGTH} and ${PUBLIC_SLUG_MAX_LENGTH} characters`
      );
    case 'format':
      throw new ValidationError(
        'Public slug must use lowercase letters, digits, and single hyphens only'
      );
    case 'reserved':
      throw new ValidationError('Public slug is reserved');
  }
}

export function normalizePublicSlug(input: string): string {
  const canonicalCandidate = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return assertValidPublicSlug(canonicalCandidate);
}
