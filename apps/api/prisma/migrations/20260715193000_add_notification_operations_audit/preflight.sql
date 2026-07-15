-- Read-only notification operations preflight.
--
-- Expected output before deployment:
--   - zero orphan notifications
--   - zero cross-tenant notification relationships
--   - zero impossible retry metadata states
--   - zero duplicate or malformed attempt numbers
--   - zero orphan or cross-tenant attempt rows

-- 1) Orphan notifications.
SELECT
  an.id AS notification_id,
  an.appointment_id,
  an.barbershop_id
FROM appointment_notifications an
LEFT JOIN appointments a
  ON a.id = an.appointment_id
 AND a.barbershop_id = an.barbershop_id
WHERE a.id IS NULL;

-- 2) Cross-tenant notification relationships.
SELECT
  an.id AS notification_id,
  an.barbershop_id AS notification_barbershop_id,
  a.barbershop_id AS appointment_barbershop_id
FROM appointment_notifications an
JOIN appointments a ON a.id = an.appointment_id
WHERE an.barbershop_id IS DISTINCT FROM a.barbershop_id;

-- 3) Impossible manual retry metadata.
SELECT
  id,
  status,
  manual_retry_count,
  last_manual_retry_at,
  last_manual_retry_by_user_id
FROM appointment_notifications
WHERE manual_retry_count < 0
   OR (
     manual_retry_count = 0
     AND (last_manual_retry_at IS NOT NULL OR last_manual_retry_by_user_id IS NOT NULL)
   )
   OR (
     manual_retry_count > 0
     AND (last_manual_retry_at IS NULL OR last_manual_retry_by_user_id IS NULL)
   );

-- 4) Duplicate or malformed attempt numbers.
SELECT
  appointment_notification_id,
  attempt_number,
  COUNT(*) AS duplicate_count
FROM appointment_notification_attempts
GROUP BY appointment_notification_id, attempt_number
HAVING COUNT(*) > 1 OR attempt_number <= 0;

-- 5) Orphan or cross-tenant attempt rows.
SELECT
  ana.id AS attempt_id,
  ana.barbershop_id AS attempt_barbershop_id,
  an.barbershop_id AS notification_barbershop_id,
  ana.appointment_notification_id
FROM appointment_notification_attempts ana
LEFT JOIN appointment_notifications an
  ON an.id = ana.appointment_notification_id
WHERE an.id IS NULL
   OR ana.barbershop_id IS DISTINCT FROM an.barbershop_id;
