/**
 * Preflight: identify rows that would violate the new cancellation
 * metadata CHECK constraint on the appointments table.
 *
 * Run this query against the target database before applying the
 * `20260714210000_fix_cancellation_metadata_check` migration. The
 * migration is NOT VALID on creation but VALIDATE CONSTRAINT runs
 * in the same transaction, so any pre-existing violating row will
 * cause the entire migration to roll back.
 *
 * Expected output: zero rows.
 *
 * Resolution per row:
 *   - cancelled_at IS NULL with non-NULL cancellation_source or
 *     cancelled_by_role or cancel_reason: clear the spurious
 *     values to NULL (this is the "no partial metadata when not
 *     cancelled" invariant).
 *   - cancelled_at IS NOT NULL with a classified source but a
 *     wrong role: the source is the truth; fix the role to match
 *     the source's contract, or set the source to NULL to fall
 *     back to the legacy branch.
 *   - classified cancellation metadata on status != 'CANCELLED':
 *     the source is the truth; set status = 'CANCELLED' (this is
 *     the only status compatible with cancelled_at IS NOT NULL).
 */
SELECT
  id,
  status,
  cancelled_at IS NOT NULL AS has_cancelled_at,
  cancellation_source,
  cancelled_by_role,
  cancel_reason,
  -- The condition that this row would violate under the new constraint.
  CASE
    -- Branch A violation: cancelled_at IS NULL but any cancellation
    -- metadata field is non-NULL.
    WHEN cancelled_at IS NULL
         AND (cancellation_source IS NOT NULL
              OR cancelled_by_role IS NOT NULL
              OR cancel_reason IS NOT NULL)
      THEN 'A: cancelled_at NULL with partial cancellation metadata'
    -- Branch C violation: status != 'CANCELLED' but cancelled_at
    -- is set (no live appointment can be cancelled and not CANCELLED).
    WHEN cancelled_at IS NOT NULL AND status <> 'CANCELLED'
      THEN 'C: cancelled_at set on a non-CANCELLED row'
    -- Branch C sub-rule: classified source but wrong role.
    WHEN cancellation_source = 'STAFF'
         AND cancelled_by_role IS NOT NULL
         AND cancelled_by_role NOT IN ('OWNER', 'BARBER')
      THEN 'C: STAFF source with non-staff role'
    WHEN cancellation_source = 'AUTHENTICATED_CLIENT'
         AND cancelled_by_role <> 'CLIENT'
      THEN 'C: AUTHENTICATED_CLIENT source with non-CLIENT role'
    WHEN cancellation_source IN ('PUBLIC_BOOKING', 'SYSTEM')
         AND cancelled_by_role IS NOT NULL
      THEN 'C: anonymous source (PUBLIC_BOOKING/SYSTEM) with a non-null role'
  END AS violation
FROM appointments
WHERE
  -- Branch A: must have everything NULL together.
  (cancelled_at IS NULL
     AND (cancellation_source IS NOT NULL
          OR cancelled_by_role IS NOT NULL
          OR cancel_reason IS NOT NULL))
  OR
  -- Branch C: classified metadata must be on a CANCELLED row.
  (cancelled_at IS NOT NULL AND status <> 'CANCELLED')
  OR
  (cancellation_source = 'STAFF'
     AND cancelled_by_role IS NOT NULL
     AND cancelled_by_role NOT IN ('OWNER', 'BARBER'))
  OR
  (cancellation_source = 'AUTHENTICATED_CLIENT'
     AND cancelled_by_role <> 'CLIENT')
  OR
  (cancellation_source IN ('PUBLIC_BOOKING', 'SYSTEM')
     AND cancelled_by_role IS NOT NULL);
