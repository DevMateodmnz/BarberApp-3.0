const PUBLIC_BOOKING_REFERENCE_PATTERN = /pb_[A-Z2-7]{20}/gu;
const REDACTED_PUBLIC_REFERENCE = '[public-reference]';

export function sanitizePublicApiPath(path: string): string {
  return path.replace(
    PUBLIC_BOOKING_REFERENCE_PATTERN,
    REDACTED_PUBLIC_REFERENCE
  );
}
