-- Phase 1 hardening: durable cancellation-source model.
-- Purely additive. Decouples "who cancelled" (UserRole) from "where
-- the cancellation originated" (AppointmentCancellationSource) so
-- anonymous public bookings and future automated jobs can be audited
-- without inventing a fake PUBLIC role inside the existing UserRole
-- enum.
--
-- Row invariants enforced by the application layer:
--   cancelledByRole IS NULL AND cancellationSource IN ('PUBLIC_BOOKING', 'SYSTEM')
--   cancelledByRole IS NOT NULL AND cancellationSource = 'STAFF' or 'AUTHENTICATED_CLIENT'
--
-- Existing rows from the prior lifecycle migration remain valid: both
-- columns are nullable. Legacy cancelled rows (from the first phase)
-- keep their cancelledByRole but get cancellationSource = NULL until
-- the next cancel event stamps the new column.
CREATE TYPE "AppointmentCancellationSource" AS ENUM (
  'STAFF',
  'AUTHENTICATED_CLIENT',
  'PUBLIC_BOOKING',
  'SYSTEM'
);

ALTER TABLE "appointments"
  ADD COLUMN "cancellation_source" "AppointmentCancellationSource";
