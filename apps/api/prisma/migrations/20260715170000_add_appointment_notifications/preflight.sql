-- Read-only appointment-notification preflight.
--
-- Expected output after a correct migration and before deployment:
--   - zero malformed appointment email snapshots
--   - zero duplicate notification idempotency keys
--   - zero cross-tenant notification links
--   - zero orphan appointment references
--   - zero impossible notification state/lock combinations

-- 1) Malformed appointment email snapshots.
SELECT
  id,
  barbershop_id,
  client_email
FROM appointments
WHERE client_email IS NOT NULL
  AND client_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

-- 2) Duplicate notification idempotency keys.
SELECT
  idempotency_key,
  COUNT(*) AS duplicate_count
FROM appointment_notifications
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

-- 3) Cross-tenant notification links.
SELECT
  an.id AS notification_id,
  an.barbershop_id AS notification_barbershop_id,
  a.barbershop_id AS appointment_barbershop_id
FROM appointment_notifications an
JOIN appointments a ON a.id = an.appointment_id
WHERE an.barbershop_id IS DISTINCT FROM a.barbershop_id;

-- 4) Orphan appointment references.
SELECT
  an.id AS notification_id,
  an.appointment_id
FROM appointment_notifications an
LEFT JOIN appointments a ON a.id = an.appointment_id
WHERE a.id IS NULL;

-- 5) Impossible state/lock combinations.
SELECT
  id,
  status,
  lock_token,
  locked_at,
  sent_at,
  cancelled_at,
  attempts
FROM appointment_notifications
WHERE attempts < 0
   OR (
     status = 'PROCESSING'
     AND (lock_token IS NULL OR locked_at IS NULL)
   )
   OR (
     status <> 'PROCESSING'
     AND (lock_token IS NOT NULL OR locked_at IS NOT NULL)
   )
   OR (
     status = 'SENT'
     AND sent_at IS NULL
   )
   OR (
     status <> 'SENT'
     AND sent_at IS NOT NULL
   )
   OR (
     status = 'CANCELLED'
     AND cancelled_at IS NULL
   )
   OR (
     status <> 'CANCELLED'
     AND cancelled_at IS NOT NULL
   );
