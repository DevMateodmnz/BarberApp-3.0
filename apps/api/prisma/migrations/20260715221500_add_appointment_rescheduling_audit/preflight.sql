-- Read-only appointment rescheduling preflight.
--
-- Expected output before deployment:
--   - zero orphan or cross-tenant appointment changes
--   - zero orphan actor references
--   - zero impossible previous/new windows
--   - zero malformed reasons beyond the varchar contract
--   - notification rows remain compatible with the enum extension

-- 1) Orphan or cross-tenant appointment-change links.
SELECT
  ac.id AS appointment_change_id,
  ac.barbershop_id AS change_barbershop_id,
  a.barbershop_id AS appointment_barbershop_id,
  ac.appointment_id
FROM appointment_changes ac
LEFT JOIN appointments a
  ON a.id = ac.appointment_id
 AND a.barbershop_id = ac.barbershop_id
WHERE a.id IS NULL;

-- 2) Orphan actor references.
SELECT
  ac.id AS appointment_change_id,
  ac.changed_by_user_id
FROM appointment_changes ac
LEFT JOIN users u
  ON u.id = ac.changed_by_user_id
WHERE u.id IS NULL;

-- 3) Impossible previous/new windows.
SELECT
  id,
  previous_start_at,
  previous_end_at,
  new_start_at,
  new_end_at
FROM appointment_changes
WHERE previous_start_at >= previous_end_at
   OR new_start_at >= new_end_at;

-- 4) Malformed reasons.
SELECT
  id,
  LENGTH(reason) AS reason_length
FROM appointment_changes
WHERE reason IS NOT NULL
  AND LENGTH(reason) > 500;

-- 5) Notification enum compatibility check.
SELECT
  id,
  type,
  status
FROM appointment_notifications
WHERE type NOT IN ('BOOKING_CONFIRMATION', 'REMINDER_24H', 'APPOINTMENT_RESCHEDULED');
