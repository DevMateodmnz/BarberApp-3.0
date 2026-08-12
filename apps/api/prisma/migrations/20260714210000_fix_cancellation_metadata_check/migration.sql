-- Phase 1 final gate: fix the cancellation metadata CHECK constraint.
--
-- The previous migration
-- (20260714200000_add_cancellation_metadata_check/migration.sql)
-- declared the constraint with this first branch:
--
--   (cancelled_at IS NULL) OR ...
--
-- That branch is trivially true for any row where cancelled_at is
-- NULL, regardless of whether cancellation_source,
-- cancelled_by_role, or cancel_reason have inconsistent values.
-- The constraint therefore accepted rows like
--
--   status = 'CONFIRMED'
--   cancelled_at = NULL
--   cancellation_source = 'PUBLIC_BOOKING'
--   cancelled_by_role = 'OWNER'
--
-- which the application layer never writes but which the
-- application-level rules alone cannot prevent (ad-hoc SQL,
-- future migration scripts, direct DB access during recovery).
--
-- This migration:
--   1. Drops the broken constraint.
--   2. Adds the corrected constraint in NOT VALID mode so the
--      ADD CONSTRAINT step cannot fail on pre-existing rows.
--   3. Calls VALIDATE CONSTRAINT in the SAME transaction, which
--      DOES scan existing rows. If any pre-existing row violates
--      the corrected constraint, the entire migration rolls back
--      and the constraint is removed. This is intentional and
--      correct: it forces a preflight to find and fix the rows
--      before the migration is re-applied. It is NOT a
--      harmless warning.
--
-- Preflight: see preflight.sql in this directory. Run the query
-- against the target database before applying this migration. The
-- query must return zero rows for the migration to succeed.
--
-- The corrected invariant distinguishes three states:
--
--   A. No cancellation metadata
--      cancelled_at = NULL
--      cancellation_source = NULL
--      cancelled_by_role = NULL
--      cancel_reason = NULL
--      (Active appointments and any pre-lifecycle rows.)
--
--   B. Legacy recorded cancellation (no source)
--      cancelled_at IS NOT NULL
--      cancellation_source IS NULL
--      cancelled_by_role unrestricted (NULL or populated)
--      status = 'CANCELLED'
--      (Rows written between the first and second lifecycle
--      migrations; no backfill required, accepted as-is.)
--
--   C. Fully classified cancellation
--      cancelled_at IS NOT NULL
--      cancellation_source IS NOT NULL
--      status = 'CANCELLED'
--      with the source's role contract:
--        STAFF              => cancelled_by_role IN ('OWNER', 'BARBER')
--        AUTHENTICATED_CLIENT => cancelled_by_role = 'CLIENT'
--        PUBLIC_BOOKING     => cancelled_by_role IS NULL
--        SYSTEM             => cancelled_by_role IS NULL
ALTER TABLE "appointments"
  DROP CONSTRAINT IF EXISTS "appointments_cancellation_metadata_check";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_cancellation_metadata_check"
  CHECK (
    -- A. No cancellation metadata
    (
      cancelled_at IS NULL
      AND cancellation_source IS NULL
      AND cancelled_by_role IS NULL
      AND cancel_reason IS NULL
    )
    OR
    -- B. Legacy recorded cancellation, OR C. Fully classified cancellation
    (
      cancelled_at IS NOT NULL
      AND status = 'CANCELLED'
      AND (
        -- B. Legacy: source is NULL, role unrestricted
        cancellation_source IS NULL
        OR
        -- C1. STAFF source
        (
          cancellation_source = 'STAFF'
          AND cancelled_by_role IN ('OWNER', 'BARBER')
        )
        OR
        -- C2. AUTHENTICATED_CLIENT source
        (
          cancellation_source = 'AUTHENTICATED_CLIENT'
          AND cancelled_by_role = 'CLIENT'
        )
        OR
        -- C3. PUBLIC_BOOKING or SYSTEM source (anonymous actor)
        (
          cancellation_source IN ('PUBLIC_BOOKING', 'SYSTEM')
          AND cancelled_by_role IS NULL
        )
      )
    )
  )
  NOT VALID;

-- Validate the new constraint against existing rows. If any row
-- violates the corrected invariant, the entire transaction
-- rolls back and the constraint is removed. Operators MUST run
-- preflight.sql and fix any reported rows before re-applying.
ALTER TABLE "appointments"
  VALIDATE CONSTRAINT "appointments_cancellation_metadata_check";
