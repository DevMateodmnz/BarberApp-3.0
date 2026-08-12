-- Read-only payment review preflight.
-- This file is intentionally safe to run before the review tables exist.

-- 1) REVIEW_REQUIRED rows whose reason cannot be backfilled safely.
SELECT
  id AS booking_payment_id,
  barbershop_id,
  review_reason_code,
  provider_status,
  approved_at,
  review_required_at
FROM booking_payments
WHERE status = 'REVIEW_REQUIRED'
  AND NOT (
    review_reason_code IN (
      'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY',
      'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT'
    )
    AND (COALESCE(provider_status, '') = 'approved' OR approved_at IS NOT NULL)
  );

SELECT (to_regclass('public.booking_payment_reviews') IS NOT NULL)::text AS payment_review_tables_exist \gset

\if :payment_review_tables_exist
-- 2) Duplicate logical review cases.
SELECT booking_payment_id, reason, COUNT(*) AS duplicate_count
FROM booking_payment_reviews
GROUP BY booking_payment_id, reason
HAVING COUNT(*) > 1;

-- 3) Cross-tenant payment/review links.
SELECT
  bpr.id AS review_id,
  bpr.barbershop_id AS review_barbershop_id,
  bp.barbershop_id AS payment_barbershop_id
FROM booking_payment_reviews bpr
JOIN booking_payments bp ON bp.id = bpr.booking_payment_id
WHERE bpr.barbershop_id <> bp.barbershop_id;

-- 4) Orphan actor ids.
SELECT
  review_id,
  actor_user_id
FROM booking_payment_review_actions bra
LEFT JOIN users u ON u.id = bra.actor_user_id
WHERE bra.actor_user_id IS NOT NULL
  AND u.id IS NULL;

-- 5) Resolved cases without resolution.
SELECT id AS review_id, status, resolution, resolved_at
FROM booking_payment_reviews
WHERE status = 'RESOLVED'
  AND (resolution IS NULL OR resolved_at IS NULL);

-- 6) Open/in-progress cases with resolved timestamp.
SELECT id AS review_id, status, resolution, resolved_at
FROM booking_payment_reviews
WHERE status IN ('OPEN', 'IN_PROGRESS')
  AND resolved_at IS NOT NULL;

-- 7) Duplicate or malformed actions.
SELECT review_id, action, actor_role, note, resolution, created_at
FROM booking_payment_review_actions
WHERE (action = 'RESOLVED' AND resolution IS NULL)
   OR (note IS NOT NULL AND length(trim(note)) = 0);

-- 8) Invalid notes.
SELECT id AS review_id, latest_note
FROM booking_payment_reviews
WHERE latest_note IS NOT NULL
  AND (length(trim(latest_note)) = 0 OR length(latest_note) > 1000);
\else
SELECT NULL::text AS booking_payment_id, NULL::text AS reason, NULL::bigint AS duplicate_count WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS review_barbershop_id, NULL::text AS payment_barbershop_id WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS actor_user_id WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS status, NULL::text AS resolution, NULL::timestamp AS resolved_at WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS status, NULL::text AS resolution, NULL::timestamp AS resolved_at WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS action, NULL::text AS actor_role, NULL::text AS note, NULL::text AS resolution, NULL::timestamp AS created_at WHERE FALSE;
SELECT NULL::text AS review_id, NULL::text AS latest_note WHERE FALSE;
\endif

-- 9) Provider-approved payments whose business status is overwritten ambiguously.
SELECT
  id AS booking_payment_id,
  status,
  provider_status,
  approved_at,
  review_reason_code
FROM booking_payments
WHERE status = 'REVIEW_REQUIRED'
  AND (COALESCE(provider_status, '') = 'approved' OR approved_at IS NOT NULL);
