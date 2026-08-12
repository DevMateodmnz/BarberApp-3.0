-- Read-only deposit-payment preflight.
-- Expected result: every query returns zero rows.

-- 1) Missing tenant policy rows.
SELECT b.id AS missing_barbershop_id
FROM barbershops b
LEFT JOIN barbershop_deposit_policies p
  ON p.barbershop_id = b.id
WHERE p.id IS NULL;

-- 2) Cross-tenant or orphan booking payments.
SELECT
  bp.id AS booking_payment_id,
  bp.barbershop_id AS payment_barbershop_id,
  a.barbershop_id AS appointment_barbershop_id,
  bp.appointment_id
FROM booking_payments bp
LEFT JOIN appointments a
  ON a.id = bp.appointment_id
 AND a.barbershop_id = bp.barbershop_id
WHERE a.id IS NULL;

-- 3) Duplicate active deposit payments per appointment.
SELECT
  appointment_id,
  COUNT(*) AS active_count
FROM booking_payments
WHERE purpose = 'DEPOSIT'
  AND status IN ('CREATING', 'PENDING', 'APPROVED', 'REVIEW_REQUIRED')
GROUP BY appointment_id
HAVING COUNT(*) > 1;

-- 4) Invalid money values.
SELECT
  id,
  amount_cents,
  currency,
  policy_mode_snapshot,
  policy_value_snapshot
FROM booking_payments
WHERE amount_cents <= 0
   OR currency <> 'ARS'
   OR policy_value_snapshot <= 0;

-- 5) Expired active holds still attached to non-terminal appointments.
SELECT
  a.id AS appointment_id,
  a.status,
  a.payment_hold_expires_at,
  bp.id AS booking_payment_id,
  bp.status AS booking_payment_status,
  bp.expires_at
FROM appointments a
JOIN booking_payments bp
  ON bp.appointment_id = a.id
 AND bp.barbershop_id = a.barbershop_id
WHERE a.status = 'PENDING'
  AND a.payment_hold_expires_at IS NOT NULL
  AND a.payment_hold_expires_at < CURRENT_TIMESTAMP
  AND bp.status IN ('CREATING', 'PENDING');

-- 6) Incoherent payment timestamps/statuses.
SELECT
  id,
  status,
  approved_at,
  rejected_at,
  cancelled_at,
  expired_at,
  review_required_at
FROM booking_payments
WHERE (status = 'APPROVED' AND approved_at IS NULL)
   OR (status = 'REJECTED' AND rejected_at IS NULL)
   OR (status = 'CANCELLED' AND cancelled_at IS NULL)
   OR (status = 'EXPIRED' AND expired_at IS NULL)
   OR (status = 'REVIEW_REQUIRED' AND review_required_at IS NULL);

-- 7) Plaintext-looking credential mistakes.
SELECT
  id,
  provider,
  status
FROM barbershop_payment_connections
WHERE access_token_ciphertext ILIKE 'APP_USR-%'
   OR access_token_ciphertext ILIKE 'TEST-%'
   OR refresh_token_ciphertext ILIKE 'APP_USR-%'
   OR refresh_token_ciphertext ILIKE 'TEST-%';

-- 8) Duplicate provider event keys.
SELECT
  provider,
  data_id,
  external_reference,
  COUNT(*) AS duplicate_count
FROM payment_webhook_events
GROUP BY provider, data_id, external_reference
HAVING COUNT(*) > 1;
